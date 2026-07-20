/** Base32 alphabet used by the standard geohash algorithm (excludes a, i, l, o). */
const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encodes a latitude/longitude pair to a standard base32 geohash. Server-computed for branches
 * (7 chars ≈ 150 m) so the client never supplies it. No external dependency.
 */
export function encodeGeohash(lat: number, lng: number, precision = 7): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;

  let hash = '';
  let bits = 0;
  let value = 0;
  let evenBit = true;

  while (hash.length < precision) {
    if (evenBit) {
      const lngMid = (lngMin + lngMax) / 2;
      if (lng >= lngMid) {
        value = value * 2 + 1;
        lngMin = lngMid;
      } else {
        value = value * 2;
        lngMax = lngMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) {
        value = value * 2 + 1;
        latMin = latMid;
      } else {
        value = value * 2;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (++bits === 5) {
      hash += GEOHASH_BASE32.charAt(value);
      bits = 0;
      value = 0;
    }
  }

  return hash;
}
