/**
 * The short price printed on a map pin (STUDENT_FEED.md §8.2 `priceLabel`: 21000 → "21k").
 * Rendered server-side like {@link discountBadge}, so both mobile apps label a pin identically.
 *
 * A pin is a few characters wide, so the label is an abbreviation, not a formatted sum: thousands
 * as "k", millions as "mln", at most one decimal and never a trailing ".0".
 */
const THOUSAND = 1000;
const MILLION = 1_000_000;

export function priceLabel(amount: number): string {
  if (amount < THOUSAND) {
    return String(Math.round(amount));
  }
  if (amount < MILLION) {
    const thousands = round(amount / THOUSAND);
    // 999 950 rounds up to 1000 — read that as millions rather than print a four-digit "k".
    if (thousands < THOUSAND) {
      return `${thousands}k`;
    }
  }
  return `${round(amount / MILLION)} mln`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
