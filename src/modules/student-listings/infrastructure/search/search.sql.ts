import { Prisma } from '@prisma/client';
import type { CursorPosition } from '../../domain/search/cursor';
import {
  ListingSort,
  RADIUS_METERS_MAX,
  type GeoFilter,
  type KindFilter,
  type SearchCriteria,
} from '../../domain/search/search-criteria';
import { StudentListingKind } from '../../domain/enums/student-listing-kind.enum';

/**
 * The WHERE/ORDER BY builders for the student-listing feed.
 *
 * Callers alias `student_listings` as `l` and the nearest-branch lateral as `dist`. Everything is
 * a `Prisma.Sql` fragment with bound parameters — never string concatenation — so a listing title
 * or a district id cannot become SQL.
 */

/**
 * Who may see a listing (§7.2.0). The single source of truth: every search and count builds on
 * this, so a visibility rule is fixed in one place rather than restated per query.
 *
 * The block test is two-directional. Hiding only the blocker's view would still let the person
 * they blocked watch their listings, which is not what blocking means to either of them.
 */
export function visibleListing(viewerId: string): Prisma.Sql {
  return Prisma.sql`
    l.deleted_at IS NULL
    AND l.status = 'ACTIVE'
    AND l.valid_from IS NOT NULL AND l.valid_from <= now()
    AND l.valid_to IS NOT NULL AND l.valid_to > now()
    -- A task nobody could still deliver is noise in the list (§7.2.0).
    AND (l.kind <> 'TASK' OR l.task_deadline IS NULL OR l.task_deadline > now())
    AND EXISTS (
      SELECT 1 FROM students s WHERE s.id = l.owner_id AND s.status = 'ACTIVE'
    )
    AND NOT EXISTS (
      SELECT 1 FROM blocks bl
      WHERE (bl.blocker_id = ${viewerId} AND bl.blocked_id = l.owner_id)
         OR (bl.blocker_id = l.owner_id AND bl.blocked_id = ${viewerId})
    )
  `;
}

/**
 * The per-kind filters (§7.2.1).
 *
 * Only the fields belonging to `kind` are read: the client keeps stale parameters when the user
 * switches tabs, and §7.2.5 requires those to be ignored rather than rejected.
 *
 * Four of these are "soft" — a listing marked ANY, HYBRID or FLEXIBLE matches every request for
 * that field, because "farqi yo‘q" is an answer to the question, not a missing value. Getting one
 * of these wrong silently hides listings that should match, which is why each has its own test.
 */
