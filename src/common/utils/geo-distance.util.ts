/** Mean Earth radius in metres (WGS-84 sphere approximation). */
const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two coordinates in metres (haversine formula). Used to check a
 * branch point against a district centre without needing PostGIS.
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}
