/**
 * GeocodingService result types — the provider match enriched with OUR region/district. The
 * presentation DTOs map from these; the service produces them (Phase 2).
 */

/** One forward-geocode candidate: provider coordinates + our resolved region/district. */
export interface GeocodeResult {
  lat: number;
  lng: number;
  regionId: string | null;
  districtId: string | null;
  formattedAddress: string;
  confidence: number | null;
}

/** A reverse-geocode lookup: our region/district for the point + the provider's address. */
export interface ReverseGeocodeResult {
  regionId: string | null;
  districtId: string | null;
  address: string | null;
  nearestMetro: string | null;
}
