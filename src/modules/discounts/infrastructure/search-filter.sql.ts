import { Prisma } from '@prisma/client';
import type { GeoBox } from '../../../common/geo/geo-box';
import type { GeoScope } from '../../../common/geo/geo-scope';
import type { FeedClock } from '../domain/feed-time';
import type {
  AttributeFilter,
  SearchFilter,
  SortBy,
  SortDirection,
} from '../domain/search.repository';
import { VISIBLE_LISTING } from './visible-scope.sql';

/** One `(business type, category key)` a synonym resolved to — the pair, because `ALL`/`OTHER` (and
 * `VIP`, `KIDS`, …) repeat across types, so a bare category key would leak matches into a
 * neighbouring type (D2). */
export interface SynonymPair {
  businessType: string;
  categoryKey: string;
}

/**
 * WHERE for the feed search: the Q4 visibility rules plus every filter of §4 the LIST/COUNT slice
 * supports. Callers alias `listings` as `l` and `businesses` as `b`, exactly like
 * {@link cardSelect} — nothing here touches `bt`, `cat` or the nearest-branch lateral, so the same
 * clause also drives the bare count query.
 *
 * `clock` is the request's own Tashkent time, passed in rather than read here so the predicate stays
 * a pure function of its arguments — and so `availability.openNow` and the card's `isOpenNow` badge
 * answer for the very same instant within one request.
 *
 * Deliberately NOT supported here (each is another slice, and 422-ing on an unknown body field is
 * louder than silently returning unfiltered rows):
 *   · `filter.options`        — D13, `OptionGroup.name` is free text and unusable as a filter key
 *   · `tradeCenterIds`, `inTradeCenterOnly` — no slice claims them yet
 */
export function searchWhere(
  filter: SearchFilter,
  studentId: string | null,
  synonyms: SynonymPair[],
  clock: FeedClock,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [VISIBLE_LISTING];

  // A catalog group with no business type yet expands to nothing. That is a legitimate empty
  // result, not a client error — but `IN ()` is a syntax error, so it is spelled out.
  conditions.push(
    filter.types.length === 0
      ? Prisma.sql`false`
      : Prisma.sql`b.type IN (${Prisma.join(filter.types)})`,
  );

  const category = categoryCondition(filter);
  if (category !== null) {
    conditions.push(category);
  }

  const customCategory = customCategoryCondition(filter);
  if (customCategory !== null) {
    conditions.push(customCategory);
  }

  if (filter.businessIds.length > 0) {
    conditions.push(Prisma.sql`l.business_id IN (${Prisma.join(filter.businessIds)})`);
  }
  if (filter.branchIds.length > 0) {
    conditions.push(branchExists(Prisma.sql`br.id IN (${Prisma.join(filter.branchIds)})`));
  }
  if (filter.listingIds.length > 0) {
    conditions.push(Prisma.sql`l.id IN (${Prisma.join(filter.listingIds)})`);
  }
  if (filter.excludeListingIds.length > 0) {
    conditions.push(Prisma.sql`l.id NOT IN (${Prisma.join(filter.excludeListingIds)})`);
  }
  if (filter.query !== null) {
    conditions.push(textCondition(filter.query, synonyms));
  }

  conditions.push(...geoConditions(filter));
  conditions.push(...priceConditions(filter));
  conditions.push(...kindConditions(filter));
  conditions.push(...redemptionConditions(filter));
  conditions.push(...flagConditions(filter, studentId));
  conditions.push(...availabilityConditions(filter, clock));

  const attributes = attributesCondition(filter);
  if (attributes !== null) {
    conditions.push(attributes);
  }

  return Prisma.join(conditions, ' AND ');
}

/**
 * Total matching listings, for `hasNext` and for COUNT mode. Same joins the WHERE needs and no
 * more: no lateral, no category label, so paging a 20-row page never pays for the whole set.
 */
