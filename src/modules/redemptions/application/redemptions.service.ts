import { randomBytes } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BRANCH_REPOSITORY, BranchRepository } from '../../branches/domain/branches.repository';
import {
  BUSINESS_READ,
  BusinessReadRepository,
} from '../../business/domain/business-read.repository';
import { Listing } from '../../listings/domain/entities/listing.entity';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { RedemptionPeriod } from '../../listings/domain/enums/redemption-period.enum';
import { LISTING_REPOSITORY, ListingRepository } from '../../listings/domain/listing.repository';
import { Redemption } from '../domain/entities/redemption.entity';
import { RedemptionStatus } from '../domain/enums/redemption-status.enum';
import {
  REDEMPTION_REPOSITORY,
  RedemptionPage,
  RedemptionRepository,
  RedemptionView,
} from '../domain/redemption.repository';
import {
  ConfirmInput,
  DiscountBrief,
  InvalidReason,
  StartResult,
  VerifyResult,
} from './redemptions.io';

/** A PENDING code is valid for this long after `start`. */
const REDEMPTION_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 86_400_000;

/**
 * Redemption use-cases (DISCOUNTS_BUSINESS_API §5.6). A student's `start` issues a single-use code
 * (PENDING); the cashier — the business owner — `verify`s then `confirm`s it, which increments the
 * listing's `usedCount`. Per-user and total limits are enforced on both start and confirm. Depends
 * on repository interfaces only.
 */
@Injectable()
export class RedemptionsService {
  constructor(
    @Inject(REDEMPTION_REPOSITORY) private readonly redemptions: RedemptionRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(BUSINESS_READ) private readonly businesses: BusinessReadRepository,
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
  ) {}

  /** Student: issue (or reuse) a PENDING code for an ACTIVE listing, respecting the limits. */
  async start(user: AuthenticatedUser, listingId: string): Promise<StartResult> {
    const listing = await this.listings.findById(listingId);
    if (listing === null) {
      throw AppException.notFound(ERROR_CODE.LISTING_NOT_FOUND, 'E’lon topilmadi');
    }
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new AppException(ERROR_CODE.LISTING_NOT_ACTIVE, 409, 'E’lon faol emas');
    }
    await this.assertWithinLimits(listing, user.id);

