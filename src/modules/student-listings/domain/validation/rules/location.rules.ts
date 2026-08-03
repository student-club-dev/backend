import type { StudentListingBranch } from '../../entities/student-listing-branch.entity';
import type { StudentListing } from '../../entities/student-listing.entity';
import { TaskFormat } from '../../enums/detail.enums';
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG } from '../messages';

/** Uzbekistan's bounding box (§2.4). A pin outside it is a client bug, not a place. */
export const UZ_LAT_MIN = 37.0;
export const UZ_LAT_MAX = 46.0;
export const UZ_LNG_MIN = 55.0;
export const UZ_LNG_MAX = 74.0;

export const BRANCHES_MAX = 20;
/** Two pins this close describe one place; the second is a mis-tap, not a second address (§2.4). */
export const DUPLICATE_PIN_METERS = 100;

/** Mean Earth radius (IUGG), the value PostGIS's spherical functions use. */
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Great-circle distance in metres (haversine).
 *
 * The client's ListingValidator uses the same formula and the database uses ST_Distance on
 * geography; all three agree to well within the 100 m threshold this feeds, so a pin rejected here
 * is not silently accepted elsewhere.
 */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** §5.2 names the thing being placed, so the prompt reads naturally for each kind. */
const MISSING_LOCATION_MESSAGE: Readonly<Record<StudentListingKind, string>> = {
  [StudentListingKind.RENTAL]: MSG.LOCATION_REQUIRED_RENTAL,
  [StudentListingKind.SERVICE]: MSG.LOCATION_REQUIRED_SERVICE,
  [StudentListingKind.JOB]: MSG.LOCATION_REQUIRED_JOB,
  [StudentListingKind.TASK]: MSG.LOCATION_REQUIRED_TASK,
};

/**
 * §5.2 — address rules.
 *
 * Checks stop at the first problem rather than accumulating: they all report under LOCATION, and
 * "the point is outside Uzbekistan" is more actionable than also being told the pins coincide.
 */
export function locationRules(listing: StudentListing): FieldErrors {
  const { branches } = listing;

  if (branches.length === 0) {
    return requiresLocation(listing)
      ? { [ListingField.LOCATION]: MISSING_LOCATION_MESSAGE[listing.kind] }
      : {};
  }

  if (branches.length > BRANCHES_MAX) {
    return { [ListingField.LOCATION]: MSG.LOCATION_TOO_MANY };
  }

  if (!branches.every(isInsideUzbekistan)) {
    return { [ListingField.LOCATION]: MSG.LOCATION_OUT_OF_BOUNDS };
  }

  if (hasDuplicatePin(branches)) {
    return { [ListingField.LOCATION]: MSG.LOCATION_DUPLICATE };
  }

  return {};
}

/**
 * Every kind needs an address except an online TASK: a flat, a service and a job all happen
 * somewhere, but homework done over the internet does not (§5.2).
 */
function requiresLocation(listing: StudentListing): boolean {
  if (listing.details.kind !== StudentListingKind.TASK) {
    return true;
  }
  return listing.details.format === TaskFormat.IN_PERSON;
}

function isInsideUzbekistan(branch: StudentListingBranch): boolean {
  return (
    branch.lat >= UZ_LAT_MIN &&
    branch.lat <= UZ_LAT_MAX &&
    branch.lng >= UZ_LNG_MIN &&
    branch.lng <= UZ_LNG_MAX
  );
}

/** O(n²), but n ≤ 20 by the rule above — an index would cost more than it saves. */
function hasDuplicatePin(branches: StudentListingBranch[]): boolean {
  for (let i = 0; i < branches.length; i += 1) {
    for (let j = i + 1; j < branches.length; j += 1) {
      if (distanceMeters(branches[i], branches[j]) < DUPLICATE_PIN_METERS) {
        return true;
      }
    }
  }
  return false;
}
