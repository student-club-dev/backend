import type { ListingOptionGroup, StudentListing } from '../../entities/student-listing.entity';
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG, optionGroupEmpty, optionGroupTooManyOptions } from '../messages';

const TITLE_MIN = 3;
const TITLE_MAX = 120;
const IMAGES_MAX = 5;
const OPTION_GROUPS_MAX = 10;
const OPTIONS_PER_GROUP_MAX = 30;
/** §6 anti-spam: a listing may not sit in the feed for more than a quarter of a year. */
const VALIDITY_MAX_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Kinds where a photo is the substance of the listing. A job vacancy has no photo and a homework
 * brief is text, so demanding an image there would block legitimate listings (§5.1).
 */
const IMAGE_REQUIRED_KINDS: readonly StudentListingKind[] = [
  StudentListingKind.RENTAL,
  StudentListingKind.SERVICE,
];

/** §5.1 — the publish checks every kind shares. */
export function commonRules(listing: StudentListing): FieldErrors {
  const errors: FieldErrors = {};

  const titleError = titleErrorOf(listing.title);
  if (titleError !== null) {
    errors[ListingField.TITLE] = titleError;
  }

  const imagesError = imagesErrorOf(listing);
  if (imagesError !== null) {
    errors[ListingField.IMAGES] = imagesError;
  }

  const priceError = priceErrorOf(listing);
  if (priceError !== null) {
    errors[ListingField.PRICE] = priceError;
  }

  if (listing.contactPhone === null || listing.contactPhone.trim().length === 0) {
    errors[ListingField.CONTACT] = MSG.CONTACT_REQUIRED;
  }

  const validityError = validityErrorOf(listing);
  if (validityError !== null) {
    errors[ListingField.VALIDITY] = validityError;
  }

  const optionsError = optionGroupsErrorOf(listing.optionGroups);
  if (optionsError !== null) {
    errors[ListingField.OPTIONS] = optionsError;
  }

  return errors;
}

function titleErrorOf(rawTitle: string): string | null {
  const title = rawTitle.trim();
  if (title.length === 0) {
    return MSG.TITLE_REQUIRED;
  }
  if (title.length < TITLE_MIN) {
    return MSG.TITLE_TOO_SHORT;
  }
  if (title.length > TITLE_MAX) {
    return MSG.TITLE_TOO_LONG;
  }
  return null;
}

function imagesErrorOf(listing: StudentListing): string | null {
  if (listing.images.length > IMAGES_MAX) {
    return MSG.IMAGES_TOO_MANY;
  }
  if (IMAGE_REQUIRED_KINDS.includes(listing.kind) && listing.images.length === 0) {
    return MSG.IMAGES_REQUIRED;
  }
  return null;
}

function priceErrorOf(listing: StudentListing): string | null {
  // "Kelishilgan holda" is a real answer to "how much?", so a zero price is fine with it set.
  if (listing.price <= 0 && !listing.isNegotiable) {
    return MSG.PRICE_REQUIRED;
  }
  if (listing.priceMax !== null && listing.priceMax <= listing.price) {
    return MSG.PRICE_MAX_TOO_LOW;
  }
  return null;
}

function validityErrorOf(listing: StudentListing): string | null {
  const { validFrom, validTo } = listing;
  if (validFrom === null || validTo === null || validTo.getTime() <= validFrom.getTime()) {
    return MSG.VALIDITY_ORDER;
  }
  if (validTo.getTime() - validFrom.getTime() > VALIDITY_MAX_DAYS * DAY_MS) {
    return MSG.VALIDITY_TOO_LONG;
  }
  return null;
}

function optionGroupsErrorOf(groups: ListingOptionGroup[]): string | null {
  if (groups.length > OPTION_GROUPS_MAX) {
    return MSG.OPTION_GROUPS_TOO_MANY;
  }
  for (const group of groups) {
    if (group.name.trim().length === 0) {
      return MSG.OPTION_GROUP_NAME_REQUIRED;
    }
    if (group.options.length === 0) {
      return optionGroupEmpty(group.name);
    }
    if (group.options.length > OPTIONS_PER_GROUP_MAX) {
      return optionGroupTooManyOptions(group.name);
    }
  }
  return null;
}
