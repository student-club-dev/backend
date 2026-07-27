import { discountBadge } from './discount-badge';

describe('discountBadge', () => {
  it('prints a percent discount with a real minus sign', () => {
    expect(discountBadge('PERCENT', 30, 30)).toBe('−30%');
  });

  it('prints FREE_ITEM as 1+1 — there is no price cut to show', () => {
    expect(discountBadge('FREE_ITEM', 1, 50)).toBe('1+1');
  });

  it('prints a fixed amount in so‘m', () => {
    expect(discountBadge('FIXED_AMOUNT', 15_000, 27)).toBe('−15 000 so‘m');
  });

  it('prints SPECIAL_PRICE as the normalised percent, not the new price', () => {
    // The stored value (21 000) is the new price; on its own it says nothing about the cut.
    expect(discountBadge('SPECIAL_PRICE', 21_000, 30)).toBe('−30%');
  });

  it('falls back to the amount when SPECIAL_PRICE has no computed percent', () => {
    expect(discountBadge('SPECIAL_PRICE', 21_000, null)).toBe('21 000 so‘m');
  });
});