export function countQuery(where: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM listings l
    JOIN businesses b ON b.id = l.business_id
    WHERE ${where}
  `;
}

/**
 * ORDER BY per §6. Every branch ends in `l.id ASC`: without that tie-break, rows with equal sort
 * values reshuffle between OFFSETs and a listing shows up twice — or never (§12.8).
 *
 * DISCOUNT_PERCENT and SAVED_AMOUNT sort NULLS LAST so regular listings sink to the bottom instead
 * of dropping out of the page (Q0).
 */
export function searchOrderBy(
  by: SortBy,
  direction: SortDirection,
  query: string | null,
): Prisma.Sql {
  const dir = direction === 'ASC' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const newest = Prisma.sql`l.created_at ${dir}`;

  const order = ((): Prisma.Sql => {
    switch (by) {
      case 'DISTANCE':
        return Prisma.sql`nb.branch_distance_meters ${dir} NULLS LAST`;
      case 'DISCOUNT_PERCENT':
        return Prisma.sql`l.discount_percent ${dir} NULLS LAST`;
      case 'SAVED_AMOUNT':
        return Prisma.sql`(CASE WHEN l.is_discount THEN l.original_price - l.final_price END) ${dir} NULLS LAST`;
      case 'PRICE_FINAL':
        return Prisma.sql`l.final_price ${dir}`;
      case 'PRICE_ORIGINAL':
        return Prisma.sql`l.original_price ${dir}`;
      case 'ENDING_SOON':
        return Prisma.sql`l.valid_to ${dir}`;
      case 'POPULAR':
        return Prisma.sql`l.views_count ${dir}`;
      case 'RELEVANCE':
        // "Falls back to NEWEST when there is no query" (§6) — every row would rank 0 otherwise.
        return query === null
          ? newest
          : Prisma.sql`ts_rank(l.search_vector, ${prefixTsQuery(query)}) ${dir}`;
      case 'NEWEST':
        return newest;
    }
  })();

  return Prisma.sql`${order}, l.id ASC`;
}

/**
 * Category keys the query text hits through `catalog_synonyms` — "osh" finds every PALOV listing,
 * including "Choyxona seti — 2 kishiga" whose title never says "osh" (§7).
 *
 * Terms are compared after `uz_normalize` on both sides, so the stored "lag'mon" answers "lagmon".
 * Matching is per word: the table holds single-word terms, and requiring the whole phrase would
 * make "osh yeyish" miss.
 */
export function synonymPairQuery(types: string[], query: string): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT s.business_type AS "businessType", s.category_key AS "categoryKey"
    FROM catalog_synonyms s
    WHERE s.business_type IN (${Prisma.join(types)})
      AND uz_normalize(s.term) = ANY(
            string_to_array(regexp_replace(uz_normalize(${query}), '[^a-z0-9]+', ' ', 'g'), ' '))
  `;
}

/**
 * `to_tsquery('simple', 'osh:* & vip:*')`, built inside SQL so the query folds through the very
 * same `uz_normalize` that produced `search_vector` — normalising in TypeScript would drift.
 *
 * Prefix (`:*`), not substring: "osh" must match "Oshxona" but never "Toshkent" or "boshqa" (D7).
 * The regexp strips everything outside `[a-z0-9]`, so no tsquery metacharacter (`&`, `|`, `!`,
 * `(`, `)`, `:`, `*`) from user input can ever reach the parser.
 *
 * The scalar subquery does not reference the outer row, so Postgres evaluates it once per
 * statement (an InitPlan), not per row.
 */
export function prefixTsQuery(query: string): Prisma.Sql {
  return Prisma.sql`to_tsquery('simple', (
    SELECT string_agg(word || ':*', ' & ')
    FROM regexp_split_to_table(regexp_replace(uz_normalize(${query}), '[^a-z0-9]+', ' ', 'g'), ' ')
      AS word
    WHERE word <> ''))`;
}

/**
 * Whether a raw query string can yield any lexeme at all. A query of pure punctuation normalises to
 * nothing, `to_tsquery` then returns NULL and `@@ NULL` silently drops every row — so the caller
 * treats such input as "no text filter" instead.
 */
export function hasSearchableText(query: string): boolean {
  return /[\p{L}\p{N}]/u.test(query);
}

/**
 * `categoryKey = 'ALL'` means "the whole menu", so it answers a request for any category of its
 * type (§12.18). With `includeAllCategory: false` those listings are excluded outright — including
 * when no category was named, which is the only reading under which the flag does anything there.
 */