export function kindFilter(
  kind: StudentListingKind,
  filter: KindFilter,
  minPrice: number | null,
  maxPrice: number | null,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`l.kind = ${kind}::"StudentListingKind"`];

  switch (kind) {
    case StudentListingKind.RENTAL:
      if (filter.gender !== null) {
        // "qizlar uchun" also matches a listing that says it does not mind.
        conditions.push(
          Prisma.sql`(l.rental_gender = ${filter.gender} OR l.rental_gender = 'ANY')`,
        );
      }
      if (filter.propertyType !== null) {
        conditions.push(Prisma.sql`l.rental_property_type = ${filter.propertyType}`);
      }
      if (filter.minRooms !== null) {
        conditions.push(Prisma.sql`l.rental_room_count >= ${filter.minRooms}`);
      }
      if (filter.onlyAvailable) {
        conditions.push(Prisma.sql`l.rental_needed_tenants > 0`);
      }
      break;

    case StudentListingKind.SERVICE:
      if (filter.serviceType !== null) {
        conditions.push(Prisma.sql`l.service_type = ${filter.serviceType}`);
      }
      if (filter.serviceFormat !== null) {
        // A hybrid tutor can teach online or in person, so they match either request.
        conditions.push(
          Prisma.sql`(l.service_format = ${filter.serviceFormat} OR l.service_format = 'HYBRID')`,
        );
      }
      if (filter.onlyFreeTrial) {
        conditions.push(Prisma.sql`l.service_has_free_trial = true`);
      }
      break;

    case StudentListingKind.JOB:
      if (filter.employment !== null) {
        conditions.push(Prisma.sql`l.job_employment = ${filter.employment}`);
      }
      if (filter.jobCategoryKey !== null) {
        conditions.push(Prisma.sql`l.job_category_key = ${filter.jobCategoryKey}`);
      }
      if (filter.shift !== null) {
        // A flexible shift fits whatever the student asked for.
        conditions.push(Prisma.sql`(l.job_shift = ${filter.shift} OR l.job_shift = 'FLEXIBLE')`);
      }
      if (filter.noExperienceOnly) {
        conditions.push(Prisma.sql`l.job_experience = 'NONE'`);
      }
      break;

    case StudentListingKind.TASK:
      if (filter.taskCategory !== null) {
        conditions.push(Prisma.sql`l.task_category = ${filter.taskCategory}`);
      }
      if (filter.taskTypeKey !== null) {
        conditions.push(Prisma.sql`l.task_type_key = ${filter.taskTypeKey}`);
      }
      if (filter.taskFormat !== null) {
        // A task marked ANY can be done either way.
        conditions.push(
          Prisma.sql`(l.task_format = ${filter.taskFormat} OR l.task_format = 'ANY')`,
        );
      }
      if (filter.onlyOpenDeadline) {
        conditions.push(Prisma.sql`l.task_deadline > now()`);
      }
      break;
  }

  if (minPrice !== null) {
    conditions.push(Prisma.sql`l.price >= ${BigInt(minPrice)}`);
  }
  if (maxPrice !== null) {
    // §7.2.1 — a negotiable listing has no comparable price, so a ceiling must not drop it.
    conditions.push(Prisma.sql`(l.price <= ${BigInt(maxPrice)} OR l.is_negotiable = true)`);
  }

  return joinAnd(conditions);
}

/** Full-text match over the haystack the mapper builds. `uz_normalize` folds Uzbek spellings. */
export function textSearch(query: string | null): Prisma.Sql {
  if (query === null || query.trim().length === 0) {
    return Prisma.empty;
  }
  return Prisma.sql`
    AND l.search_vector @@ plainto_tsquery('simple', uz_normalize(${query}))
  `;
}

/**
 * §7.2.3 — radius, administrative area and bounding box, intersected when combined.
 *
 * A listing with no pin at all survives every geo filter. That is deliberate: only an online TASK
 * can be address-less, and an online task is doable from anywhere, so excluding it would hide work
 * the student could actually take. Such rows sort last and report `distanceMeters: null`.
 */
export function geoFilter(geo: GeoFilter | null): Prisma.Sql {
  if (geo === null) {
    return Prisma.empty;
  }

  const conditions: Prisma.Sql[] = [];

  if (geo.lat !== null && geo.lng !== null && geo.radiusMeters !== null) {
    const radius = Math.min(geo.radiusMeters, RADIUS_METERS_MAX);
    conditions.push(Prisma.sql`
      ST_DWithin(
        b.geo_point,
        ST_SetSRID(ST_MakePoint(${geo.lng}, ${geo.lat}), 4326)::geography,
        ${radius}
      )
    `);
  }
  if (geo.regionIds.length > 0) {
    conditions.push(Prisma.sql`b.region_id IN (${Prisma.join(geo.regionIds)})`);
  }
  if (geo.districtIds.length > 0) {
    conditions.push(Prisma.sql`b.district_id IN (${Prisma.join(geo.districtIds)})`);
  }
  if (geo.bbox !== null) {
    const { minLng, minLat, maxLng, maxLat } = geo.bbox;
    conditions.push(Prisma.sql`
      ST_Intersects(
        b.geo_point,
        ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)::geography
      )
    `);
  }

  if (conditions.length === 0) {
    return Prisma.empty;
  }

  // EXISTS, not a join: a listing with three matching pins must appear once, not three times.
  return Prisma.sql`
    AND (
      EXISTS (
        SELECT 1 FROM student_listing_branches b
        WHERE b.listing_id = l.id AND ${joinAnd(conditions)}
      )
      OR NOT EXISTS (
        SELECT 1 FROM student_listing_branches nb WHERE nb.listing_id = l.id
      )
    )
  `;
}

