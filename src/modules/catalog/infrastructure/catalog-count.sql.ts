import { Prisma } from '@prisma/client';
import type { GeoScope } from '../domain/catalog.repository';

/** One row of the per-type visible-listing aggregate. */
export interface TypeCountRow {
  type: string;
  count: number;
}

/**
 * Visible-listing count grouped by business type (STUDENT_FEED.md Q4).
 *
 * Visible = listing ACTIVE + business APPROVED + validFrom <= now() <= validTo. When `geo` is
 * given the listing must have at least one active branch inside the radius — hence the join and
 * `COUNT(DISTINCT l.id)`, which keeps a multi-branch listing from being counted twice.
 * `::int` casts the bigint COUNT so the driver returns a JS number.
 */
export function typeCountQuery(geo: GeoScope | null): Prisma.Sql {
  const visible = Prisma.sql`
    l.status = 'ACTIVE'
    AND b.status = 'APPROVED'
    AND l.valid_from <= now()
    AND l.valid_to >= now()
  `;

  if (geo === null) {
    return Prisma.sql`
      SELECT b.type AS type, COUNT(*)::int AS count
      FROM listings l
      JOIN businesses b ON b.id = l.business_id
      WHERE ${visible}
      GROUP BY b.type
    `;
  }

  return Prisma.sql`
    SELECT b.type AS type, COUNT(DISTINCT l.id)::int AS count
    FROM listings l
    JOIN businesses b ON b.id = l.business_id
    JOIN listing_branches lb ON lb.listing_id = l.id
    JOIN branches br ON br.id = lb.branch_id
    WHERE ${visible}
      AND br.is_active = true
      AND br.geo_point IS NOT NULL
      AND ST_DWithin(
            br.geo_point,
            ST_SetSRID(ST_MakePoint(${geo.lng}, ${geo.lat}), 4326)::geography,
            ${geo.radiusMeters}
          )
    GROUP BY b.type
  `;
}
