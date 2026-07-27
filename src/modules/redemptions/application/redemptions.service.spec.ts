import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BranchRepository } from '../../branches/domain/branches.repository';
import { BusinessReadRepository } from '../../business/domain/business-read.repository';
import { Listing } from '../../listings/domain/entities/listing.entity';
import { DiscountType } from '../../listings/domain/enums/discount-type.enum';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { PriceUnit } from '../../catalog/domain/enums/price-unit.enum';
import { RedemptionMethod } from '../../listings/domain/enums/redemption-method.enum';
import { Redemption } from '../domain/entities/redemption.entity';
import { RedemptionStatus } from '../domain/enums/redemption-status.enum';
import { RedemptionRepository } from '../domain/redemption.repository';
import { RedemptionsService } from './redemptions.service';

const owner: AuthenticatedUser = { id: 'owner-1', type: AccountType.BUSINESS };
const student: AuthenticatedUser = { id: 'stu-1', type: AccountType.STUDENT };
const LISTING_ID = 'lst-1';

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: LISTING_ID,
    businessId: 'biz-1',
    branchIds: [],
    categoryKey: 'PIZZA',
    customCategoryName: null,
    title: 'Pizza',
    description: null,
    images: ['cover.jpg'],
    priceUnit: PriceUnit.PER_ITEM,
    originalPrice: 55_000,
    currency: 'UZS',
    discount: {
      type: DiscountType.PERCENT,
      value: 20,
      finalPrice: 44_000,
      conditions: null,
      appliesToOptions: false,
      isDiscount: true,
      percent: 20,
    },
    redemption: {
      method: RedemptionMethod.QR,
      promoCode: null,
      url: null,
      perUserLimit: null,
      perUserPeriod: null,
      totalLimit: null,
      usedCount: 0,
    },
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validTo: new Date('2030-01-01T00:00:00Z'),
    attributes: null,
    optionGroups: [],
    status: ListingStatus.ACTIVE,
    rejectionReason: null,
    viewsCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function redemption(overrides: Partial<Redemption> = {}): Redemption {
  return {
    id: 'rdm-1',
    listingId: LISTING_ID,
    studentId: 'stu-1',
    branchId: null,
    code: 'ABC123',
    status: RedemptionStatus.PENDING,
    amount: null,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    redeemedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRedemptions(overrides: Partial<RedemptionRepository> = {}): RedemptionRepository {
  return {
    findByCode: jest.fn().mockResolvedValue(null),
    findUnexpiredPending: jest.fn().mockResolvedValue(null),
    createPending: jest.fn(async () => redemption()),
    confirm: jest.fn(async () => redemption({ status: RedemptionStatus.CONFIRMED })),
    countConfirmed: jest.fn().mockResolvedValue(0),
    findStudentBrief: jest
      .fn()
      .mockResolvedValue({ id: 'stu-1', fullName: 'Ali', username: 'ali', universityId: 'TATU' }),
    listConfirmedByListing: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    ...overrides,
  };
}

function makeListings(listing: Listing | null = makeListing()): { findById: jest.Mock } {
  return { findById: jest.fn().mockResolvedValue(listing) };
}

function makeBusinesses(ownerId: string | null = 'owner-1'): BusinessReadRepository {
  return {
    findSummaryById: jest.fn().mockResolvedValue(
      ownerId === null
        ? null
        : {
            id: 'biz-1',
            ownerId,
            type: 'CAFE_RESTAURANT',
            status: 'APPROVED',
            isOnlineOnly: false,
          },
    ),
  };
}

function makeBranches(): BranchRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue({ id: 'br-1', businessId: 'biz-1' }),
    findManyByBusiness: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    delete: jest.fn(),
    existsWithinRadius: jest.fn().mockResolvedValue(false),
  } as unknown as BranchRepository;
}

function makeService(
  redemptions: RedemptionRepository = makeRedemptions(),
  listings: { findById: jest.Mock } = makeListings(),
  businesses: BusinessReadRepository = makeBusinesses(),
  branches: BranchRepository = makeBranches(),
): RedemptionsService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new RedemptionsService(redemptions, listings as any, businesses, branches);
}

