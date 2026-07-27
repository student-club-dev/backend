import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { RedemptionMethod } from '../../listings/domain/enums/redemption-method.enum';
import { RedemptionPeriod } from '../../listings/domain/enums/redemption-period.enum';
import { DetailRepository } from '../domain/detail.repository';
import { DetailRedemption, ListingDetail } from '../domain/listing-detail.model';
import { DetailService } from './detail.service';

const STUDENT: AuthenticatedUser = { id: 'stu_1', type: AccountType.STUDENT };
const OWNER: AuthenticatedUser = { id: 'own_1', type: AccountType.BUSINESS };

const REDEMPTION: DetailRedemption = {
  method: RedemptionMethod.PROMO_CODE,
  promoCode: 'STUD30',
  url: null,
  perUserLimit: null,
  perUserPeriod: null,
  totalLimit: 100,
  usedCount: 7,
  remainingForUser: null,
};

function makeDetail(redemption: Partial<DetailRedemption> = {}): ListingDetail {
  return {
    id: 'lst_1',
    businessId: 'biz_1',
    businessName: 'Choyxona Navruz',
    businessLogoUrl: null,
    businessType: 'NATIONAL_FOOD',
    groupKey: 'FOOD',
    categoryKey: 'PALOV',
    categoryLabel: 'Osh',
    matchedVia: 'ALL',
    title: 'Osh (1 porsiya)',
    imageUrl: 'a.jpg',
    imagesCount: 2,
    priceUnit: 'PER_ITEM',
    isDiscount: true,
    originalPrice: 30000,
    finalPrice: 21000,
    savedAmount: 9000,
    currency: 'UZS',
    discount: { type: 'PERCENT', value: 30, badge: '−30%', conditions: null },
    redemptionMethod: 'PROMO_CODE',
    hasPromoCode: true,
    nearestBranch: null,
    branchesCount: 1,
    validTo: '2026-08-06T00:00:00.000Z',
    isFavorite: false,
    isNew: true,
    viewsCount: 412,
    attributes: { _phone: '+998901112233' },
    description: 'Juda mazali osh',
    images: ['a.jpg', 'b.jpg'],
    optionGroups: [],
    redemption: { ...REDEMPTION, ...redemption },
    branches: [],
    business: {
      id: 'biz_1',
      name: 'Choyxona Navruz',
      logoUrl: null,
      phone: '+998901112233',
      contacts: null,
      rating: 4.6,
    },
    validFrom: '2026-07-01T00:00:00.000Z',
    createdAt: '2026-07-20T00:00:00.000Z',
  };
}

function makeRepository(
  detail: ListingDetail | null = makeDetail(),
  used = 0,
): jest.Mocked<DetailRepository> {
  return {
    findVisibleById: jest.fn().mockResolvedValue(detail),
    countRedemptions: jest.fn().mockResolvedValue(used),
    registerView: jest.fn().mockResolvedValue(undefined),
  };
}

const QUERY = { listingId: 'lst_1', geo: null, viewer: null };

