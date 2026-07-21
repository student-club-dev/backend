/**
 * Uzbekistan's geographic bounding box (DISCOUNTS_BUSINESS_API §6.6, §3.9). Shared by branch-location
 * validation and geocoding so the two never drift — one source of truth for "is this point in UZ".
 */
export const UZ_LAT_MIN = 37;
export const UZ_LAT_MAX = 46;
export const UZ_LNG_MIN = 55;
export const UZ_LNG_MAX = 74;

/** Whether a coordinate falls inside Uzbekistan's bounding box (inclusive). */
export function isWithinUzbekistan(lat: number, lng: number): boolean {
  return lat >= UZ_LAT_MIN && lat <= UZ_LAT_MAX && lng >= UZ_LNG_MIN && lng <= UZ_LNG_MAX;
}
