import { ERROR_CODE } from '../../../common/errors/error-code';
import { DiscountType } from '../../listings/domain/enums/discount-type.enum';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { RedemptionMethod } from '../../listings/domain/enums/redemption-method.enum';
import {
  AdminListingListFilter,
  AdminListingReadRepository,
} from '../domain/admin-listing-read.repository';
import { AdminListingKind } from '../domain/enums/admin-listing-kind.enum';
import { AdminListingPriceBasis } from '../domain/enums/admin-listing-price-basis.enum';
import { AdminListingSort } from '../domain/enums/admin-listing-sort.enum';
import { AdminListingsService } from './admin-listings.service';

function makeRepo(overrides: Partial<AdminListingReadRepository> = {}): AdminListingReadRepository {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    stats: jest.fn(),
    ...overrides,
  };
}

function makeFilter(overrides: Partial<AdminListingListFilter> = {}): AdminListingListFilter {
  return {
    q: null,
    businessId: null,
    ownerId: null,
    statuses: [],
    categoryKey: null,
    type: null,
    groupKey: null,
    regionId: null,
    districtId: null,
    priceMin: null,
    priceMax: null,
    priceBasis: AdminListingPriceBasis.FINAL,
    discountType: null,
    listingKind: AdminListingKind.ALL,
    redemptionMethod: null,
    createdFrom: null,
    createdTo: null,
    validToBefore: null,
    validToAfter: null,
    sort: AdminListingSort.NEWEST,
    page: 1,
    size: 20,
    ...overrides,
  };
}

describe('AdminListingsService', () => {
  describe('list', () => {
    it('passes the filter through to the repository unchanged and returns its page', async () => {
      const page = { items: [], total: 0 };
      const repo = makeRepo({ list: jest.fn().mockResolvedValue(page) });
      const service = new AdminListingsService(repo);
      const filter = makeFilter({
        q: 'pizza',
        statuses: [ListingStatus.DRAFT, ListingStatus.PENDING_REVIEW, ListingStatus.ACTIVE],
        priceMin: 10000,
        priceMax: 50000,
        priceBasis: AdminListingPriceBasis.ORIGINAL,
        discountType: DiscountType.PERCENT,
        listingKind: AdminListingKind.DISCOUNT,
        redemptionMethod: RedemptionMethod.QR,
        regionId: 'TOSHKENT_SHAHRI',
        page: 2,
        size: 5,
      });

      const result = await service.list(filter);

      expect(repo.list).toHaveBeenCalledWith(filter);
      expect(result).toBe(page);
    });
  });

  describe('getById', () => {
    it('returns the listing when found', async () => {
      const listing = { listing: { id: 'lst-1' }, businessName: 'Navruz Cafe' };
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(listing) });
      const service = new AdminListingsService(repo);

      const result = await service.getById('lst-1');

      expect(result).toBe(listing);
      expect(repo.findById).toHaveBeenCalledWith('lst-1');
    });

    it('throws 404 LISTING_NOT_FOUND when the id is unknown', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = new AdminListingsService(repo);

      await expect(service.getById('nope')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
      });
    });
  });

  describe('stats', () => {
    it('derives conversionRate from the aggregated stats', async () => {
      const repo = makeRepo({
        stats: jest.fn().mockResolvedValue({
          viewsCount: 200,
          favoritesCount: 12,
          redemptionsCount: 50,
          totalRevenue: 250000,
        }),
      });
      const service = new AdminListingsService(repo);

      const result = await service.stats('lst-1');

      expect(result).toEqual({
        listingId: 'lst-1',
        viewsCount: 200,
        favoritesCount: 12,
        redemptionsCount: 50,
        conversionRate: 0.25,
        totalRevenue: 250000,
      });
    });

    it('returns conversionRate 0 when there are no views', async () => {
      const repo = makeRepo({
        stats: jest.fn().mockResolvedValue({
          viewsCount: 0,
          favoritesCount: 0,
          redemptionsCount: 0,
          totalRevenue: 0,
        }),
      });
      const service = new AdminListingsService(repo);

      const result = await service.stats('lst-1');

      expect(result.conversionRate).toBe(0);
    });

    it('throws 404 LISTING_NOT_FOUND when the id is unknown', async () => {
      const repo = makeRepo({ stats: jest.fn().mockResolvedValue(null) });
      const service = new AdminListingsService(repo);

      await expect(service.stats('nope')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
      });
    });
  });
});
