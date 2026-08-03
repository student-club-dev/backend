import { isKnownAmenity } from '../../catalogs/rental.catalog';
import type { RentalDetails } from '../../entities/student-listing.entity';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG, tenantsExceedRooms } from '../messages';

const ROOMS_MIN = 1;
const ROOMS_MAX = 20;
/** 0 is legitimate: the flat is empty and the whole thing is on offer. */
const CURRENT_TENANTS_MIN = 0;
const NEEDED_TENANTS_MIN = 1;
const TENANTS_MAX = 30;
/** §5.4 — beyond four to a room the listing is not describing a place anyone would take. */
const PEOPLE_PER_ROOM = 4;

/** §5.4 — a rental has to say what it is, how big, who it is for, and who is already there. */
export function rentalRules(details: RentalDetails): FieldErrors {
  const errors: FieldErrors = {};

  if (details.propertyType === null) {
    errors[ListingField.PROPERTY_TYPE] = MSG.PROPERTY_TYPE_REQUIRED;
  }

  const roomsError = roomsErrorOf(details);
  if (roomsError !== null) {
    errors[ListingField.ROOMS] = roomsError;
  }

  const tenantsError = tenantsErrorOf(details);
  if (tenantsError !== null) {
    errors[ListingField.TENANTS] = tenantsError;
  }

  // The first question a student asks of a shared flat, so it is never optional.
  if (details.gender === null) {
    errors[ListingField.GENDER] = MSG.GENDER_REQUIRED;
  }

  const attributesError = attributesErrorOf(details);
  if (attributesError !== null) {
    errors[ListingField.ATTRIBUTES] = attributesError;
  }

  return errors;
}

function roomsErrorOf(details: RentalDetails): string | null {
  const { roomCount } = details;
  if (roomCount === null) {
    return MSG.ROOMS_REQUIRED;
  }
  if (roomCount < ROOMS_MIN || roomCount > ROOMS_MAX) {
    return MSG.ROOMS_OUT_OF_RANGE;
  }
  return null;
}

function tenantsErrorOf(details: RentalDetails): string | null {
  const { roomCount, currentTenants, neededTenants } = details;

  if (
    currentTenants === null ||
    currentTenants < CURRENT_TENANTS_MIN ||
    currentTenants > TENANTS_MAX
  ) {
    return MSG.CURRENT_TENANTS_REQUIRED;
  }
  if (neededTenants === null || neededTenants < NEEDED_TENANTS_MIN || neededTenants > TENANTS_MAX) {
    return MSG.NEEDED_TENANTS_REQUIRED;
  }
  // Only meaningful once the room count itself is sane; roomsErrorOf reports that separately.
  if (roomCount !== null && currentTenants + neededTenants > roomCount * PEOPLE_PER_ROOM) {
    return tenantsExceedRooms(roomCount, currentTenants + neededTenants);
  }
  return null;
}

function attributesErrorOf(details: RentalDetails): string | null {
  const { floor, totalFloors } = details;
  if (floor !== null && totalFloors !== null && floor > totalFloors) {
    return MSG.FLOOR_ABOVE_TOTAL;
  }
  if (!details.amenities.every(isKnownAmenity)) {
    return MSG.CATALOG_KEY_UNKNOWN;
  }
  return null;
}
