/** Injection token for the favorites repository port (bound to the Prisma impl in the module). */
export const FAVORITES_REPOSITORY = Symbol('FAVORITES_REPOSITORY');

/**
 * A student's saved listings (STUDENT_FEED.md §9). Keyed by `(studentId, listingId)` — the table's
 * own primary key — so the reading side (`favorites/search`) can be added as another method here
 * without reshaping these.
 */
export interface FavoritesRepository {
  /**
   * Whether the listing is visible to students per Q4 (listing ACTIVE, business APPROVED,
   * validFrom <= now <= validTo). Only saving asks this: a listing may expire while it sits in
   * someone's favourites, and removing it must stay possible.
   */
  isListingVisible(listingId: string): Promise<boolean>;

  /** Saves the listing. Idempotent — saving an already saved listing is a no-op. */
  add(studentId: string, listingId: string): Promise<void>;

  /** Unsaves the listing. Idempotent — removing something never saved is a no-op. */
  remove(studentId: string, listingId: string): Promise<void>;
}
