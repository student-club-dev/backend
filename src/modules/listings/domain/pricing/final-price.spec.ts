import { DiscountType } from '../enums/discount-type.enum';
import { computeFinalPrice } from './final-price';

const ORIGINAL = 55_000n;

describe('computeFinalPrice', () => {
  describe('PERCENT', () => {
    it('subtracts the percentage of the original price', () => {
      expect(computeFinalPrice(DiscountType.PERCENT, 20n, ORIGINAL)).toBe(44_000n);
    });

    it('value 0 leaves the price unchanged (the regular-normalisation form)', () => {
      expect(computeFinalPrice(DiscountType.PERCENT, 0n, ORIGINAL)).toBe(ORIGINAL);
    });

    it('value 90 (the max allowed) keeps a positive price', () => {
      expect(computeFinalPrice(DiscountType.PERCENT, 90n, ORIGINAL)).toBe(5_500n);
    });

    it('value 91 still computes arithmetically (the >90 gate lives in the service)', () => {
      expect(computeFinalPrice(DiscountType.PERCENT, 91n, ORIGINAL)).toBe(4_950n);
    });

    it('truncates fractional so’m toward zero', () => {
      // 10_000 - 10_000 * 33 / 100 = 10_000 - 3_300 = 6_700 (3_300 is exact); use an inexact case.
      expect(computeFinalPrice(DiscountType.PERCENT, 33n, 10_001n)).toBe(6_701n);
    });
  });

  describe('FIXED_AMOUNT', () => {
    it('subtracts a fixed amount', () => {
      expect(computeFinalPrice(DiscountType.FIXED_AMOUNT, 10_000n, ORIGINAL)).toBe(45_000n);
    });

    it('never goes below zero', () => {
      expect(computeFinalPrice(DiscountType.FIXED_AMOUNT, 60_000n, ORIGINAL)).toBe(0n);
    });
  });

  describe('SPECIAL_PRICE', () => {
    it('uses the value as the new price', () => {
      expect(computeFinalPrice(DiscountType.SPECIAL_PRICE, 30_000n, ORIGINAL)).toBe(30_000n);
    });
  });

  describe('FREE_ITEM', () => {
    it('keeps the original price (1+1)', () => {
      expect(computeFinalPrice(DiscountType.FREE_ITEM, 0n, ORIGINAL)).toBe(ORIGINAL);
    });
  });
});