describe('DetailService', () => {
  describe('visibility (Q4)', () => {
    it('reports 404 LISTING_NOT_FOUND when the listing is not visible', async () => {
      const repository = makeRepository(null);

      await expect(new DetailService(repository).getDetail(QUERY)).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
        message: 'E’lon topilmadi',
      });
    });

    it('does not count a view for a listing that was not found', async () => {
      const repository = makeRepository(null);

      await expect(
        new DetailService(repository).getDetail({ ...QUERY, viewer: STUDENT }),
      ).rejects.toBeDefined();

      expect(repository.registerView).not.toHaveBeenCalled();
    });
  });

  describe('viewer identity (D5)', () => {
    it('passes the student id down so the query can personalise', async () => {
      const repository = makeRepository();

      await new DetailService(repository).getDetail({ ...QUERY, viewer: STUDENT });

      expect(repository.findVisibleById).toHaveBeenCalledWith(
        expect.objectContaining({ listingId: 'lst_1', studentId: 'stu_1' }),
      );
    });

    it('treats a business-owner token as anonymous — it personalises nothing here', async () => {
      const repository = makeRepository();

      const detail = await new DetailService(repository).getDetail({ ...QUERY, viewer: OWNER });

      expect(repository.findVisibleById).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: null }),
      );
      expect(detail.redemption.promoCode).toBeNull();
    });
  });

  describe('promoCode', () => {
    it('hides the promo code from an anonymous viewer', async () => {
      const repository = makeRepository();

      const detail = await new DetailService(repository).getDetail(QUERY);

      expect(detail.redemption.promoCode).toBeNull();
      expect(detail.redemption.remainingForUser).toBeNull();
    });

    it('returns the promo code to a signed-in student', async () => {
      const repository = makeRepository();

      const detail = await new DetailService(repository).getDetail({ ...QUERY, viewer: STUDENT });

      expect(detail.redemption.promoCode).toBe('STUD30');
    });

    it('leaves the rest of the redemption block intact when hiding the code', async () => {
      const repository = makeRepository();

      const detail = await new DetailService(repository).getDetail(QUERY);

      expect(detail.redemption).toMatchObject({ totalLimit: 100, usedCount: 7 });
    });
  });

  describe('remainingForUser', () => {
    it('is null when the listing sets no per-user limit', async () => {
      const repository = makeRepository();

      const detail = await new DetailService(repository).getDetail({ ...QUERY, viewer: STUDENT });

      expect(detail.redemption.remainingForUser).toBeNull();
      expect(repository.countRedemptions).not.toHaveBeenCalled();
    });

    it('is the limit minus what the student already used', async () => {
      const repository = makeRepository(makeDetail({ perUserLimit: 3 }), 1);

      const detail = await new DetailService(repository).getDetail({ ...QUERY, viewer: STUDENT });

      expect(detail.redemption.remainingForUser).toBe(2);
    });

    it('never goes negative when the limit was lowered after the fact', async () => {
      const repository = makeRepository(makeDetail({ perUserLimit: 1 }), 4);

      const detail = await new DetailService(repository).getDetail({ ...QUERY, viewer: STUDENT });

      expect(detail.redemption.remainingForUser).toBe(0);
    });

    it('counts over the last 24 hours for a DAY limit', async () => {
      const repository = makeRepository(
        makeDetail({ perUserLimit: 2, perUserPeriod: RedemptionPeriod.DAY }),
      );
      const before = Date.now();

      await new DetailService(repository).getDetail({ ...QUERY, viewer: STUDENT });

      const [, , since] = repository.countRedemptions.mock.calls[0];
      expect(since).not.toBeNull();
      expect(before - (since as Date).getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
    });

    it('counts over the whole lifetime for a TOTAL limit', async () => {
      const repository = makeRepository(
        makeDetail({ perUserLimit: 2, perUserPeriod: RedemptionPeriod.TOTAL }),
      );

      await new DetailService(repository).getDetail({ ...QUERY, viewer: STUDENT });

      expect(repository.countRedemptions).toHaveBeenCalledWith('lst_1', 'stu_1', null);
    });
  });

  describe('view counter', () => {
    it('counts the view for a signed-in student', async () => {
      const repository = makeRepository();

      await new DetailService(repository).getDetail({ ...QUERY, viewer: STUDENT });

      expect(repository.registerView).toHaveBeenCalledWith('lst_1', 'stu_1');
    });

    it('does not count an anonymous view — an IP is not an identity', async () => {
      const repository = makeRepository();

      await new DetailService(repository).getDetail(QUERY);

      expect(repository.registerView).not.toHaveBeenCalled();
    });

    it('does not count a business-owner view', async () => {
      const repository = makeRepository();

      await new DetailService(repository).getDetail({ ...QUERY, viewer: OWNER });

      expect(repository.registerView).not.toHaveBeenCalled();
    });
  });
});
