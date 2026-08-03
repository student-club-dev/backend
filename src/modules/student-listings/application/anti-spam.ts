import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';
import type { StudentListingRepository } from '../domain/student-listing.repository';

/** §6 "Anti-spam limitlari". */
export const MAX_ACTIVE_LISTINGS = 20;
export const MAX_DAILY_PUBLISHES = 10;
export const DUPLICATE_WINDOW_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/**
 * The fields the limits actually read. Deliberately narrower than the entity so a caller — and a
 * test — needs only what is being checked.
 */
export interface PublishCandidate {
  /** Empty for a listing that does not exist yet (a create that publishes immediately). */
  id: string;
  ownerId: string;
  kind: StudentListingKind;
  title: string;
  price: number;
}

/**
 * The only gate between a valid listing and the feed.
 *
 * There is no moderation queue by product decision (spec §5), so these limits are what stops one
 * student flooding the app. Throws on the first breach and returns silently otherwise.
 *
 * Checks run cheapest-first: a student already at their cap is rejected without paying for the
 * duplicate probe. `now` is injected so the windows are deterministic under test.
 */
export async function assertMayPublish(
  repository: StudentListingRepository,
  listing: PublishCandidate,
  now: Date,
): Promise<void> {
  const activeCount = await repository.countActiveByOwner(listing.ownerId);
  if (activeCount >= MAX_ACTIVE_LISTINGS) {
    throw new AppException(
      ERROR_CODE.LISTING_LIMIT_REACHED,
      429,
      `Bir vaqtda ${MAX_ACTIVE_LISTINGS} tadan ko‘p faol e’lon bo‘lmaydi`,
    );
  }

  const dayAgo = new Date(now.getTime() - 24 * HOUR_MS);
  const publishedToday = await repository.countPublishedSince(listing.ownerId, dayAgo);
  if (publishedToday >= MAX_DAILY_PUBLISHES) {
    throw new AppException(
      ERROR_CODE.LISTING_LIMIT_REACHED,
      429,
      `Kuniga ${MAX_DAILY_PUBLISHES} tadan ko‘p e’lon joylay olmaysiz`,
    );
  }

  // Same kind, same headline, same price from the same student: a re-post, not a new offer.
  // The listing itself is excluded — publishing a saved DRAFT must not read as a duplicate of it.
  const duplicate = await repository.existsDuplicate({
    ownerId: listing.ownerId,
    kind: listing.kind,
    title: listing.title,
    price: listing.price,
    since: new Date(now.getTime() - DUPLICATE_WINDOW_HOURS * HOUR_MS),
    excludeId: listing.id.length > 0 ? listing.id : null,
  });
  if (duplicate) {
    throw new AppException(ERROR_CODE.LISTING_DUPLICATE, 409, 'Bunday e’lon yaqinda joylangan');
  }
}
