import { discountBadge } from '../domain/discount-badge';
import type { MapMarker } from '../domain/map-marker.model';
import { priceLabel } from '../domain/price-label';
import type { MapMarkerRow } from './map-marker.sql';

/**
 * Maps a raw marker row into the wire model. Like {@link DiscountCardMapper}, everything the client
 * must not compute for itself is finished here: the pin's price label and its badge.
 *
 * Money arrives as BigInt (int8 columns) and leaves as a number — whole so'm always fits.
 */
export class MapMarkerMapper {
  static toMarker(row: MapMarkerRow): MapMarker {
    const finalPrice = Number(row.final_price);

    return {
      listingId: row.listing_id,
      branchId: row.branch_id,
      lat: row.lat,
      lng: row.lng,
      priceLabel: priceLabel(finalPrice),
      finalPrice,
      // A regular listing carries no badge (Q0) — it is still a pin, just a plain one.
      discountBadge: row.is_discount
        ? discountBadge(row.discount_type, Number(row.discount_value), row.discount_percent)
        : null,
      businessType: row.business_type,
      accentColor: row.accent_color,
      isDiscount: row.is_discount,
      isFavorite: row.is_favorite,
      discountPercent: row.discount_percent,
    };
  }
}