function categoryCondition(filter: SearchFilter): Prisma.Sql | null {
  if (!filter.includeAllCategory) {
    return filter.categoryKeys.length === 0
      ? Prisma.sql`l.category_key <> 'ALL'`
      : Prisma.sql`(l.category_key IN (${Prisma.join(filter.categoryKeys)}) AND l.category_key <> 'ALL')`;
  }
  if (filter.categoryKeys.length === 0) {
    return null;
  }
  return Prisma.sql`(l.category_key IN (${Prisma.join(filter.categoryKeys)}) OR l.category_key = 'ALL')`;
}

/**
 * `includeCustomCategories: false` drops listings whose category is the free-text "OTHER" one.
 * They carry a `customCategoryName` the catalog knows nothing about, so a student who wants only
 * catalogued offers has no other way to exclude them.
 */
function customCategoryCondition(filter: SearchFilter): Prisma.Sql | null {
  return filter.includeCustomCategories ? null : Prisma.sql`l.custom_category_name IS NULL`;
}

/** Text match, or a category the synonyms resolved to. */
function textCondition(query: string, synonyms: SynonymPair[]): Prisma.Sql {
  const matches: Prisma.Sql[] = [Prisma.sql`l.search_vector @@ ${prefixTsQuery(query)}`];
  if (synonyms.length > 0) {
    const pairs = synonyms.map((pair) => Prisma.sql`(${pair.businessType}, ${pair.categoryKey})`);
    matches.push(Prisma.sql`(b.type, l.category_key) IN (${Prisma.join(pairs)})`);
  }
  return Prisma.sql`(${Prisma.join(matches, ' OR ')})`;
}

/**
 * EXISTS, never a join: a listing with three branches inside the radius must still be one row —
 * the same reason `visible-scope.sql.ts` counts with EXISTS.
 */