describe('RedemptionsService', () => {
  describe('start', () => {
    it('throws 404 when the listing does not exist', async () => {
      await expect(
        makeService(makeRedemptions(), makeListings(null)).start(student, LISTING_ID),
      ).rejects.toMatchObject({ code: ERROR_CODE.LISTING_NOT_FOUND, status: 404 });
    });

    it('throws 409 LISTING_NOT_ACTIVE when the listing is not ACTIVE', async () => {
      const service = makeService(
        makeRedemptions(),
        makeListings(makeListing({ status: ListingStatus.PAUSED })),
      );
      await expect(service.start(student, LISTING_ID)).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_ACTIVE,
        status: 409,
      });
    });

    it('throws 409 REDEMPTION_LIMIT_REACHED when the total limit is reached', async () => {
      const listing = makeListing({
        redemption: { ...makeListing().redemption, totalLimit: 5, usedCount: 5 },
      });
      await expect(
        makeService(makeRedemptions(), makeListings(listing)).start(student, LISTING_ID),
      ).rejects.toMatchObject({ code: ERROR_CODE.REDEMPTION_LIMIT_REACHED, status: 409 });
    });

    it('reuses an unexpired PENDING code instead of issuing a new one', async () => {
      const existing = redemption({ code: 'REUSED' });
      const redemptions = makeRedemptions({
        findUnexpiredPending: jest.fn().mockResolvedValue(existing),
      });
      const result = await makeService(redemptions).start(student, LISTING_ID);
      expect(result.code).toBe('REUSED');
      expect(redemptions.createPending).not.toHaveBeenCalled();
    });

    it('issues a new code when none exists', async () => {
      const redemptions = makeRedemptions();
      await makeService(redemptions).start(student, LISTING_ID);
      expect(redemptions.createPending).toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('throws 403 when the listing belongs to another owner', async () => {
      const service = makeService(
        makeRedemptions(),
        makeListings(),
        makeBusinesses('someone-else'),
      );
      await expect(service.verify(owner, LISTING_ID, 'ABC123')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
    });

    it('returns isValid=false INVALID_CODE for an unknown code', async () => {
      const result = await makeService().verify(owner, LISTING_ID, 'NOPE');
      expect(result).toMatchObject({ isValid: false, invalidReason: 'INVALID_CODE' });
    });

    it('returns isValid=false ALREADY_REDEEMED for a confirmed code', async () => {
      const redemptions = makeRedemptions({
        findByCode: jest.fn().mockResolvedValue(redemption({ status: RedemptionStatus.CONFIRMED })),
      });
      const result = await makeService(redemptions).verify(owner, LISTING_ID, 'ABC123');
      expect(result).toMatchObject({ isValid: false, invalidReason: 'ALREADY_REDEEMED' });
    });

    it('returns isValid=true with the student and discount for a valid code', async () => {
      const redemptions = makeRedemptions({
        findByCode: jest.fn().mockResolvedValue(redemption()),
      });
      const result = await makeService(redemptions).verify(owner, LISTING_ID, 'ABC123');
      expect(result.isValid).toBe(true);
      expect(result.student?.id).toBe('stu-1');
      expect(result.discount?.finalPrice).toBe(44_000);
    });
  });

  describe('confirm', () => {
    it('throws 404 REDEMPTION_INVALID_CODE for an unknown code', async () => {
      await expect(
        makeService().confirm(owner, LISTING_ID, { code: 'NOPE', branchId: null, amount: null }),
      ).rejects.toMatchObject({ code: ERROR_CODE.REDEMPTION_INVALID_CODE, status: 404 });
    });

    it('throws 409 ALREADY_REDEEMED for a confirmed code', async () => {
      const redemptions = makeRedemptions({
        findByCode: jest.fn().mockResolvedValue(redemption({ status: RedemptionStatus.CONFIRMED })),
      });
      await expect(
        makeService(redemptions).confirm(owner, LISTING_ID, {
          code: 'ABC123',
          branchId: null,
          amount: null,
        }),
      ).rejects.toMatchObject({ code: ERROR_CODE.ALREADY_REDEEMED, status: 409 });
    });

    it('throws 409 ALREADY_REDEEMED when the confirm race is lost (repo returns null)', async () => {
      const redemptions = makeRedemptions({
        findByCode: jest.fn().mockResolvedValue(redemption()),
        confirm: jest.fn().mockResolvedValue(null),
      });
      await expect(
        makeService(redemptions).confirm(owner, LISTING_ID, {
          code: 'ABC123',
          branchId: null,
          amount: null,
        }),
      ).rejects.toMatchObject({ code: ERROR_CODE.ALREADY_REDEEMED, status: 409 });
    });

    it('confirms a valid code and returns the redemption view', async () => {
      const redemptions = makeRedemptions({
        findByCode: jest.fn().mockResolvedValue(redemption()),
      });
      const result = await makeService(redemptions).confirm(owner, LISTING_ID, {
        code: 'ABC123',
        branchId: null,
        amount: 44_000,
      });
      expect(redemptions.confirm).toHaveBeenCalledWith('rdm-1', null, 44_000, expect.any(Date));
      expect(result.student.id).toBe('stu-1');
    });
  });
});
