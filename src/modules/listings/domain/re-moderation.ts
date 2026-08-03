import type { UpdateListingInput } from '../application/listings.io';
import type { Listing } from './entities/listing.entity';

/**
 * Whether an edit to a published listing needs a moderator to look at it again
 * (DISCOUNTS_BUSINESS_API §6.3).
 *
 * True when any field a moderator actually judged has changed: what the offer says, what it shows,
 * what it costs, and where it sits in the catalog. Everything else — which branches carry it, how
 * long it runs, how many are left — is inventory the owner manages without review, so §6.3's
 * exempt list needs no separate encoding here: a change confined to those fields simply is not a
 * material change.
 *
 * `finalPrice` is not compared. It is derived server-side from `discount` and `originalPrice`, both
 * of which are compared, so it cannot differ on its own.
 */
export function requiresReModeration(stored: Listing, incoming: UpdateListingInput): boolean {
  return (
    stored.title !== incoming.title ||
    stored.description !== incoming.description ||
    stored.originalPrice !== incoming.originalPrice ||
    stored.categoryKey !== incoming.categoryKey ||
    stored.customCategoryName !== incoming.customCategoryName ||
    !sameImages(stored.images, incoming.images) ||
    stored.discount.type !== incoming.discount.type ||
    stored.discount.value !== incoming.discount.value ||
    stored.discount.conditions !== incoming.discount.conditions
  );
}

/** Order matters — the first image is the cover, so a reorder is a change a moderator should see. */
function sameImages(stored: string[], incoming: string[]): boolean {
  return stored.length === incoming.length && stored.every((url, index) => url === incoming[index]);
}