function branchExists(condition: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM listing_branches lb
    JOIN branches br ON br.id = lb.branch_id AND br.is_active = true
    WHERE lb.listing_id = l.id AND ${condition})`;
}

/**
 * Radius test on a branch aliased `br`. Exported because the MAP projection applies the very same
 * predicate to the marker's OWN branch: a listing may reach into the view through one branch while
 * another sits 300 km away, and that far one must not be drawn (§8.2).
 */
export function branchWithinRadius(point: GeoScope): Prisma.Sql {
  return Prisma.sql`br.geo_point IS NOT NULL
    AND ST_DWithin(
          br.geo_point,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
          ${point.radiusMeters})`;
}

/**
 * Viewport test on a branch aliased `br`. `ST_MakeEnvelope` takes x before y, i.e. lng before lat.
 *
 * `&&` rather than `ST_Intersects`: for a point against a rectangle the bounding-box overlap IS
 * containment (inclusive on the edges), and the operator is answered straight from the GiST index.
 */
export function branchWithinBox(box: GeoBox): Prisma.Sql {
  return Prisma.sql`br.geo_point IS NOT NULL
    AND br.geo_point && ST_MakeEnvelope(
          ${box.minLng}, ${box.minLat}, ${box.maxLng}, ${box.maxLat}, 4326)::geography`;
}

function geoConditions(filter: SearchFilter): Prisma.Sql[] {
  const { point, bbox, regionIds, districtIds, onlineOnly } = filter.geo;
  const conditions: Prisma.Sql[] = [];

  if (point !== null) {
    conditions.push(branchExists(branchWithinRadius(point)));
  }
  if (bbox !== null) {
    conditions.push(branchExists(branchWithinBox(bbox)));
  }
  if (regionIds.length > 0) {
    conditions.push(branchExists(Prisma.sql`br.region_id IN (${Prisma.join(regionIds)})`));
  }
  if (districtIds.length > 0) {
    conditions.push(branchExists(Prisma.sql`br.district_id IN (${Prisma.join(districtIds)})`));
  }
  if (onlineOnly) {
    conditions.push(Prisma.sql`b.is_online_only = true`);
  }
  return conditions;
}

function priceConditions(filter: SearchFilter): Prisma.Sql[] {
  const { min, max, basis, units } = filter.price;
  const column = basis === 'ORIGINAL' ? Prisma.sql`l.original_price` : Prisma.sql`l.final_price`;
  const conditions: Prisma.Sql[] = [];

  if (min !== null) {
    conditions.push(Prisma.sql`${column} >= ${min}`);
  }
  if (max !== null) {
    conditions.push(Prisma.sql`${column} <= ${max}`);
  }
  if (units.length > 0) {
    // `::text` on the column rather than a cast of the parameter: an unknown unit then matches
    // nothing instead of raising "invalid input value for enum".
    conditions.push(Prisma.sql`l.price_unit::text IN (${Prisma.join(units)})`);
  }
  return conditions;
}

/** `listingKind` + the discount filters, which only regular-excluding rows can satisfy (Q0). */
function kindConditions(filter: SearchFilter): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];

  if (filter.listingKind === 'DISCOUNT') {
    conditions.push(Prisma.sql`l.is_discount = true`);
  }
  if (filter.listingKind === 'REGULAR') {
    conditions.push(Prisma.sql`l.is_discount = false`);
  }

  const { types, minPercent, maxPercent, minSavedAmount } = filter.discount;
  if (types.length > 0) {
    conditions.push(
      Prisma.sql`(l.is_discount = true AND l.discount_type::text IN (${Prisma.join(types)}))`,
    );
  }
  if (minPercent !== null) {
    // `discount_percent` is NULL on a regular listing, so the comparison excludes them by itself.
    conditions.push(Prisma.sql`l.discount_percent >= ${minPercent}`);
  }
  if (maxPercent !== null) {
    conditions.push(Prisma.sql`l.discount_percent <= ${maxPercent}`);
  }
  if (minSavedAmount !== null) {
    conditions.push(
      Prisma.sql`(l.is_discount = true AND (l.original_price - l.final_price) >= ${minSavedAmount})`,
    );
  }
  return conditions;
}

function redemptionConditions(filter: SearchFilter): Prisma.Sql[] {
  const { methods, hasPromoCode, onlyAvailable } = filter.redemption;
  const conditions: Prisma.Sql[] = [];

  if (methods.length > 0) {
    conditions.push(Prisma.sql`l.redemption_method::text IN (${Prisma.join(methods)})`);
  }
  if (hasPromoCode !== null) {
    conditions.push(
      hasPromoCode ? Prisma.sql`l.promo_code IS NOT NULL` : Prisma.sql`l.promo_code IS NULL`,
    );
  }
  if (onlyAvailable) {
    conditions.push(Prisma.sql`(l.total_limit IS NULL OR l.used_count < l.total_limit)`);
  }
  return conditions;
}

function flagConditions(filter: SearchFilter, studentId: string | null): Prisma.Sql[] {
  const { withImagesOnly, favoritesOnly, hasDeliveryOnly, newOnly } = filter.flags;
  const conditions: Prisma.Sql[] = [];

  if (withImagesOnly) {
    conditions.push(Prisma.sql`COALESCE(cardinality(l.images), 0) > 0`);
  }
  if (favoritesOnly) {
    // The service rejects `favoritesOnly` without a student token; `false` keeps a stray call from
    // quietly returning everyone's listings.
    conditions.push(
      studentId === null
        ? Prisma.sql`false`
        : Prisma.sql`EXISTS (SELECT 1 FROM student_favorites sf
                              WHERE sf.listing_id = l.id AND sf.student_id = ${studentId})`,
    );
  }
  if (hasDeliveryOnly) {
    // D12: the listing's own claim, never `Branch.deliveryZone`.
    conditions.push(Prisma.sql`l.attributes->>'hasDelivery' = 'true'`);
  }
  if (newOnly) {
    conditions.push(Prisma.sql`l.created_at >= now() - interval '7 days'`);
  }
  return conditions;
}

/**
 * §4 `availability` — opening hours and the validity window (D11).
 *
 * `openNow` and `onDay`/`atTime` ask two different questions, so both apply when both arrive: "open
 * right now" AND "open on Saturday at 19:30".
 *
 * `validAt` is ANDed onto {@link VISIBLE_LISTING} rather than replacing the `now()` window inside
 * it: that constant is Q4's single source of truth and is shared with the facet queries, so its
 * meaning must not shift per request. The result is the intersection — a listing must be visible
 * now (ACTIVE, APPROVED, live) *and* valid at the instant asked about.
 */
function availabilityConditions(filter: SearchFilter, clock: FeedClock): Prisma.Sql[] {
  const { openNow, openAt, validAt, endingWithinHours } = filter.availability;
  const conditions: Prisma.Sql[] = [];

  if (openNow) {
    conditions.push(branchExists(openAtExpr(clock)));
  }
  if (openAt !== null) {
    conditions.push(branchExists(openAtExpr(openAt)));
  }
  if (validAt !== null) {
    conditions.push(Prisma.sql`(l.valid_from <= ${validAt} AND l.valid_to >= ${validAt})`);
  }
  if (endingWithinHours !== null) {
    // Read together with the visibility window above: "still live, but over within N hours".
    conditions.push(
      Prisma.sql`l.valid_to <= now() + make_interval(hours => ${endingWithinHours}::int)`,
    );
  }
  return conditions;
}

/**
 * Whether the branch aliased `br` is open at `clock`, evaluated against `branch_working_hours`.
 *
 * These are literally the three arms of `isOpenNowExpr` in `discount-card.sql.ts`, which computes
 * the card's `isOpenNow` badge: the same table, the same arms in the same order, the same
 * open-inclusive / close-exclusive boundaries — only the branch is read as `br.id` instead of the
 * card's nearest-branch alias. They must not drift: a listing kept by `openNow: true` whose card
 * then says "yopiq" is the one bug this filter can produce, so `search-filter.sql.spec.ts` compares
 * the two SQL texts.
 *
 * The third arm is the one that is easy to miss: a venue open 20:00–04:00 is still open at 02:00,
 * but those hours live on the PREVIOUS day's row.
 */
function openAtExpr(clock: FeedClock): Prisma.Sql {
  return Prisma.sql`
    EXISTS (
      SELECT 1 FROM branch_working_hours wh
      WHERE wh.branch_id = br.id
        AND wh.is_closed = false
        AND wh.open_minute IS NOT NULL
        AND wh.close_minute IS NOT NULL
        AND (
             (wh.day = ${clock.day}::"DayOfWeek" AND NOT wh.spans_midnight
                AND ${clock.minuteOfDay} >= wh.open_minute AND ${clock.minuteOfDay} < wh.close_minute)
          OR (wh.day = ${clock.day}::"DayOfWeek" AND wh.spans_midnight
                AND ${clock.minuteOfDay} >= wh.open_minute)
          OR (wh.day = ${clock.previousDay}::"DayOfWeek" AND wh.spans_midnight
                AND ${clock.minuteOfDay} < wh.close_minute)
        )
    )
  `;
}

function attributesCondition(filter: SearchFilter): Prisma.Sql | null {
  if (filter.attributes.length === 0) {
    return null;
  }
  const parts = filter.attributes.map(attributeCondition);
  const glue = filter.attributesMatch === 'ANY' ? ' OR ' : ' AND ';
  return Prisma.sql`(${Prisma.join(parts, glue)})`;
}

/**
 * One attribute condition — the whole of §5 in a single generic builder, so a new catalog attribute
 * needs no backend change (Q6).
 *
 * Everything in `listings.attributes` is TEXT (the mobile client writes `Map<String,String>`), so
 * numeric operators cast, and a value that does not look like a number must never reach the cast —
 * see {@link numericValue}. A missing key yields NULL, which fails every positive operator and, via
 * `COALESCE(..., false)`, satisfies the negative ones.
 */
function attributeCondition(attribute: AttributeFilter): Prisma.Sql {
  const { key, op, values } = attribute;
  const text = Prisma.sql`l.attributes->>${key}`;

  // The service rejects an operator that arrives without its operand; an operand-less list or range
  // would still be a syntax error here (`IN ()`, `()`), so it is stopped again.
  const listOperator = op === 'IN' || op === 'NOT_IN' || op === 'ANY' || op === 'ALL';
  const emptyRange = op === 'BETWEEN' && attribute.min === null && attribute.max === null;
  if ((listOperator && values.length === 0) || emptyRange) {
    return Prisma.sql`false`;
  }

  switch (op) {
    case 'EQ':
      return equalityCondition(attribute);
    case 'NEQ':
      return negate(equalityCondition(attribute));
    case 'IN':
      return Prisma.sql`${text} IN (${Prisma.join(values)})`;
    case 'NOT_IN':
      return negate(Prisma.sql`${text} IN (${Prisma.join(values)})`);
    case 'BETWEEN':
      return betweenCondition(attribute);
    case 'GTE':
      return Prisma.sql`${numericValue(key)} >= ${attribute.number}`;
    case 'LTE':
      return Prisma.sql`${numericValue(key)} <= ${attribute.number}`;
    case 'CONTAINS':
      // `uz_normalize` on both sides makes it case-insensitive and apostrophe/script agnostic;
      // `position` avoids having to escape LIKE's `%` and `_` out of user input.
      return Prisma.sql`position(uz_normalize(${attribute.text}) IN uz_normalize(COALESCE(${text}, ''))) > 0`;
    case 'ANY':
      return Prisma.sql`${tagArray(key)} && ${tagList(values)}`;
    case 'ALL':
      return Prisma.sql`${tagArray(key)} @> ${tagList(values)}`;
    case 'EXISTS':
      return Prisma.sql`COALESCE(${text}, '') <> ''`;
  }
}

/** EQ against whichever operand was sent: boolean and number compare as such, the rest as text. */
function equalityCondition(attribute: AttributeFilter): Prisma.Sql {
  const { key, boolean: bool, number } = attribute;
  if (bool !== null) {
    // BOOLEAN attributes are stored as the strings "true"/"false".
    return Prisma.sql`lower(COALESCE(l.attributes->>${key}, '')) = ${bool ? 'true' : 'false'}`;
  }
  if (number !== null) {
    return Prisma.sql`${numericValue(key)} = ${number}`;
  }
  return Prisma.sql`l.attributes->>${key} = ${attribute.text}`;
}

function betweenCondition(attribute: AttributeFilter): Prisma.Sql {
  const value = numericValue(attribute.key);
  const bounds: Prisma.Sql[] = [];
  if (attribute.min !== null) {
    bounds.push(Prisma.sql`${value} >= ${attribute.min}`);
  }
  if (attribute.max !== null) {
    bounds.push(Prisma.sql`${value} <= ${attribute.max}`);
  }
  return Prisma.sql`(${Prisma.join(bounds, ' AND ')})`;
}

/** NOT over a possibly-NULL test: a listing missing the key counts as "not equal" / "not in". */
function negate(condition: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(NOT COALESCE(${condition}, false))`;
}

