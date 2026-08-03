/**
 * `details.amenities[]` values for a RENTAL listing (§4.2).
 *
 * Permanent keys — stored listings and client-side filters both depend on them. Labels live on the
 * client and later in the §7.3 catalog endpoint.
 */
export const RENTAL_AMENITY_KEYS: readonly string[] = [
  'WIFI',
  'FURNITURE',
  'CONDITIONER',
  'WASHER',
  'FRIDGE',
  'KITCHEN',
  'HOT_WATER',
  'HEATING',
  'SEPARATE_ROOM',
  'BALCONY',
  'PARKING',
  'ELEVATOR',
  'NEAR_METRO',
  'NEAR_UNIVERSITY',
];

export function isKnownAmenity(key: string): boolean {
  return RENTAL_AMENITY_KEYS.includes(key);
}
