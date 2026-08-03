import { Inject, Injectable } from '@nestjs/common';
import type { StudentListing } from '../domain/entities/student-listing.entity';
import { decodeCursor, encodeCursor, filterHashOf } from '../domain/search/cursor';
import {
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  type SearchCriteria,
} from '../domain/search/search-criteria';
import {
  STUDENT_LISTING_REPOSITORY,
  type StudentListingRepository,
} from '../domain/student-listing.repository';

/** A listing plus what the ranking computed about it, ready for the response mapper. */
export interface SearchResultItem {
  listing: StudentListing;
  distanceMeters: number | null;
}

export interface SearchResult {
  items: SearchResultItem[];
  size: number;
  hasNext: boolean;
  /** Null on the last page, and in page-number mode (§7.2.2). */
  nextCursor: string | null;
  /** Page-number mode only; null in cursor mode. */
  page: number | null;
  /** Page-number mode only — a COUNT too expensive to run for an infinite scroll. */
  total: number | null;
}

/**
 * The feed (§7.2).
 *
 * `POST /search` and `GET /student-listings` both land here with a resolved `SearchCriteria`, so
 * the two cannot drift — §7.2.5 requires them to behave identically, and one code path is the only
 * way to guarantee that rather than hope for it.
 */
@Injectable()
export class StudentListingSearchService {
  constructor(
    @Inject(STUDENT_LISTING_REPOSITORY)
    private readonly repository: StudentListingRepository,
  ) {}

  async search(criteria: SearchCriteria): Promise<SearchResult> {
    const size = clampSize(criteria.size);
    const effective: SearchCriteria = { ...criteria, size };

    // The hash covers the query but not the position, so a cursor from a different filter set is
    // rejected instead of silently resuming into unrelated rows.
    const filterHash = filterHashOf(effective);
    const position = effective.cursor === null ? null : decodeCursor(effective.cursor, filterHash);

    // A cursor wins when both arrive: it is the more correct of the two, and the client only sends
    // a page number when it has no cursor to resume from.
    const usesOffset = position === null && effective.page !== null;
    const pageNumber = usesOffset ? Math.max(1, Math.trunc(effective.page ?? 1)) : null;
    const offset = pageNumber === null ? 0 : (pageNumber - 1) * size;

    const page = await this.repository.search(effective, position, offset);

    const listings = await this.repository.findManyByIds(page.hits.map((hit) => hit.id));
    const byId = new Map(listings.map((listing) => [listing.id, listing]));

    // Re-imposes the SQL ranking: `findManyByIds` returns whatever order Postgres finds cheapest,
    // and a listing deleted between the two queries simply drops out.
    const items = page.hits
      .map((hit) => {
        const listing = byId.get(hit.id);
        return listing === undefined ? null : { listing, distanceMeters: hit.distanceMeters };
      })
      .filter((item): item is SearchResultItem => item !== null);

    const lastHit = page.hits.at(-1);
    // No cursor in offset mode: mixing the two would let a client resume a keyset walk from a page
    // it reached by offset, which is not the same position once rows shift.
    const nextCursor =
      !usesOffset && page.hasNext && lastHit !== undefined
        ? encodeCursor({ sortValue: lastHit.sortValue, id: lastHit.id }, filterHash)
        : null;

    const total = usesOffset ? await this.repository.countSearch(effective) : null;

    return { items, size, hasNext: page.hasNext, nextCursor, page: pageNumber, total };
  }
}

/** §7.2.2 — an oversized request is trimmed, not refused; a nonsensical one falls back. */
export function clampSize(size: number): number {
  if (!Number.isFinite(size) || size < 1) {
    return PAGE_SIZE_DEFAULT;
  }
  return Math.min(Math.trunc(size), PAGE_SIZE_MAX);
}
