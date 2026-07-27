import { priceLabel } from './price-label';

describe('priceLabel', () => {
  it('abbreviates thousands the way the spec prints them', () => {
    expect(priceLabel(21000)).toBe('21k');
    expect(priceLabel(1000)).toBe('1k');
    expect(priceLabel(150000)).toBe('150k');
  });

  it('keeps one decimal, and only when it says something', () => {
    expect(priceLabel(21500)).toBe('21.5k');
    expect(priceLabel(21540)).toBe('21.5k');
    expect(priceLabel(1200000)).toBe('1.2 mln');
  });

  it('prints sums below a thousand in full', () => {
    expect(priceLabel(0)).toBe('0');
    expect(priceLabel(999)).toBe('999');
  });

  it('promotes a sum that rounds up to four digits of thousands', () => {
    expect(priceLabel(999_950)).toBe('1 mln');
    expect(priceLabel(1_000_000)).toBe('1 mln');
  });
});
