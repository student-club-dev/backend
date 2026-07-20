import { encodeGeohash } from './geohash.util';

describe('encodeGeohash', () => {
  it('matches the canonical geohash reference (standard base32 algorithm)', () => {
    // Wikipedia reference: 57.64911, 10.40744 -> u4pruydqqvj
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(encodeGeohash(42.6, -5.6, 5)).toBe('ezs42');
  });

  it('produces a 7-char hash at the default precision for a Tashkent coordinate', () => {
    const hash = encodeGeohash(41.311, 69.24);
    expect(hash).toHaveLength(7);
    expect(hash).toBe('tx35p87');
  });

  it('is deterministic for the same input', () => {
    expect(encodeGeohash(41.2856, 69.2034)).toBe(encodeGeohash(41.2856, 69.2034));
  });

  it('honours a requested precision', () => {
    expect(encodeGeohash(41.2856, 69.2034, 5)).toHaveLength(5);
    expect(encodeGeohash(41.2856, 69.2034, 5)).toBe('tx34y');
  });
});
