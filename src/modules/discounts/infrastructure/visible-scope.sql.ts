import { Prisma } from '@prisma/client';
import type { FacetScope } from '../domain/facets.model';

/**
 * The single source of truth for "which listings may a student see" (STUDENT_FEED.md Q4):
 * listing ACTIVE + business APPROVED + owner not banned + validFrom <= now() <= validTo. Every
 * facet query and, from the next slice, the search query build on this — so a visibility rule is
 * fixed in one place rather than restated in each aggregate.
 *
 * The owner test is what makes an admin ban mean something (admin-panel 15-deletion.md §5).
 * Without it, banning an owner only stops them logging in: their discounts keep sitting in the
 * feed, and a student walks to a counter that will not honour them. Since the ban is a status on
 * `business_owners` and nothing here is rewritten, `unban` puts the whole shopfront back exactly
 * as it was — which is the difference between blocking and deleting.
 *
 * Callers alias `listings` as `l` and `businesses` as `b`.
 */
export const VISIBLE_LISTING: Prisma.Sql = Prisma.sql`
  l.status = 'ACTIVE'
  AND b.status = 'APPROVED'
  AND EXISTS (
        SELECT 1 FROM business_owners bo
        WHERE bo.id = b.owner_id AND bo.status = 'ACTIVE'
      )
  AND l.valid_from <= now()
  AND l.valid_to >= now()
`;

/**
 * `FROM listings l JOIN businesses b` plus the type/category/geo narrowing common to every facet.
 * Ends in a WHERE clause, so callers may append further `AND ...` conditions but must not append
 * a JOIN — wrap this in a subquery when extra tables are needed.
 *
 * The geo test is an EXISTS rather than a join: a listing with three branches inside the radius
 * must still count once, which keeps every `COUNT(*)` here honest without a DISTINCT.
 */
export function scopedFrom(scope: FacetScope): Prisma.Sql {
  const category =
    scope.categoryKeys.length === 0
      ? Prisma.empty
      : Prisma.sql`AND l.category_key IN (${Prisma.join(scope.categoryKeys)})`;

  const geo =
    scope.geo === null
      ? Prisma.empty
      : Prisma.sql`
          AND EXISTS (
            SELECT 1 FROM listing_branches lb
            JOIN branches br ON br.id = lb.branch_id
            WHERE lb.listing_id = l.id
              AND br.is_active = true
              AND br.geo_point IS NOT NULL
              AND ST_DWithin(
                    br.geo_point,
                    ST_SetSRID(ST_MakePoint(${scope.geo.lng}, ${scope.geo.lat}), 4326)::geography,
                    ${scope.geo.radiusMeters}
                  )
          )`;

  return Prisma.sql`
    FROM listings l
    JOIN businesses b ON b.id = l.business_id
    WHERE ${VISIBLE_LISTING}
      AND b.type IN (${Prisma.join(scope.types)})
      ${category}
      ${geo}
  `;
}
