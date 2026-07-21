import { PriceUnit } from '../../catalog/domain/enums/price-unit.enum';
import { Listing, ListingDiscount, ListingRedemption } from './entities/listing.entity';
import { ListingStatus } from './enums/listing-status.enum';
import { SelectionType } from './enums/selection-type.enum';

/** Injection token for the listing repository port (bound to the Prisma impl in the module). */
export const LISTING_REPOSITORY = Symbol('LISTING_REPOSITORY');

/** An option to persist under an option group (no id yet — the DB assigns it). */
export interface CreateOptionData {
  name: string;
  priceDelta: number;
  isAvailable: boolean;
  sortOrder: number;
}

/** An option group to persist under a listing (no id yet — the DB assigns it). */
export interface CreateOptionGroupData {
  name: string;
  selectionType: SelectionType;
  isRequired: boolean;
  minSelect: number | null;
  maxSelect: number | null;
  sortOrder: number;
  options: CreateOptionData[];
}

/**
 * The whole Listing aggregate to persist atomically. `businessId`, `status` and the normalised
 * `discount` (with the server-computed `finalPrice`) are supplied by the service; `branchIds` are
 * the associations to snapshot as ListingBranch rows (empty = none).
 */
export interface CreateListingData {
  businessId: string;
  branchIds: string[];
  categoryKey: string;
  customCategoryName: string | null;
  title: string;
  description: string | null;
  images: string[];
  priceUnit: PriceUnit;
  originalPrice: number;
  currency: string;
  discount: ListingDiscount;
  redemption: ListingRedemption;
  validFrom: Date;
  validTo: Date;
  attributes: Record<string, string> | null;
  optionGroups: CreateOptionGroupData[];
  status: ListingStatus;
}

/**
 * Listing data-access port. The application layer depends on this interface only; the Prisma
 * implementation lives in infrastructure. Phase 2 needs only the atomic aggregate create; `findById`
 * arrives with the submit flow.
 */
export interface ListingRepository {
  /** Persists the whole aggregate (listing + branches + option groups + options) atomically. */
  create(data: CreateListingData): Promise<Listing>;
}
