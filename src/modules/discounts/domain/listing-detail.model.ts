import type {
  BranchTradeCenter,
  BranchTradeCenterFieldValue,
  DeliveryZone,
  WorkingHours,
} from '../../branches/domain/entities/branch.entity';
import type { BusinessContacts } from '../../business/domain/entities/business.entity';
import type { ListingOptionGroup } from '../../listings/domain/entities/listing.entity';
import type { RedemptionMethod } from '../../listings/domain/enums/redemption-method.enum';
import { RedemptionPeriod } from '../../listings/domain/enums/redemption-period.enum';
import type { DiscountCard } from './discount-card.model';

/**
 * One of the listing's branches on the detail screen. Unlike the card's `nearestBranch` this is the
 * full set — the student picks which one to visit — so each carries its own opening hours, delivery
 * zone and trade-centre location. The value types are the ones the owner-side branch API already
 * publishes, so a branch reads identically on both sides of the product.
 */
export interface DetailBranch {
  branchId: string;
  name: string;
  address: string;
  landmark: string | null;
  lat: number;
  lng: number;
  /** Null when the request carried no coordinates. */
  distanceMeters: number | null;
  tradeCenter: BranchTradeCenter | null;
  tradeCenterFields: BranchTradeCenterFieldValue[];
  workingHours: WorkingHours[];
  deliveryZone: DeliveryZone | null;
}

/** The business behind the listing — the contact block on the detail screen. */
export interface DetailBusiness {
  id: string;
  name: string;
  logoUrl: string | null;
  phone: string;
  contacts: BusinessContacts | null;
  rating: number | null;
}

/**
 * How the offer is claimed. `promoCode` and `remainingForUser` are personal: both are null for an
 * anonymous viewer (STUDENT_FEED.md D5), and `remainingForUser` is also null when the listing sets
 * no per-user limit — there is nothing left to count down.
 */
export interface DetailRedemption {
  method: RedemptionMethod;
  promoCode: string | null;
  url: string | null;
  perUserLimit: number | null;
  perUserPeriod: RedemptionPeriod | null;
  totalLimit: number | null;
  usedCount: number;
  remainingForUser: number | null;
}

/**
 * The full listing behind `POST /v1/discounts/detail` (STUDENT_FEED.md §9): everything the card
 * shows plus the fields that only matter once the student opens the offer — the description, all
 * images, every branch, the option groups and the redemption block.
 */
export interface ListingDetail extends DiscountCard {
  description: string | null;
  /** Every image, in order; the card only carries the cover and the count. */
  images: string[];
  optionGroups: ListingOptionGroup[];
  redemption: DetailRedemption;
  branches: DetailBranch[];
  business: DetailBusiness;
  validFrom: string;
  createdAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Start of the window a per-user redemption limit is counted over, or `null` for "since the
 * beginning" (`TOTAL`, and a limit stored without a period).
 *
 * The windows are rolling rather than calendar-aligned: a calendar month would need a timezone to
 * be meaningful, and "twice a day" reads to a student as "twice in the last 24 hours" anyway.
 * MONTH is 30 days for the same reason.
 */
export function redemptionWindowStart(period: RedemptionPeriod | null, now: Date): Date | null {
  switch (period) {
    case RedemptionPeriod.DAY:
      return new Date(now.getTime() - DAY_MS);
    case RedemptionPeriod.WEEK:
      return new Date(now.getTime() - 7 * DAY_MS);
    case RedemptionPeriod.MONTH:
      return new Date(now.getTime() - 30 * DAY_MS);
    default:
      return null;
  }
}