/**
 * The numeric reading of a TEXT attribute, or NULL when it does not look like a number. CASE (not
 * two ANDed conditions) because Postgres may reorder AND operands and evaluate the cast first —
 * one "Yengil" in a `spicyLevel` column would then fail the whole request with 22P02.
 */
function numericValue(key: string): Prisma.Sql {
  return Prisma.sql`(CASE WHEN l.attributes->>${key} ~ '^-?[0-9]+(\\.[0-9]+)?$'
                          THEN (l.attributes->>${key})::numeric END)`;
}

/**
 * A TAGS/MULTI_SELECT value as an array. They stay comma-joined text in the DB — the mobile client
 * writes them that way and changing it would break the write path (D10). The whitespace fold is
 * ours: "CS2, Dota 2" must answer a filter for "dota 2".
 */
function tagArray(key: string): Prisma.Sql {
  return Prisma.sql`string_to_array(
    btrim(regexp_replace(lower(COALESCE(l.attributes->>${key}, '')), '\\s*,\\s*', ',', 'g')), ',')`;
}

/** The filter's own tags, folded the same way and passed as one parameter rather than an array. */
function tagList(values: string[]): Prisma.Sql {
  const joined = values.map((value) => value.trim().toLowerCase()).join(',');
  return Prisma.sql`string_to_array(${joined}, ',')`;
}
