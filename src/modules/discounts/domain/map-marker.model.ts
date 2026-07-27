/**
 * One pin on the map (STUDENT_FEED.md §8.2). A listing offered at three branches produces three
 * markers carrying the same `listingId` (§12.11) — the map shows places, the list shows offers.
 *
 * Everything a pin prints is finished server-side, exactly as on a card: the client never formats
 * a price and never computes a badge.
 */
export interface MapMarker {
  listingId: string;
  branchId: string;
  lat: number;
  lng: number;
  /** Short label for a pin far too small for a full price — "21k". */
  priceLabel: string;
  finalPrice: number;
  /** Null on a regular listing (Q0): no badge is invented for an offer that has no discount. */
  discountBadge: string | null;
  businessType: string;
  accentColor: string | null;
  isDiscount: boolean;
  isFavorite: boolean;
  /**
   * Not part of the wire marker — the badge already says it. Kept on the model because a cluster
   * aggregates it into `maxDiscountPercent` (§8.2).
   */
  discountPercent: number | null;
}
