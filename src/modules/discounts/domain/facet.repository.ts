import { FacetScope, ListingFacets } from './facets.model';

/** Injection token for the facet repository port (bound to the Prisma impl in the module). */
export const FACET_REPOSITORY = Symbol('FACET_REPOSITORY');

/**
 * Read-only aggregation over visible listings. The application layer depends on this interface
 * only; every SQL detail lives in the infrastructure layer.
 */
export interface FacetRepository {
  /**
   * Every facet for `scope`, computed over listings that are visible per STUDENT_FEED.md Q4
   * (listing ACTIVE, business APPROVED, validFrom <= now <= validTo). An empty `scope.types`
   * yields zeroed facets without touching the database.
   */
  findFacets(scope: FacetScope): Promise<ListingFacets>;
}
