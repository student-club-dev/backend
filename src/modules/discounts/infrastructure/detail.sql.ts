import { Prisma } from '@prisma/client';
import type { GeoScope } from '../../../common/geo/geo-scope';
import type { FeedClock } from '../domain/feed-time';
import { cardSelect } from './discount-card.sql';
import { VISIBLE_LISTING } from './visible-scope.sql';

/**
 * The shared card projection narrowed to a single listing and gated by the Q4 visibility rules.
 *
 * The gate is the same `VISIBLE_LISTING` predicate the feed and the facets use, so a listing can
 * never be reachable by id after it has dropped out of the feed — and no row means "not found",
 * without saying whether it was paused, expired or never approved.
 */
export function visibleCardById(
  listingId: string,
  geo: GeoScope | null,
  clock: FeedClock,
  studentId: string | null,
): Prisma.Sql {
  return Prisma.sql`
    ${cardSelect(geo, clock, studentId)}
    WHERE l.id = ${listingId}
      AND ${VISIBLE_LISTING}
  `;
}

/** One branch's straight-line distance from the student. */
export interface BranchDistanceRow {
  branch_id: string;
  /** Null when the branch has no PostGIS point yet. */
  distance_meters: number | null;
}

/**
 * Metres from the student to each active branch of the listing. Kept as its own query rather than
 * folded into the branch read: PostGIS is unreachable through the Prisma client, and this way the
 * branch rows still come back through the shared branch mapper instead of a hand-rolled projection.
 *
 * `ST_Distance` on geography — the same call the card's nearest-branch LATERAL makes, so the same
 * branch never reports two different distances in one response.
 */
export function branchDistances(listingId: string, geo: GeoScope): Prisma.Sql {
  return Prisma.sql`
    SELECT br.id AS branch_id,
           ST_Distance(
             br.geo_point,
             ST_SetSRID(ST_MakePoint(${geo.lng}, ${geo.lat}), 4326)::geography
           ) AS distance_meters
    FROM listing_branches lb
    JOIN branches br ON br.id = lb.branch_id AND br.is_active = true
    WHERE lb.listing_id = ${listingId}
  `;
}
