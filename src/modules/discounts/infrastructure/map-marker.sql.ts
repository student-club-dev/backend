import { Prisma } from '@prisma/client';
import type { GeoFilter } from '../domain/search.repository';
import { branchWithinBox, branchWithinRadius } from './search-filter.sql';

/** One row of the marker query, before mapping into {@link MapMarker}. */
export interface MapMarkerRow {
  listing_id: string;
  branch_id: string;
  lat: number;
  lng: number;
  final_price: bigint;
  is_discount: boolean;
  discount_type: string;
  discount_value: bigint;
  discount_percent: number | null;
  business_type: string;
  accent_color: string | null;
  is_favorite: boolean;
}

/**
 * MAP's projection (§8.2). The same WHERE as LIST — `searchWhere` is reused untouched — but joined
 * through `listing_branches` instead of the nearest-branch lateral, so a listing offered at three
 * branches yields three rows sharing one `listingId` (§12.11).
 *
 * Callers append `WHERE <searchWhere> AND <markerInView>` — the second predicate is what keeps the
 * pin itself inside the viewport, since `searchWhere`'s geo test only asks that SOME branch is.
 */
export function markerSelect(studentId: string | null): Prisma.Sql {
  const favourite =
    studentId === null
      ? Prisma.sql`false`
      : Prisma.sql`EXISTS (SELECT 1 FROM student_favorites sf
                            WHERE sf.listing_id = l.id AND sf.student_id = ${studentId})`;

  return Prisma.sql`
    SELECT
      l.id                      AS listing_id,
      br.id                     AS branch_id,
      br.lat, br.lng,
      l.final_price, l.is_discount,
      l.discount_type::text     AS discount_type,
      l.discount_value, l.discount_percent,
      b.type                    AS business_type,
      bt.accent_color,
      ${favourite}              AS is_favorite
    ${MARKER_FROM}
    JOIN business_types bt ON bt.type = b.type
  `;
}

/**
 * Markers (listing × branch) in the viewport — the `markersTotal` of D15, which is a different
 * number from `countQuery`'s listing total and must be counted separately.
 */
export function markerCountQuery(where: Prisma.Sql, inView: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::int AS count
    ${MARKER_FROM}
    WHERE ${where} AND ${inView}
  `;
}

/**
 * The pin's own branch must sit in the requested view. Both arms apply when the client sends a box
 * and a point; the service has already refused a MAP request that sends neither, and `true` keeps
 * the SQL valid for any other caller.
 */
export function markerInView(geo: GeoFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (geo.bbox !== null) {
    conditions.push(branchWithinBox(geo.bbox));
  }
  if (geo.point !== null) {
    conditions.push(branchWithinRadius(geo.point));
  }
  return conditions.length === 0 ? Prisma.sql`true` : Prisma.join(conditions, ' AND ');
}

/** Shared by the projection and the marker count so the two can never count different rows. */
const MARKER_FROM = Prisma.sql`
  FROM listings l
  JOIN businesses b        ON b.id = l.business_id
  JOIN listing_branches lb ON lb.listing_id = l.id
  JOIN branches br         ON br.id = lb.branch_id AND br.is_active = true
`;

/**
 * Not a ranking — §6's sorts are meaningless on a map. It only makes the cut deterministic: without
 * an order, which markers survive `LIMIT` would change between two identical requests.
 */
export const MARKER_ORDER_BY: Prisma.Sql = Prisma.sql`l.id ASC, br.id ASC`;
