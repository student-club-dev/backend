/** Injection token for the geocoding provider (bound by GeoModule per GEOCODER_PROVIDER). */
export const GEOCODER = Symbol('GEOCODER');

/**
 * A single forward-geocode candidate from the provider. Carries no region/district — those are
 * resolved from our own dataset by GeocodingService, never trusted from the provider's names.
 */
export interface GeocoderMatch {
  lat: number;
  lng: number;
  formattedAddress: string;
  /** 0..1 relevance; null when the provider gives no usable score. */
  confidence: number | null;
}

/** A reverse-geocode result from the provider — the formatted address only. */
export interface GeocoderReverseResult {
  address: string | null;
}

/**
 * Port for the external geocoding provider — PURE provider access only. It knows nothing about our
 * regions/districts, our bounds, or nearestMetro (all of that lives in GeocodingService). Same input
 * → same output, no side effects, plain-serializable returns: a caching decorator can wrap it later
 * with zero change to GeocodingService. Bound to Dev/Yandex by config.
 */
export interface GeocoderPort {
  /** Forward geocode a free-text query to candidates, best-confidence first. Empty array if none. */
  geocode(query: string): Promise<GeocoderMatch[]>;

  /** Reverse geocode coordinates to a formatted address (null if the provider has none). */
  reverseGeocode(lat: number, lng: number): Promise<GeocoderReverseResult>;
}
