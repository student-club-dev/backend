import { Prisma } from '@prisma/client';
import type { GeoScope } from '../../../common/geo/geo-scope';
import type { FeedClock } from '../domain/feed-time';

/** One row of the card query, before mapping into {@link DiscountCard}. */
export interface DiscountCardRow {
  id: string;
  business_id: string;
  business_name: string;
  business_logo_url: string | null;
  business_type: string;
  group_key: string;
  category_key: string;
  category_label: string | null;
  title: string;
  images: string[];
  price_unit: string;
  is_discount: boolean;
  original_price: bigint;
  final_price: bigint;
  currency: string;
  discount_type: string;
  discount_value: bigint;
  discount_percent: number | null;
  discount_conditions: string | null;
  redemption_method: string;
  has_promo_code: boolean;
  valid_to: Date;
  created_at: Date;
  views_count: number;
  attributes: Record<string, string> | null;
  branches_count: number;
  is_favorite: boolean;
  branch_id: string | null;
  branch_name: string | null;
  branch_address: string | null;
  branch_lat: number | null;
  branch_lng: number | null;
  branch_distance_meters: number | null;
  branch_is_open_now: boolean | null;
  branch_closes_at: string | null;
  trade_center_name: string | null;
}

/**
 * Whether the branch is open right now, evaluated against `branch_working_hours`.
 *
 * Three cases, and the third is the one that is easy to miss: a venue open 20:00–04:00 is still
 * open at 02:00, but those hours live on the PREVIOUS day's row. Without that arm every overnight
 * venue would report closed for four hours a night.
 */
function isOpenNowExpr(clock: FeedClock): Prisma.Sql {
  return Prisma.sql`
    EXISTS (
      SELECT 1 FROM branch_working_hours wh
      WHERE wh.branch_id = nb.branch_id
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

/** "540" minutes → "09:00", for the card's `closesAt`. */
const CLOSES_AT_EXPR = Prisma.sql`
  (SELECT to_char((wh2.close_minute || ' minutes')::interval, 'HH24:MI')
     FROM branch_working_hours wh2
    WHERE wh2.branch_id = nb.branch_id
      AND wh2.is_closed = false
      AND wh2.close_minute IS NOT NULL
    ORDER BY wh2.day
    LIMIT 1)
`;

/**
 * The card's branch: nearest when coordinates were supplied, otherwise the first by
 * `(created_at, id)`. That tie-break is what keeps the choice stable across requests and pages
 * (STUDENT_FEED.md D14) — two branches at equal distance would otherwise swap between calls.
 *
 * LEFT JOIN, not JOIN: an online-only business has no branch and must still produce a card.
 */
function nearestBranchLateral(geo: GeoScope | null): Prisma.Sql {
  const distance =
    geo === null
      ? Prisma.sql`NULL::float`
      : Prisma.sql`ST_Distance(br.geo_point, ST_SetSRID(ST_MakePoint(${geo.lng}, ${geo.lat}), 4326)::geography)`;

  const order =
    geo === null
      ? Prisma.sql`br.created_at ASC, br.id ASC`
      : Prisma.sql`(br.geo_point IS NULL), ${distance} ASC, br.created_at ASC, br.id ASC`;

  return Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT br.id           AS branch_id,
             br.name         AS branch_name,
             br.address      AS branch_address,
             br.lat          AS branch_lat,
             br.lng          AS branch_lng,
             ${distance}     AS branch_distance_meters,
             tc.name         AS trade_center_name
      FROM listing_branches lb
      JOIN branches br ON br.id = lb.branch_id AND br.is_active = true
      LEFT JOIN trade_centers tc ON tc.id = br.trade_center_id
      WHERE lb.listing_id = l.id
      ORDER BY ${order}
      LIMIT 1
    ) nb ON true
  `;
}

/**
 * The full card projection: listing + business + group + category label + nearest branch +
 * favourite flag. Shared by `search` (LIST), `favorites/search` and `detail` so the three can
 * never drift into showing different numbers for the same listing.
 *
 * `studentId` null → `is_favorite` is false without touching the favourites table.
 */
export function cardSelect(
  geo: GeoScope | null,
  clock: FeedClock,
  studentId: string | null,
): Prisma.Sql {
  const favourite =
    studentId === null
      ? Prisma.sql`false`
      : Prisma.sql`EXISTS (SELECT 1 FROM student_favorites sf
                            WHERE sf.listing_id = l.id AND sf.student_id = ${studentId})`;

  return Prisma.sql`
    SELECT
      l.id, l.business_id, l.category_key, l.title, l.images,
      l.price_unit::text            AS price_unit,
      l.is_discount, l.original_price, l.final_price, l.currency,
      l.discount_type::text         AS discount_type,
      l.discount_value, l.discount_percent, l.discount_conditions,
      l.redemption_method::text     AS redemption_method,
      (l.promo_code IS NOT NULL)    AS has_promo_code,
      l.valid_to, l.created_at, l.views_count, l.attributes,
      b.name                        AS business_name,
      b.logo_url                    AS business_logo_url,
      b.type                        AS business_type,
      bt.group_key                  AS group_key,
      cat.name_uz                   AS category_label,
      (SELECT COUNT(*)::int
         FROM listing_branches lbc
         JOIN branches brc ON brc.id = lbc.branch_id AND brc.is_active = true
        WHERE lbc.listing_id = l.id) AS branches_count,
      ${favourite}                  AS is_favorite,
      nb.branch_id, nb.branch_name, nb.branch_address, nb.branch_lat, nb.branch_lng,
      nb.branch_distance_meters, nb.trade_center_name,
      CASE WHEN nb.branch_id IS NULL THEN NULL ELSE ${isOpenNowExpr(clock)} END AS branch_is_open_now,
      CASE WHEN nb.branch_id IS NULL THEN NULL ELSE ${CLOSES_AT_EXPR} END       AS branch_closes_at
    FROM listings l
    JOIN businesses b       ON b.id = l.business_id
    JOIN business_types bt  ON bt.type = b.type
    LEFT JOIN categories cat
           ON cat.business_type = b.type AND cat.key = l.category_key AND cat.gender IS NULL
    ${nearestBranchLateral(geo)}
  `;
}
