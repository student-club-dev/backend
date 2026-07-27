import { PriceUnit } from '../../../catalog/domain/enums/price-unit.enum';
import { DiscountType } from '../enums/discount-type.enum';
import { ListingStatus } from '../enums/listing-status.enum';
import { RedemptionMethod } from '../enums/redemption-method.enum';
import { RedemptionPeriod } from '../enums/redemption-period.enum';
import { SelectionType } from '../enums/selection-type.enum';

/**
 * A listing's discount configuration with the server-computed `finalPrice` (LISTINGS.md §4). Money
 * fields are whole so'm (BigInt in Prisma, `number` in the domain — serialised to a JSON number).
 */
export interface ListingDiscount {
  type: DiscountType;
  value: number;
  finalPrice: number;
  conditions: string | null;
  appliesToOptions: boolean;
  /** false for a plain single-price offer (`attributes._regular === "1"`, STUDENT_FEED.md Q0). */
  isDiscount: boolean;
  /** Normalised percent for feed sorting and faceting; null for regular listings. */
  percent: number | null;
}

/** A listing's redemption configuration (LISTINGS.md §7). `usedCount` is server-owned. */
export interface ListingRedemption {
  method: RedemptionMethod;
  promoCode: string | null;
  url: string | null;
  perUserLimit: number | null;
  perUserPeriod: RedemptionPeriod | null;
  totalLimit: number | null;
  usedCount: number;
}

/** A single add-on option within an option group (LISTINGS.md §8). `priceDelta` may be negative. */
export interface ListingOption {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
  sortOrder: number;
}

/** A group of add-on options attached to a listing (LISTINGS.md §8). */
export interface ListingOptionGroup {
  id: string;
  name: string;
  selectionType: SelectionType;
  isRequired: boolean;
  minSelect: number | null;
  maxSelect: number | null;
  sortOrder: number;
  options: ListingOption[];
}

/**
 * The Listing aggregate root. Pure domain type — the presentation layer projects it to ListingDto
 * and the infrastructure layer maps it from the Prisma row. `branchIds` are the associated branches
 * (empty when unspecified). Money fields are whole so'm as `number`.
 */
export interface Listing {
  id: string;
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
  optionGroups: ListingOptionGroup[];
  status: ListingStatus;
  rejectionReason: string | null;
  viewsCount: number;
  createdAt: Date;
  updatedAt: Date;
}