    const now = new Date();
    const existing = await this.redemptions.findUnexpiredPending(user.id, listingId, now);
    if (existing !== null && existing.expiresAt !== null) {
      return { code: existing.code, expiresAt: existing.expiresAt };
    }
    const created = await this.redemptions.createPending({
      listingId,
      studentId: user.id,
      code: generateCode(),
      expiresAt: new Date(now.getTime() + REDEMPTION_TTL_MS),
    });
    return {
      code: created.code,
      expiresAt: created.expiresAt ?? new Date(now.getTime() + REDEMPTION_TTL_MS),
    };
  }

  /** Cashier: check a code — soft result (`isValid` + reason), always 200. */
  async verify(user: AuthenticatedUser, listingId: string, code: string): Promise<VerifyResult> {
    const listing = await this.assertOwnedListing(user, listingId);
    const redemption = await this.redemptions.findByCode(code);
    const reason = await this.softInvalidReason(redemption, listing);
    if (reason !== null || redemption === null) {
      return { isValid: false, invalidReason: reason, student: null, discount: null };
    }
    const student = await this.redemptions.findStudentBrief(redemption.studentId);
    return { isValid: true, invalidReason: null, student, discount: discountBrief(listing) };
  }

  /** Cashier: mark a code redeemed (PENDING → CONFIRMED, usedCount++). Hard errors on invalidity. */
  async confirm(
    user: AuthenticatedUser,
    listingId: string,
    input: ConfirmInput,
  ): Promise<RedemptionView> {
    const listing = await this.assertOwnedListing(user, listingId);
    const redemption = await this.redemptions.findByCode(input.code);
    if (redemption === null || redemption.listingId !== listingId) {
      throw AppException.notFound(ERROR_CODE.REDEMPTION_INVALID_CODE, 'Kod noto‘g‘ri');
    }
    if (redemption.status === RedemptionStatus.CONFIRMED) {
      throw AppException.conflict(ERROR_CODE.ALREADY_REDEEMED, 'Kod allaqachon ishlatilgan');
    }
    if (this.isExpired(redemption)) {
      throw AppException.conflict(ERROR_CODE.REDEMPTION_INVALID_CODE, 'Kod muddati tugagan');
    }
    await this.assertWithinLimits(listing, redemption.studentId);

    const branchId = await this.resolveBranch(listing, input.branchId);
    const confirmed = await this.redemptions.confirm(
      redemption.id,
      branchId,
      input.amount,
      new Date(),
    );
    if (confirmed === null) {
      // A concurrent confirm won the PENDING → CONFIRMED race.
      throw AppException.conflict(ERROR_CODE.ALREADY_REDEEMED, 'Kod allaqachon ishlatilgan');
    }
    const student = await this.redemptions.findStudentBrief(confirmed.studentId);
    return {
      redemption: confirmed,
      student: student ?? {
        id: confirmed.studentId,
        fullName: null,
        username: null,
        universityId: null,
      },
    };
  }

  /** Owner: the listing's confirmed-redemption history (paginated). */
  async listByListing(
    user: AuthenticatedUser,
    listingId: string,
    page: number,
    size: number,
  ): Promise<RedemptionPage> {
    await this.assertOwnedListing(user, listingId);
    return this.redemptions.listConfirmedByListing(listingId, page, size);
  }

  /** The listing must exist (404) and its business belong to the caller (403). Returns the listing. */
  private async assertOwnedListing(user: AuthenticatedUser, listingId: string): Promise<Listing> {
    const listing = await this.listings.findById(listingId);
    if (listing === null) {
      throw AppException.notFound(ERROR_CODE.LISTING_NOT_FOUND, 'E’lon topilmadi');
    }
    const summary = await this.businesses.findSummaryById(listing.businessId);
    if (summary === null) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    if (summary.ownerId !== user.id) {
      throw AppException.forbidden();
    }
    return listing;
  }

  private async softInvalidReason(
    redemption: Redemption | null,
    listing: Listing,
  ): Promise<InvalidReason | null> {
    if (redemption === null || redemption.listingId !== listing.id) {
      return 'INVALID_CODE';
    }
    if (redemption.status === RedemptionStatus.CONFIRMED) {
      return 'ALREADY_REDEEMED';
    }
    if (this.isExpired(redemption)) {
      return 'EXPIRED';
    }
    if (await this.limitReached(listing, redemption.studentId)) {
      return 'LIMIT_REACHED';
    }
    return null;
  }

  private isExpired(redemption: Redemption): boolean {
    return (
      redemption.status === RedemptionStatus.EXPIRED ||
      (redemption.expiresAt !== null && redemption.expiresAt.getTime() < Date.now())
    );
  }

  private async assertWithinLimits(listing: Listing, studentId: string): Promise<void> {
    if (await this.limitReached(listing, studentId)) {
      throw AppException.conflict(ERROR_CODE.REDEMPTION_LIMIT_REACHED, 'Chegirma limiti tugagan');
    }
  }

  private async limitReached(listing: Listing, studentId: string): Promise<boolean> {
    const { totalLimit, perUserLimit, perUserPeriod, usedCount } = listing.redemption;
    if (totalLimit !== null && usedCount >= totalLimit) {
      return true;
    }
    if (perUserLimit !== null) {
      const count = await this.redemptions.countConfirmed(
        listing.id,
        studentId,
        periodStart(perUserPeriod),
      );
      if (count >= perUserLimit) {
        return true;
      }
    }
    return false;
  }

  private async resolveBranch(listing: Listing, branchId: string | null): Promise<string | null> {
    if (branchId === null) {
      return null;
    }
    const branch = await this.branches.findById(branchId);
    if (branch === null || branch.businessId !== listing.businessId) {
      throw AppException.validation({ branchId: 'Filial ushbu biznesga tegishli emas' });
    }
    return branchId;
  }
}

/** A single-use, unambiguous uppercase-hex code (48 bits of entropy). */
function generateCode(): string {
  return randomBytes(6).toString('hex').toUpperCase();
}

/** Rolling-window start for a per-user period; `null` = all-time (TOTAL / unset). */
function periodStart(period: RedemptionPeriod | null): Date | null {
  if (period === null || period === RedemptionPeriod.TOTAL) {
    return null;
  }
  const spanMs =
    period === RedemptionPeriod.DAY
      ? DAY_MS
      : period === RedemptionPeriod.WEEK
        ? 7 * DAY_MS
        : 30 * DAY_MS;
  return new Date(Date.now() - spanMs);
}

function discountBrief(listing: Listing): DiscountBrief {
  return {
    type: listing.discount.type,
    value: listing.discount.value,
    finalPrice: listing.discount.finalPrice,
    originalPrice: listing.originalPrice,
  };
}
