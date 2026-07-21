import { DiscountType } from '../enums/discount-type.enum';

/**
 * Computes a listing's `finalPrice` from its discount, exactly per LISTINGS.md §4. Pure function —
 * no NestJS/Prisma — so it is unit-testable and reused by future edit/duplicate flows. All values
 * are whole so'm; BigInt keeps the arithmetic exact (integer division truncates toward zero).
 *
 * - `PERCENT`       → `originalPrice − originalPrice * value / 100`
 * - `FIXED_AMOUNT`  → `max(0, originalPrice − value)`
 * - `SPECIAL_PRICE` → `value` (the new price)
 * - `FREE_ITEM`     → `originalPrice` (1+1; the discount lives in `conditions`)
 *
 * The business gates around the result (`DISCOUNT_TOO_HIGH`, `FINAL_PRICE_INVALID`, the regular
 * normalisation) live in the application layer — this function only does the arithmetic.
 */
export function computeFinalPrice(
  type: DiscountType,
  value: bigint,
  originalPrice: bigint,
): bigint {
  switch (type) {
    case DiscountType.PERCENT:
      return originalPrice - (originalPrice * value) / 100n;
    case DiscountType.FIXED_AMOUNT: {
      const reduced = originalPrice - value;
      return reduced > 0n ? reduced : 0n;
    }
    case DiscountType.SPECIAL_PRICE:
      return value;
    case DiscountType.FREE_ITEM:
      return originalPrice;
  }
}
