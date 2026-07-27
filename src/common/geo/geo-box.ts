/**
 * A latitude/longitude rectangle — the viewport a map client is looking at (STUDENT_FEED.md §4
 * `filter.geo.bbox`). Lives beside {@link GeoScope} so "a box" means the same four numbers in the
 * filter, in the SQL and in the MAP response.
 */
export interface GeoBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}