/** True when the request can actually compute a distance. */
export function hasGeoPoint(geo: GeoFilter | null): geo is GeoFilter {
  return geo !== null && geo.lat !== null && geo.lng !== null;
}

/**
 * The nearest-pin distance, as a lateral so a listing is still one row.
 *
 * `LEFT JOIN` rather than an inner one: an address-less listing has no distance, and dropping it
 * here would undo the exception `geoFilter` just made for it.
 */
export function distanceLateral(geo: GeoFilter | null): Prisma.Sql {
  if (!hasGeoPoint(geo)) {
    return Prisma.sql`LEFT JOIN LATERAL (SELECT NULL::double precision AS d) dist ON TRUE`;
  }
  return Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT MIN(
        ST_Distance(
          b.geo_point,
          ST_SetSRID(ST_MakePoint(${geo.lng}, ${geo.lat}), 4326)::geography
        )
      ) AS d
      FROM student_listing_branches b
      WHERE b.listing_id = l.id
    ) dist ON TRUE
  `;
}

/**
 * §7.2.2 — the effective sort.
 *
 * NEAREST without a coordinate quietly becomes NEWEST rather than erroring: the app sends the sort
 * with the tab and the coordinate with the permission, and the two do not arrive together.
 * RELEVANCE is NEWEST until the university ranking ships (§7.2.4).
 */
export function effectiveSort(sort: ListingSort, geo: GeoFilter | null): ListingSort {
  if (sort === ListingSort.NEAREST && !hasGeoPoint(geo)) {
    return ListingSort.NEWEST;
  }
  if (sort === ListingSort.RELEVANCE) {
    return ListingSort.NEWEST;
  }
  return sort;
}

/** The column each sort keys on, also selected so the next cursor can be built from the last row. */
export function sortValueExpression(sort: ListingSort): Prisma.Sql {
  switch (sort) {
    case ListingSort.PRICE_ASC:
    case ListingSort.PRICE_DESC:
      return Prisma.sql`l.price::text`;
    case ListingSort.NEAREST:
      return Prisma.sql`dist.d::text`;
    case ListingSort.DEADLINE:
      return Prisma.sql`to_char(l.task_deadline AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    default:
      return Prisma.sql`to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  }
}

/** Every order ends in `l.id DESC` so equal-valued rows cannot shuffle between pages (§7.2.2). */
export function orderBy(sort: ListingSort): Prisma.Sql {
  switch (sort) {
    case ListingSort.PRICE_ASC:
      return Prisma.sql`ORDER BY l.price ASC, l.id DESC`;
    case ListingSort.PRICE_DESC:
      return Prisma.sql`ORDER BY l.price DESC, l.id DESC`;
    case ListingSort.NEAREST:
      // Address-less listings last, never dropped (§7.2.3).
      return Prisma.sql`ORDER BY dist.d ASC NULLS LAST, l.id DESC`;
    case ListingSort.DEADLINE:
      return Prisma.sql`ORDER BY l.task_deadline ASC NULLS LAST, l.id DESC`;
    default:
      return Prisma.sql`ORDER BY l.created_at DESC, l.id DESC`;
  }
}

/**
 * Keyset predicate resuming exactly where the previous page stopped.
 *
 * Spelled out per sort rather than as a row-value comparison because the directions are mixed —
 * `price ASC, id DESC` — and `(a, b) > (x, y)` cannot express that.
 */
export function cursorCondition(sort: ListingSort, position: CursorPosition): Prisma.Sql {
  const { id } = position;
  const value = position.sortValue;

  switch (sort) {
    case ListingSort.PRICE_ASC:
      return Prisma.sql`AND (l.price > ${toBigInt(value)} OR (l.price = ${toBigInt(value)} AND l.id < ${id}))`;
    case ListingSort.PRICE_DESC:
      return Prisma.sql`AND (l.price < ${toBigInt(value)} OR (l.price = ${toBigInt(value)} AND l.id < ${id}))`;
    case ListingSort.NEAREST:
      return nullsLastCondition(Prisma.sql`dist.d`, value === null ? null : Number(value), id);
    case ListingSort.DEADLINE:
      return nullsLastCondition(
        Prisma.sql`l.task_deadline`,
        value === null ? null : String(value),
        id,
        true,
      );
    default:
      return Prisma.sql`AND (l.created_at < ${new Date(String(value))} OR (l.created_at = ${new Date(String(value))} AND l.id < ${id}))`;
  }
}

/**
 * Resume predicate for an ascending sort with NULLS LAST. Once the cursor sits in the null tail
 * only ids can separate rows; before it, the null tail is still ahead and must be included.
 */
function nullsLastCondition(
  column: Prisma.Sql,
  value: number | string | null,
  id: string,
  isTimestamp = false,
): Prisma.Sql {
  if (value === null) {
    return Prisma.sql`AND (${column} IS NULL AND l.id < ${id})`;
  }
  const bound = isTimestamp ? Prisma.sql`${new Date(String(value))}` : Prisma.sql`${value}`;
  return Prisma.sql`
    AND (
      ${column} > ${bound}
      OR (${column} = ${bound} AND l.id < ${id})
      OR ${column} IS NULL
    )
  `;
}

function toBigInt(value: string | number | null): bigint {
  return BigInt(value === null ? 0 : Math.trunc(Number(value)));
}

/** Joins conditions with AND. An empty list is `TRUE` so the caller never emits a dangling WHERE. */
function joinAnd(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) {
    return Prisma.sql`TRUE`;
  }
  return conditions.reduce((left, right) => Prisma.sql`${left} AND ${right}`);
}

/**
 * The whole search query: one row per listing, `size + 1` rows so `hasNext` needs no extra count.
 *
 * `offset` selects the page-number mode of §7.2.2. It is the weaker of the two — a listing
 * published mid-scroll shifts every later row — which is why the cursor is the primary path and
 * this exists only for "jump to page N".
 */
export function searchQuery(
  criteria: SearchCriteria,
  position: CursorPosition | null,
  offset = 0,
): Prisma.Sql {
  const sort = effectiveSort(criteria.sort, criteria.geo);
  return Prisma.sql`
    SELECT
      l.id,
      dist.d AS distance_meters,
      ${sortValueExpression(sort)} AS sort_value
    FROM student_listings l
    ${distanceLateral(criteria.geo)}
    WHERE ${visibleListing(criteria.viewerId)}
      AND ${kindFilter(criteria.kind, criteria.filter, criteria.minPrice, criteria.maxPrice)}
      ${textSearch(criteria.query)}
      ${geoFilter(criteria.geo)}
      ${position === null ? Prisma.empty : cursorCondition(sort, position)}
    ${orderBy(sort)}
    LIMIT ${criteria.size + 1}
    ${offset > 0 ? Prisma.sql`OFFSET ${offset}` : Prisma.empty}
  `;
}

/**
 * The unpaginated total, for page-number mode only.
 *
 * Deliberately not run in cursor mode: on a growing table this COUNT is the most expensive part of
 * an otherwise cheap query, and the infinite scroll never displays it.
 */
export function searchCountQuery(criteria: SearchCriteria): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::int AS total
    FROM student_listings l
    WHERE ${visibleListing(criteria.viewerId)}
      AND ${kindFilter(criteria.kind, criteria.filter, criteria.minPrice, criteria.maxPrice)}
      ${textSearch(criteria.query)}
      ${geoFilter(criteria.geo)}
  `;
}
