import { PriceUnit } from '../../catalog/domain/enums/price-unit.enum';
import { DiscountType } from '../domain/enums/discount-type.enum';
import { RedemptionMethod } from '../domain/enums/redemption-method.enum';
import { RedemptionPeriod } from '../domain/enums/redemption-period.enum';
import { SelectionType } from '../domain/enums/selection-type.enum';

/** Discount as submitted (no `finalPrice` — the server computes it). LISTINGS.md §4/§5. */
export interface DiscountInput {
  type: DiscountType;
  value: number;
  conditions: string | null;
  appliesToOptions: boolean;
}

/** Redemption configuration as submitted (LISTINGS.md §7). */
export interface RedemptionInput {
  method: RedemptionMethod;
  promoCode: string | null;
  url: string | null;
  perUserLimit: number | null;
  perUserPeriod: RedemptionPeriod | null;
  totalLimit: number | null;
}

/** A submitted add-on option (LISTINGS.md §8). Absent optionals are normalised in the DTO. */
export interface OptionInput {
  name: string;
  priceDelta: number;
  isAvailable: boolean;
  sortOrder: number | null;
}

/** A submitted option group (LISTINGS.md §8). */
export interface OptionGroupInput {
  name: string;
  selectionType: SelectionType;
  isRequired: boolean;
  minSelect: number | null;
  maxSelect: number | null;
  sortOrder: number | null;
  options: OptionInput[];
}

/**
 * Normalised create-listing payload (from CreateListingRequestDto). Absent optionals are `null`
 * (scalars), `[]` (arrays) or `null` (attributes). The service validates and computes from this.
 */
export interface CreateListingInput {
  branchIds: string[];
  categoryKey: string;
  customCategoryName: string | null;
  title: string;
  description: string | null;
  images: string[];
  priceUnit: PriceUnit;
  originalPrice: number;
  currency: string;
  discount: DiscountInput;
  redemption: RedemptionInput;
  validFrom: Date;
  validTo: Date;
  attributes: Record<string, string> | null;
  optionGroups: OptionGroupInput[];
}

/**
 * Normalised edit-listing payload (from UpdateListingRequestDto). Same shape as create minus
 * `currency` — currency is immutable on edit; the stored value is kept.
 */
export type UpdateListingInput = Omit<CreateListingInput, 'currency'>;
