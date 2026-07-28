import { ERROR_CODE } from '../../../common/errors/error-code';
import { PriceUnit } from '../../catalog/domain/enums/price-unit.enum';
import { UpdateListingInput } from '../../listings/application/listings.io';
import { ListingsService } from '../../listings/application/listings.service';
import { DiscountType } from '../../listings/domain/enums/discount-type.enum';
import { RedemptionMethod } from '../../listings/domain/enums/redemption-method.enum';
import { AdminListing } from '../domain/entities/admin-listing.entity';
import { AdminListingsService } from './admin-listings.service';
import { AdminListingsWriteService } from './admin-listings-write.service';

const LISTING = { listing: { id: 'lst-1' }, businessName: 'Navruz Cafe' } as AdminListing;

function makeReads(overrides: Partial<AdminListingsService> = {}): AdminListingsService {
  return {
    getById: jest.fn().mockResolvedValue(LISTING),
    ...overrides,
  } as AdminListingsService;
}

function makeListingsService(overrides: Partial<ListingsService> = {}): ListingsService {
  return {
    adminUpdate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ListingsService;
}

function baseInput(overrides: Partial<UpdateListingInput> = {}): UpdateListingInput {
  return {
    branchIds: [],
    categoryKey: 'PIZZA',
    customCategoryName: null,
    title: 'Katta pitsa',
    description: null,
    images: ['img-1'],
    priceUnit: PriceUnit.PER_ITEM,
    originalPrice: 55000,
    discount: { type: DiscountType.PERCENT, value: 20, conditions: null, appliesToOptions: false },
    redemption: {
      method: RedemptionMethod.QR,
      promoCode: null,
      url: null,
      perUserLimit: null,
      perUserPeriod: null,
      totalLimit: null,
    },
    validFrom: new Date('2026-08-01T00:00:00Z'),
    validTo: new Date('2026-09-01T00:00:00Z'),
    attributes: null,
    optionGroups: [],
    ...overrides,
  };
}

describe('AdminListingsWriteService', () => {
  describe('update', () => {
    it('reuses ListingsService.adminUpdate (ownership skipped) and returns the re-fetched admin record', async () => {
      const reads = makeReads();
      const listings = makeListingsService();
      const service = new AdminListingsWriteService(reads, listings);
      const input = baseInput();

      const result = await service.update('lst-1', input);

      expect(listings.adminUpdate).toHaveBeenCalledWith('lst-1', input);
      expect(reads.getById).toHaveBeenCalledWith('lst-1');
      expect(result).toBe(LISTING);
    });

    it('propagates 404 LISTING_NOT_FOUND from adminUpdate and does not re-fetch', async () => {
      const reads = makeReads();
      const listings = makeListingsService({
        adminUpdate: jest
          .fn()
          .mockRejectedValue({ code: ERROR_CODE.LISTING_NOT_FOUND, status: 404 }),
      });
      const service = new AdminListingsWriteService(reads, listings);

      await expect(service.update('nope', baseInput())).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
      });
      expect(reads.getById).not.toHaveBeenCalled();
    });
  });
});
