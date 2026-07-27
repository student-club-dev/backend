/**
 * A point plus a radius, used to scope reads to what is near the student. Shared by the catalog
 * counts and the feed facets so the two never drift apart.
 */
export interface GeoScope {
  lat: number;
  lng: number;
  radiusMeters: number;
}
