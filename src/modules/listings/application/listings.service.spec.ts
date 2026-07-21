import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BranchRepository } from '../../branches/domain/branches.repository';
import { BusinessReadRepository } from '../../business/domain/business-read.repository';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { CatalogRepository } from '../../catalog/domain/catalog.repository';
import { AttributeSpec } from '../../catalog/domain/entities/attribute-spec.entity';
import { Category } from '../../catalog/domain/entities/category.entity';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import { PriceUnit } from '../../catalog/domain/enums/price-unit.enum';
import { Listing } from '../domain/entities/listing.entity';
import { DiscountType } from '../domain/enums/discount-type.enum';
import { ListingStatus } from '../domain/enums/listing-status.enum';
import { RedemptionMethod } from '../domain/enums/redemption-method.enum';
import { SelectionType } from '../domain/enums/selection-type.enum';
import { CreateListingData, ListingRepository } from '../domain/listing.repository';
import { CreateListingInput } from './listings.io';
import { ListingsService } from './listings.service';

const owner: AuthenticatedUser = { id: 'owner-1', type: AccountType.BUSINESS };
const BUSINESS_ID = 'biz-1';

function createInput(overrides: Partial<CreateListingInput> = {}): CreateListingInput {
  return {
    branchIds: [],
    categoryKey: 'PIZZA',
    customCategoryName: null,
    title: 'Katta pizza chegirma',
    description: null,
    images: ['cover.jpg'],
    priceUnit: PriceUnit.PER_ITEM,
    originalPrice: 55_000,
    currency: 'UZS',
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

function category(key: string, requiresCustomName = false): Category {
  return {
    key,
    businessType: 'CAFE_RESTAURANT',
    nameUz: key,
    nameRu: null,
    iconUrl: null,
    sortOrder: 0,
    requiresCustomName,
    fields: [],
    gender: null,
  };
}

function spec(overrides: Partial<AttributeSpec> = {}): AttributeSpec {
  return {
    key: 'portionGrams',
    label: 'Portion',
    kind: AttributeFieldType.NUMBER,
    required: false,
    options: null,
    ...overrides,
  };
}

function listingFromData(data: CreateListingData): Listing {
  return {
    id: 'lst-1',
    businessId: data.businessId,
    branchIds: data.branchIds,
    categoryKey: data.categoryKey,
    customCategoryName: data.customCategoryName,
    title: data.title,
    description: data.description,
    images: data.images,
    priceUnit: data.priceUnit,
    originalPrice: data.originalPrice,
    currency: data.currency,
    discount: data.discount,
    redemption: data.redemption,
    validFrom: data.validFrom,
    validTo: data.validTo,
    attributes: data.attributes,
    optionGroups: data.optionGroups.map((group, index) => ({
      id: `g${index}`,
      ...group,
      options: group.options.map((option, optionIndex) => ({ id: `o${optionIndex}`, ...option })),
    })),
    status: data.status,
    rejectionReason: null,
    viewsCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeListings(): ListingRepository {
  return { create: jest.fn(async (data: CreateListingData) => listingFromData(data)) };
}

function makeBusinesses(ownerId: string | null): BusinessReadRepository {
  return {
    findSummaryById: jest.fn().mockResolvedValue(
      ownerId === null
        ? null
        : {
            id: BUSINESS_ID,
            ownerId,
            // DRAFT (not APPROVED) — a draft listing may still be created.
            type: 'CAFE_RESTAURANT',
            status: BusinessStatus.DRAFT,
            isOnlineOnly: false,
          },
    ),
  };
}

function makeCatalog(
  categories: Category[] | null = [category('PIZZA'), category('OTHER', true)],
  specs: AttributeSpec[] = [],
): CatalogRepository {
  return {
    findBusinessTypes: jest.fn().mockResolvedValue([]),
    findCategoriesByType: jest.fn().mockResolvedValue(categories),
    findAttributeSpecs: jest.fn().mockResolvedValue(specs),
    typeExists: jest.fn().mockResolvedValue(true),
    createType: jest.fn(),
    updateType: jest.fn(),
    deleteType: jest.fn(),
    countBusinessesOfType: jest.fn().mockResolvedValue(0),
    countCategoriesOfType: jest.fn().mockResolvedValue(0),
  };
}

function makeBranches(ownedIds: string[] = []): BranchRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(null),
    findManyByBusiness: jest.fn().mockResolvedValue(ownedIds.map((id) => ({ id }))),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    existsWithinRadius: jest.fn().mockResolvedValue(false),
  };
}

interface Overrides {
  listings?: ListingRepository;
  businesses?: BusinessReadRepository;
  catalog?: CatalogRepository;
  branches?: BranchRepository;
}

function makeService(overrides: Overrides = {}): ListingsService {
  return new ListingsService(
    overrides.listings ?? makeListings(),
    overrides.businesses ?? makeBusinesses('owner-1'),
    overrides.catalog ?? makeCatalog(),
    overrides.branches ?? makeBranches(),
  );
}

describe('ListingsService', () => {
  describe('create — happy path', () => {
    it('persists a DRAFT listing with the server-computed finalPrice', async () => {
      const listings = makeListings();
      const service = makeService({ listings });

      const result = await service.create(owner, BUSINESS_ID, createInput());

      expect(listings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: BUSINESS_ID,
          status: ListingStatus.DRAFT,
          branchIds: [],
          discount: expect.objectContaining({
            type: DiscountType.PERCENT,
            value: 20,
            finalPrice: 44_000,
          }),
          redemption: expect.objectContaining({ usedCount: 0 }),
        }),
      );
      expect(result.status).toBe(ListingStatus.DRAFT);
    });

    it('persists the whole aggregate — owned branches, option groups and valid attributes', async () => {
      const listings = makeListings();
      const service = makeService({
        listings,
        branches: makeBranches(['br-1']),
        catalog: makeCatalog(undefined, [spec({ key: 'portionGrams' })]),
      });

      await service.create(
        owner,
        BUSINESS_ID,
        createInput({
          branchIds: ['br-1'],
          attributes: { portionGrams: '550' },
          optionGroups: [
            {
              name: 'Hajm',
              selectionType: SelectionType.SINGLE,
              isRequired: false,
              minSelect: null,
              maxSelect: null,
              sortOrder: null,
              options: [
                { name: 'S', priceDelta: 0, isAvailable: true, sortOrder: null },
                { name: 'L', priceDelta: 12_000, isAvailable: true, sortOrder: null },
              ],
            },
          ],
        }),
      );

      expect(listings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          branchIds: ['br-1'],
          attributes: { portionGrams: '550' },
          optionGroups: [
            expect.objectContaining({
              name: 'Hajm',
              sortOrder: 0,
              options: [
                expect.objectContaining({ name: 'S', sortOrder: 0 }),
                expect.objectContaining({ name: 'L', priceDelta: 12_000, sortOrder: 1 }),
              ],
            }),
          ],
        }),
      );
    });
  });

  describe('create — ownership', () => {
    it('throws 404 BUSINESS_NOT_FOUND when the business does not exist', async () => {
      const listings = makeListings();
      const service = makeService({ listings, businesses: makeBusinesses(null) });

      await expect(service.create(owner, 'missing', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_FOUND,
        status: 404,
      });
      expect(listings.create).not.toHaveBeenCalled();
    });

    it('throws 403 FORBIDDEN for another owner’s business', async () => {
      const listings = makeListings();
      const service = makeService({ listings, businesses: makeBusinesses('someone-else') });

      await expect(service.create(owner, BUSINESS_ID, createInput())).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(listings.create).not.toHaveBeenCalled();
    });
  });

  describe('create — category', () => {
    it('throws 422 CATEGORY_NOT_IN_CATALOG when the category is not in the business type', async () => {
      const service = makeService({ catalog: makeCatalog([category('PIZZA')]) });

      await expect(
        service.create(owner, BUSINESS_ID, createInput({ categoryKey: 'SUSHI' })),
      ).rejects.toMatchObject({ code: ERROR_CODE.CATEGORY_NOT_IN_CATALOG, status: 422 });
    });

    it('requires customCategoryName when categoryKey is OTHER', async () => {
      const service = makeService();

      await expect(
        service.create(
          owner,
          BUSINESS_ID,
          createInput({ categoryKey: 'OTHER', customCategoryName: null }),
        ),
      ).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
        fields: { customCategoryName: expect.any(String) },
      });
    });
  });

  describe('create — pricing', () => {
    it('throws 422 DISCOUNT_TOO_HIGH when PERCENT value exceeds 90', async () => {
      const service = makeService();
      const input = createInput({
        discount: {
          type: DiscountType.PERCENT,
          value: 95,
          conditions: null,
          appliesToOptions: false,
        },
      });

      await expect(service.create(owner, BUSINESS_ID, input)).rejects.toMatchObject({
        code: ERROR_CODE.DISCOUNT_TOO_HIGH,
        status: 422,
      });
    });

    it('throws 422 FINAL_PRICE_INVALID when finalPrice is not below originalPrice', async () => {
      const service = makeService();
      const input = createInput({
        discount: {
          type: DiscountType.SPECIAL_PRICE,
          value: 60_000,
          conditions: null,
          appliesToOptions: false,
        },
      });

      await expect(service.create(owner, BUSINESS_ID, input)).rejects.toMatchObject({
        code: ERROR_CODE.FINAL_PRICE_INVALID,
        status: 422,
      });
    });

    it('allows FREE_ITEM even though finalPrice equals originalPrice', async () => {
      const listings = makeListings();
      const service = makeService({ listings });
      const input = createInput({
        discount: {
          type: DiscountType.FREE_ITEM,
          value: 0,
          conditions: '1+1',
          appliesToOptions: false,
        },
      });

      await service.create(owner, BUSINESS_ID, input);

      expect(listings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: expect.objectContaining({ type: DiscountType.FREE_ITEM, finalPrice: 55_000 }),
        }),
      );
    });
  });

  describe('create — regular listing normalisation (§5)', () => {
    it('sets finalPrice = originalPrice, normalises the discount and skips the pricing gates', async () => {
      const listings = makeListings();
      const service = makeService({ listings });
      const input = createInput({
        attributes: { _regular: '1' },
        // Would be DISCOUNT_TOO_HIGH for a non-regular listing — must be skipped and normalised.
        discount: {
          type: DiscountType.PERCENT,
          value: 95,
          conditions: 'x',
          appliesToOptions: true,
        },
      });

      await service.create(owner, BUSINESS_ID, input);

      expect(listings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: {
            type: DiscountType.PERCENT,
            value: 0,
            finalPrice: 55_000,
            conditions: null,
            appliesToOptions: false,
          },
        }),
      );
    });
  });

  describe('create — attributes (§6)', () => {
    it('rejects an unknown attribute key', async () => {
      const service = makeService({ catalog: makeCatalog(undefined, []) });

      await expect(
        service.create(owner, BUSINESS_ID, createInput({ attributes: { foo: 'bar' } })),
      ).rejects.toMatchObject({ code: ERROR_CODE.ATTRIBUTES_SCHEMA_MISMATCH, status: 422 });
    });

    it('rejects a missing required attribute', async () => {
      const service = makeService({
        catalog: makeCatalog(undefined, [spec({ key: 'portionGrams', required: true })]),
      });

      await expect(
        service.create(owner, BUSINESS_ID, createInput({ attributes: null })),
      ).rejects.toMatchObject({ code: ERROR_CODE.ATTRIBUTES_SCHEMA_MISMATCH, status: 422 });
    });

    it('rejects a value that does not match its kind', async () => {
      const service = makeService({
        catalog: makeCatalog(undefined, [
          spec({ key: 'portionGrams', kind: AttributeFieldType.NUMBER }),
        ]),
      });

      await expect(
        service.create(owner, BUSINESS_ID, createInput({ attributes: { portionGrams: 'abc' } })),
      ).rejects.toMatchObject({ code: ERROR_CODE.ATTRIBUTES_SCHEMA_MISMATCH, status: 422 });
    });
  });

  describe('create — redemption (§7)', () => {
    it('requires promoCode for the PROMO_CODE method', async () => {
      const service = makeService();
      const input = createInput({
        redemption: {
          method: RedemptionMethod.PROMO_CODE,
          promoCode: null,
          url: null,
          perUserLimit: null,
          perUserPeriod: null,
          totalLimit: null,
        },
      });

      await expect(service.create(owner, BUSINESS_ID, input)).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
        fields: { promoCode: expect.any(String) },
      });
    });
  });

  describe('create — option groups (§8)', () => {
    it('rejects a group with more than 30 options', async () => {
      const service = makeService();
      const options = Array.from({ length: 31 }, (_, index) => ({
        name: `opt-${index}`,
        priceDelta: 0,
        isAvailable: true,
        sortOrder: null,
      }));
      const input = createInput({
        optionGroups: [
          {
            name: 'Hajm',
            selectionType: SelectionType.SINGLE,
            isRequired: false,
            minSelect: null,
            maxSelect: null,
            sortOrder: null,
            options,
          },
        ],
      });

      await expect(service.create(owner, BUSINESS_ID, input)).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
      });
    });
  });

  describe('create — branchIds (§9)', () => {
    it('rejects a branch that does not belong to the business', async () => {
      const service = makeService({ branches: makeBranches(['br-1']) });

      await expect(
        service.create(owner, BUSINESS_ID, createInput({ branchIds: ['br-unknown'] })),
      ).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
        fields: { branchIds: expect.any(String) },
      });
    });
  });
});
