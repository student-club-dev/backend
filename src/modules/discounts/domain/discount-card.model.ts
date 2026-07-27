/** How a listing came to be in the result set (STUDENT_FEED.md §8.1). */
export type MatchedVia = 'CATEGORY' | 'ALL' | 'SYNONYM' | 'TEXT' | 'TYPE';

/**
 * The branch shown on the card: the nearest one when coordinates were supplied, otherwise the
 * first by `(createdAt, id)` — a deterministic tie-break, so the same request always names the
 * same branch and pagination stays stable (D14).
 */
export interface NearestBranch {
  branchId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  isOpenNow: boolean;
  closesAt: string | null;
  tradeCenterName: string | null;
}

/** Null on a regular listing — a plain single-price offer has no discount to describe (Q0). */
export interface CardDiscount {
  type: string;
  value: number;
  /** Server-rendered label the client prints as-is: "−30%", "1+1", "−15 000 so'm". */
  badge: string;
  conditions: string | null;
}

/** DiscountCard — the list/​favourites row (STUDENT_FEED.md §8.1). Detail extends this. */
export interface DiscountCard {
  id: string;
  businessId: string;
  businessName: string;
  businessLogoUrl: string | null;
  businessType: string;
  groupKey: string;
  categoryKey: string;
  categoryLabel: string;
  matchedVia: MatchedVia;
  title: string;
  imageUrl: string | null;
  imagesCount: number;
  priceUnit: string;
  isDiscount: boolean;
  originalPrice: number;
  finalPrice: number;
  /** `originalPrice - finalPrice`; null on a regular listing, never 0-as-placeholder (Q0). */
  savedAmount: number | null;
  currency: string;
  discount: CardDiscount | null;
  redemptionMethod: string;
  hasPromoCode: boolean;
  nearestBranch: NearestBranch | null;
  branchesCount: number;
  validTo: string;
  isFavorite: boolean;
  isNew: boolean;
  viewsCount: number;
  attributes: Record<string, string>;
}
