import { discountBadge } from '../domain/discount-badge';
import { DiscountCard, MatchedVia, NearestBranch } from '../domain/discount-card.model';
import type { DiscountCardRow } from './discount-card.sql';

/** A listing counts as new for its first week (STUDENT_FEED.md §8.1 `isNew`). */
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Maps a raw card row into the wire model. Everything the client must not compute for itself is
 * finished here: `savedAmount`, the badge text, `isNew`, and the branch's open state.
 *
 * Money arrives as BigInt (int8 columns) and leaves as a number — whole so'm always fits.
 */
export class DiscountCardMapper {
  static toCard(row: DiscountCardRow, matchedVia: MatchedVia, now: Date): DiscountCard {
    const originalPrice = Number(row.original_price);
    const finalPrice = Number(row.final_price);

    return {
      id: row.id,
      businessId: row.business_id,
      businessName: row.business_name,
      businessLogoUrl: row.business_logo_url,
      businessType: row.business_type,
      groupKey: row.group_key,
      categoryKey: row.category_key,
      // A custom category ("OTHER") has no catalog row; fall back to the key so the card is never
      // rendered with an empty label.
      categoryLabel: row.category_label ?? row.category_key,
      matchedVia,
      title: row.title,
      imageUrl: row.images[0] ?? null,
      imagesCount: row.images.length,
      priceUnit: row.price_unit,
      isDiscount: row.is_discount,
      originalPrice,
      finalPrice,
      // Regular listings report null, never 0 — the client renders "no discount", not "saved 0".
      savedAmount: row.is_discount ? originalPrice - finalPrice : null,
      currency: row.currency,
      discount: row.is_discount
        ? {
            type: row.discount_type,
            value: Number(row.discount_value),
            badge: discountBadge(
              row.discount_type,
              Number(row.discount_value),
              row.discount_percent,
            ),
            conditions: row.discount_conditions,
          }
        : null,
      redemptionMethod: row.redemption_method,
      hasPromoCode: row.has_promo_code,
      nearestBranch: toNearestBranch(row),
      branchesCount: row.branches_count,
      validTo: row.valid_to.toISOString(),
      isFavorite: row.is_favorite,
      isNew: now.getTime() - row.created_at.getTime() < NEW_WINDOW_MS,
      viewsCount: row.views_count,
      attributes: row.attributes ?? {},
    };
  }
}

/** Null for an online-only business — it has no branch, and the card must still render. */
function toNearestBranch(row: DiscountCardRow): NearestBranch | null {
  if (row.branch_id === null || row.branch_name === null || row.branch_address === null) {
    return null;
  }
  return {
    branchId: row.branch_id,
    name: row.branch_name,
    address: row.branch_address,
    lat: row.branch_lat,
    lng: row.branch_lng,
    distanceMeters:
      row.branch_distance_meters === null ? null : Math.round(row.branch_distance_meters),
    isOpenNow: row.branch_is_open_now ?? false,
    closesAt: row.branch_closes_at,
    tradeCenterName: row.trade_center_name,
  };
}
