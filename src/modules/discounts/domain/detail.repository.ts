import type { GeoScope } from '../../../common/geo/geo-scope';
import type { ListingDetail } from './listing-detail.model';

/** Injection token for the detail repository port (bound to the Prisma impl in the module). */
export const DETAIL_REPOSITORY = Symbol('DETAIL_REPOSITORY');

/**
 * What to load one listing for. `studentId` is the signed-in student or null — it decides
 * `isFavorite` only; hiding the promo code from an anonymous viewer is the service's call.
 * `now` is passed in rather than read inside so the "is it still valid / is it new" answers come
 * from a single instant.
 */
export interface ListingDetailLookup {
  listingId: string;
  geo: GeoScope | null;
  studentId: string | null;
  now: Date;
}

/**
 * Read side of the detail screen. The application layer depends on this interface only; every SQL
 * detail lives in the infrastructure layer.
 */
export interface DetailRepository {
  /**
   * The full listing, or `null` when it is not visible to a student per STUDENT_FEED.md Q4 (listing
   * ACTIVE, business APPROVED, validFrom <= now <= validTo). A hidden listing and a non-existent one
   * are indistinguishable by design — the caller must not disclose which it was.
   */
  findVisibleById(lookup: ListingDetailLookup): Promise<ListingDetail | null>;

  /**
   * How many times this student has already redeemed this listing since `since` (null = ever).
   * Backs `remainingForUser`.
   */
  countRedemptions(listingId: string, studentId: string, since: Date | null): Promise<number>;

  /**
   * Counts one view of the listing by the student, at most once per hour — reopening a listing to
   * re-read it is not new interest. Callers pass a student id only; anonymous views are not counted.
   */
  registerView(listingId: string, studentId: string): Promise<void>;
}
