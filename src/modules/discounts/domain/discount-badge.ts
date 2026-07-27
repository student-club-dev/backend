/**
 * The badge printed on a card. Rendered server-side (STUDENT_FEED.md §8.1: "the client never
 * computes a price") so both mobile apps show identical wording.
 *
 * U+2212 MINUS SIGN, not a hyphen — it aligns with digits in the app's font.
 */
const MINUS = '−';

export function discountBadge(type: string, value: number, percent: number | null): string {
  switch (type) {
    case 'PERCENT':
      return `${MINUS}${value}%`;
    case 'FREE_ITEM':
      return '1+1';
    case 'FIXED_AMOUNT':
      return `${MINUS}${formatSum(value)}`;
    case 'SPECIAL_PRICE':
      // The stored value is the NEW price, so it says nothing about the size of the cut —
      // the normalised percent does.
      return percent === null ? formatSum(value) : `${MINUS}${percent}%`;
    default:
      return '';
  }
}

/** 15000 → "15 000 so'm" (thin-space groups, matching how prices are written in the app). */
function formatSum(amount: number): string {
  return `${amount.toLocaleString('ru-RU').replace(/ /g, ' ')} so‘m`;
}
