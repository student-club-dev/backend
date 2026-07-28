import { DiscountType } from '../../listings/domain/enums/discount-type.enum';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { RedemptionMethod } from '../../listings/domain/enums/redemption-method.enum';
import { ListingStats } from '../../listings/domain/listing.repository';
import { AdminListing, AdminListingSummary } from './entities/admin-listing.entity';
import { AdminListingKind } from './enums/admin-listing-kind.enum';
import { AdminListingPriceBasis } from './enums/admin-listing-price-basis.enum';
import { AdminListingSort } from './enums/admin-listing-sort.enum';

/** Injection token for the admin listing read port (bound to the Prisma impl). */
export const ADMIN_LISTING_READ_REPOSITORY = Symbol('ADMIN_LISTING_READ_REPOSITORY');

/**
 * Filters for the admin listing list. Every field narrows (AND); `null` / empty means "no
 * constraint". `page`/`size` are 1-based and already defaulted by the presentation layer.
 */
export interface AdminListingListFilter {
  /** Free text against title / description (case-insensitive contains). */
  q: string | null;
  businessId: string | null;
  /** Keep only listings whose business belongs to this owner. */
  ownerId: string | null;
  /** One or more statuses to keep; empty means every status (DRAFT/PENDING_REVIEW/REJECTED too). */
  statuses: ListingStatus[];
  categoryKey: string | null;
  /** Business type key (via the listing's business). */
  type: string | null;
  /** Business type group key (via the business type). */
  groupKey: string | null;
  /** Keep listings with at least one branch in this region. */
  regionId: string | null;
  /** Keep listings with at least one branch in this district. */
  districtId: string | null;
  priceMin: number | null;
  priceMax: number | null;
  /** Which price column `priceMin`/`priceMax` compare against (default FINAL). */
  priceBasis: AdminListingPriceBasis;
  discountType: DiscountType | null;
  /** Discount/regular facet (default ALL). */
  listingKind: AdminListingKind;
  redemptionMethod: RedemptionMethod | null;
  createdFrom: Date | null;
  createdTo: Date | null;
  /** Keep listings whose `validTo` is at or before this instant. */
  validToBefore: Date | null;
  /** Keep listings whose `validTo` is at or after this instant. */
  validToAfter: Date | null;
  sort: AdminListingSort;
  page: number;
  size: number;
}

/** A page of admin listing summaries plus the unpaginated total (the DTO derives `hasNext`). */
export interface AdminListingPage {
  items: AdminListingSummary[];
  total: number;
}

/** Read-only, unscoped access to every `listings` row for the admin panel. Prisma-backed. */
export interface AdminListingReadRepository {
  /** The filtered, paginated listing list across all businesses. */
  list(filter: AdminListingListFilter): Promise<AdminListingPage>;

  /** The full listing record plus the business name, or `null` if none. */
  findById(id: string): Promise<AdminListing | null>;

  /** Aggregated analytics for the listing, or `null` when it does not exist. */
  stats(id: string): Promise<ListingStats | null>;
}
