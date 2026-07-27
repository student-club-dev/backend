import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BranchRepository } from '../../branches/domain/branches.repository';
import {
  BusinessReadRepository,
  BusinessSummary,
} from '../../business/domain/business-read.repository';
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
import {
  CreateListingData,
  ListingPage,
  ListingPageQuery,
  ListingRepository,
  SubmitTransitionData,
  UpdateListingData,
} from '../domain/listing.repository';
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
    businessType: 'CAFE_RESTAURANT',
    key: 'portionGrams',
    label: 'Portion',
    kind: AttributeFieldType.NUMBER,
    required: false,
    suffix: null,
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
  return {
    create: jest.fn(async (data: CreateListingData) => listingFromData(data)),
    findById: jest.fn().mockResolvedValue(null),
    findPageByBusiness: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    submitTransition: jest.fn(),
    update: jest.fn(),
    archive: jest.fn().mockResolvedValue(undefined),
    setStatus: jest.fn(),
    duplicate: jest.fn(),
    stats: jest.fn(),
    applyStatusTransitions: jest.fn(),
  };
}

/** A stored DRAFT listing, as `findById` would return it for the submit flow. */
function draftListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'lst-1',
    businessId: BUSINESS_ID,
    branchIds: [],
    categoryKey: 'PIZZA',
    customCategoryName: null,
    title: 'Katta pizza chegirma',
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
    // Relative, not a fixed date: the common case is a listing whose window has already opened, and
    // a hard-coded date silently changes meaning as the calendar passes it.
    validFrom: new Date(Date.now() - 86_400_000),
    validTo: new Date('2030-01-01T00:00:00Z'),
    attributes: null,
    optionGroups: [],
    status: ListingStatus.DRAFT,
    rejectionReason: null,
    viewsCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Listings repo for submit: `findById` returns the given listing; `submitTransition` applies it. */
function makeSubmitListings(listing: Listing | null): ListingRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(listing),
    findPageByBusiness: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    submitTransition: jest.fn(async (_id: string, data: SubmitTransitionData) => ({
      ...(listing as Listing),
      status: data.status,
      branchIds: data.branchIds ?? (listing as Listing).branchIds,
    })),
    update: jest.fn(),
    archive: jest.fn().mockResolvedValue(undefined),
    setStatus: jest.fn(),
    duplicate: jest.fn(),
    stats: jest.fn(),
    applyStatusTransitions: jest.fn(),
  };
}

/** Listings repo for update/archive: `findById` returns the given listing; writes echo it back. */
function makeByIdListings(listing: Listing | null): ListingRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(listing),
    findPageByBusiness: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    submitTransition: jest.fn(),
    update: jest.fn(async (_id: string, data: UpdateListingData) => ({
      ...(listing as Listing),
      title: data.title,
      discount: data.discount,
    })),
    archive: jest.fn().mockResolvedValue(undefined),
    setStatus: jest.fn(async (_id: string, status: ListingStatus) => ({
      ...(listing as Listing),
      status,
    })),
    duplicate: jest.fn(async () => ({
      ...(listing as Listing),
      id: 'lst-copy',
      status: ListingStatus.DRAFT,
      viewsCount: 0,
    })),
    stats: jest.fn().mockResolvedValue({
      viewsCount: 0,
      favoritesCount: 0,
      redemptionsCount: 0,
      totalRevenue: 0,
    }),
    applyStatusTransitions: jest.fn().mockResolvedValue({ expired: 0, activated: 0, soldOut: 0 }),
  };
}

/** Business read port for submit — APPROVED and non-online by default; override per gate. */
function makeSubmitBusiness(overrides: Partial<BusinessSummary> = {}): BusinessReadRepository {
  return {
    findSummaryById: jest.fn().mockResolvedValue({
      id: BUSINESS_ID,
      ownerId: 'owner-1',
      type: 'CAFE_RESTAURANT',
      status: BusinessStatus.APPROVED,
      isOnlineOnly: false,
      ...overrides,
    }),
  };
}

/** Branch repo whose `findManyByBusiness` returns branches with an explicit `isActive` flag. */
function makeActiveBranches(branches: Array<{ id: string; isActive: boolean }>): BranchRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(null),
    findManyByBusiness: jest.fn().mockResolvedValue(branches),
    update: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    existsWithinRadius: jest.fn().mockResolvedValue(false),
  };
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
    findGroups: jest.fn().mockResolvedValue([]),
    findBusinessTypesByGroups: jest.fn().mockResolvedValue([]),
    groupExists: jest.fn().mockResolvedValue(true),
    countVisibleListingsByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    countCategoriesByType: jest.fn().mockResolvedValue(new Map<string, number>()),
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
    it('throws 422 INVALID_CATEGORY_FOR_TYPE when the category is not in the business type', async () => {
      const service = makeService({ catalog: makeCatalog([category('PIZZA')]) });

      await expect(
        service.create(owner, BUSINESS_ID, createInput({ categoryKey: 'SUSHI' })),
      ).rejects.toMatchObject({ code: ERROR_CODE.INVALID_CATEGORY_FOR_TYPE, status: 422 });
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
            isDiscount: false,
            percent: null,
          },
        }),
      );
    });
  });

  describe('create — denormalised discount flags (STUDENT_FEED.md D8)', () => {
    it('marks a discount listing and stores the normalised percent', async () => {
      const listings = makeListings();
      const service = makeService({ listings });

      await service.create(owner, BUSINESS_ID, createInput());

      expect(listings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: expect.objectContaining({ isDiscount: true, percent: 20 }),
        }),
      );
    });

    it('derives the percent from the price drop, not from the discount value', async () => {
      const listings = makeListings();
      const service = makeService({ listings });
      // 55 000 → 30 000 is a 45% drop even though `value` is the absolute amount.
      const input = createInput({
        discount: {
          type: DiscountType.FIXED_AMOUNT,
          value: 25_000,
          conditions: null,
          appliesToOptions: false,
        },
      });

      await service.create(owner, BUSINESS_ID, input);

      expect(listings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: expect.objectContaining({ isDiscount: true, percent: 45 }),
        }),
      );
    });

    it('gives FREE_ITEM a flat 50 percent — a 1+1 offer has no price drop to measure', async () => {
      const listings = makeListings();
      const service = makeService({ listings });
      const input = createInput({
        discount: {
          type: DiscountType.FREE_ITEM,
          value: 1,
          conditions: null,
          appliesToOptions: false,
        },
      });

      await service.create(owner, BUSINESS_ID, input);

      expect(listings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: expect.objectContaining({ isDiscount: true, percent: 50 }),
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

  describe('create — search haystack (STUDENT_FEED.md §7)', () => {
    /** The `searchText` the service handed to the repository on the first `create` call. */
    function searchTextOf(listings: ListingRepository): string {
      const [data] = (listings.create as jest.Mock).mock.calls[0] as [CreateListingData];
      return data.searchText;
    }

    it('collects the title, description, category label and a TEXT attribute value', async () => {
      const listings = makeListings();
      const service = makeService({
        listings,
        catalog: makeCatalog(
          [{ ...category('PIZZA'), nameUz: 'Pitsa' }],
          [spec({ key: 'brand', kind: AttributeFieldType.TEXT })],
        ),
      });

      await service.create(
        owner,
        BUSINESS_ID,
        createInput({ description: 'Yangi issiq taom', attributes: { brand: 'Bella Napoli' } }),
      );

      const searchText = searchTextOf(listings);
      expect(searchText).toContain('Katta pizza chegirma');
      expect(searchText).toContain('Yangi issiq taom');
      expect(searchText).toContain('PIZZA');
      expect(searchText).toContain('Pitsa');
      expect(searchText).toContain('Bella Napoli');
    });

    it('excludes the reserved keys — `_phone` is contact data and `_regular` a flag', async () => {
      const listings = makeListings();
      const service = makeService({
        listings,
        catalog: makeCatalog(
          [{ ...category('PIZZA'), nameUz: 'Pitsa' }],
          [spec({ key: 'brand', kind: AttributeFieldType.TEXT })],
        ),
      });

      await service.create(
        owner,
        BUSINESS_ID,
        createInput({
          attributes: { _phone: '+998901234567', _regular: '1', brand: 'Bella' },
        }),
      );

      const searchText = searchTextOf(listings);
      expect(searchText).not.toContain('998901234567');
      expect(searchText.split(' ')).not.toContain('1');
      expect(searchText).toContain('Bella');
    });

    it('collects the option group names and every option name', async () => {
      const listings = makeListings();
      const service = makeService({ listings });

      await service.create(
        owner,
        BUSINESS_ID,
        createInput({
          optionGroups: [
            {
              name: 'Hajmi',
              selectionType: SelectionType.SINGLE,
              isRequired: false,
              minSelect: null,
              maxSelect: null,
              sortOrder: null,
              options: [
                { name: 'Yarim porsiya', priceDelta: 0, isAvailable: true, sortOrder: null },
                { name: 'To‘liq porsiya', priceDelta: 12_000, isAvailable: true, sortOrder: null },
              ],
            },
          ],
        }),
      );

      const searchText = searchTextOf(listings);
      expect(searchText).toContain('Hajmi');
      expect(searchText).toContain('Yarim porsiya');
      expect(searchText).toContain('To‘liq porsiya');
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

  describe('submit — happy path', () => {
    it('publishes an approved business’s valid DRAFT straight to ACTIVE (MVP auto-approve)', async () => {
      const listings = makeSubmitListings(draftListing({ branchIds: ['br-1'] }));
      const service = makeService({
        listings,
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      const result = await service.submit(owner, 'lst-1');

      expect(listings.submitTransition).toHaveBeenCalledWith('lst-1', {
        branchIds: undefined,
        status: ListingStatus.ACTIVE,
      });
      expect(result.status).toBe(ListingStatus.ACTIVE);
    });

    it('holds a DRAFT whose validFrom has not arrived at SCHEDULED', async () => {
      const listings = makeSubmitListings(
        draftListing({
          branchIds: ['br-1'],
          validFrom: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }),
      );
      const service = makeService({
        listings,
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      const result = await service.submit(owner, 'lst-1');

      // Publishing must not make a listing live before the owner said it should start.
      expect(result.status).toBe(ListingStatus.SCHEDULED);
    });

    it('publishes when validFrom is exactly now — the window is inclusive', async () => {
      const listings = makeSubmitListings(
        draftListing({ branchIds: ['br-1'], validFrom: new Date(Date.now() - 1000) }),
      );
      const service = makeService({
        listings,
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      expect((await service.submit(owner, 'lst-1')).status).toBe(ListingStatus.ACTIVE);
    });
  });

  describe('submit — ownership & status', () => {
    it('throws 404 LISTING_NOT_FOUND when the listing does not exist', async () => {
      const listings = makeSubmitListings(null);
      const service = makeService({ listings, businesses: makeSubmitBusiness() });

      await expect(service.submit(owner, 'missing')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
      });
      expect(listings.submitTransition).not.toHaveBeenCalled();
    });

    it('throws 403 FORBIDDEN for another owner’s listing', async () => {
      const listings = makeSubmitListings(draftListing());
      const service = makeService({
        listings,
        businesses: makeSubmitBusiness({ ownerId: 'someone-else' }),
      });

      await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(listings.submitTransition).not.toHaveBeenCalled();
    });

    it('throws 409 INVALID_STATUS_TRANSITION when the listing is not a DRAFT', async () => {
      const listings = makeSubmitListings(draftListing({ status: ListingStatus.PENDING_REVIEW }));
      const service = makeService({ listings, businesses: makeSubmitBusiness() });

      await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
        status: 409,
      });
      expect(listings.submitTransition).not.toHaveBeenCalled();
    });
  });

  describe('submit — publish gates (§10)', () => {
    it('throws 403 BUSINESS_NOT_APPROVED when the business is not APPROVED', async () => {
      const service = makeService({
        listings: makeSubmitListings(draftListing({ branchIds: ['br-1'] })),
        businesses: makeSubmitBusiness({ status: BusinessStatus.DRAFT }),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_APPROVED,
        status: 403,
      });
    });

    it('throws 422 NO_ACTIVE_BRANCH when an explicit branch is no longer active', async () => {
      const service = makeService({
        listings: makeSubmitListings(draftListing({ branchIds: ['br-1'] })),
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([{ id: 'br-1', isActive: false }]),
      });

      await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.NO_ACTIVE_BRANCH,
        status: 422,
      });
    });

    it('throws 422 NO_ACTIVE_BRANCH when branchIds are empty and no branch is active', async () => {
      const service = makeService({
        listings: makeSubmitListings(draftListing({ branchIds: [] })),
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([{ id: 'br-1', isActive: false }]),
      });

      await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.NO_ACTIVE_BRANCH,
        status: 422,
      });
    });

    it('snapshots the business’s active branches when branchIds are empty', async () => {
      const listings = makeSubmitListings(draftListing({ branchIds: [] }));
      const service = makeService({
        listings,
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([
          { id: 'br-1', isActive: true },
          { id: 'br-2', isActive: false },
          { id: 'br-3', isActive: true },
        ]),
      });

      const result = await service.submit(owner, 'lst-1');

      expect(listings.submitTransition).toHaveBeenCalledWith('lst-1', {
        branchIds: ['br-1', 'br-3'],
        status: ListingStatus.ACTIVE,
      });
      expect(result.status).toBe(ListingStatus.ACTIVE);
      expect(result.branchIds).toEqual(['br-1', 'br-3']);
    });

    it('passes an online-only business with no branches (no branch required)', async () => {
      const listings = makeSubmitListings(draftListing({ branchIds: [] }));
      const branches = makeActiveBranches([]);
      const service = makeService({
        listings,
        businesses: makeSubmitBusiness({ isOnlineOnly: true }),
        branches,
      });

      const result = await service.submit(owner, 'lst-1');

      expect(result.status).toBe(ListingStatus.ACTIVE);
      expect(listings.submitTransition).toHaveBeenCalledWith('lst-1', {
        branchIds: undefined,
        status: ListingStatus.ACTIVE,
      });
      expect(branches.findManyByBusiness).not.toHaveBeenCalled();
    });

    it('throws 422 VALIDATION_ERROR when there are no images', async () => {
      const service = makeService({
        listings: makeSubmitListings(draftListing({ branchIds: ['br-1'], images: [] })),
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
        fields: { images: expect.any(String) },
      });
    });

    it('throws 422 FINAL_PRICE_INVALID from the recomputed price, ignoring the stored finalPrice', async () => {
      const service = makeService({
        listings: makeSubmitListings(
          draftListing({
            branchIds: ['br-1'],
            // Stored finalPrice is stale/low; recompute yields 60_000 >= 55_000 → invalid.
            discount: {
              type: DiscountType.SPECIAL_PRICE,
              value: 60_000,
              finalPrice: 1,
              conditions: null,
              appliesToOptions: false,
              isDiscount: true,
              percent: 20,
            },
          }),
        ),
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.FINAL_PRICE_INVALID,
        status: 422,
      });
    });

    it('skips the price gate for a regular listing (_regular = "1")', async () => {
      const service = makeService({
        listings: makeSubmitListings(
          draftListing({
            branchIds: ['br-1'],
            attributes: { _regular: '1' },
            // Would be FINAL_PRICE_INVALID for a non-regular listing — must be skipped.
            discount: {
              type: DiscountType.SPECIAL_PRICE,
              value: 60_000,
              finalPrice: 55_000,
              conditions: null,
              appliesToOptions: false,
              isDiscount: true,
              percent: 20,
            },
          }),
        ),
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      const result = await service.submit(owner, 'lst-1');

      expect(result.status).toBe(ListingStatus.ACTIVE);
    });

    it('skips the price gate for a FREE_ITEM listing (1+1, finalPrice == originalPrice)', async () => {
      const service = makeService({
        listings: makeSubmitListings(
          draftListing({
            branchIds: ['br-1'],
            // FREE_ITEM legitimately has finalPrice == originalPrice — must be publishable (mirrors CREATE).
            discount: {
              type: DiscountType.FREE_ITEM,
              value: 0,
              finalPrice: 55_000,
              conditions: null,
              appliesToOptions: false,
              isDiscount: true,
              percent: 20,
            },
          }),
        ),
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      const result = await service.submit(owner, 'lst-1');

      expect(result.status).toBe(ListingStatus.ACTIVE);
    });

    it('throws 422 VALIDATION_ERROR when validTo is in the past', async () => {
      const service = makeService({
        listings: makeSubmitListings(
          draftListing({ branchIds: ['br-1'], validTo: new Date('2020-01-01T00:00:00Z') }),
        ),
        businesses: makeSubmitBusiness(),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
        fields: { validTo: expect.any(String) },
      });
    });

    it('throws 422 INVALID_CATEGORY_FOR_TYPE when the category was removed from the catalog', async () => {
      const service = makeService({
        listings: makeSubmitListings(draftListing({ branchIds: ['br-1'], categoryKey: 'PIZZA' })),
        businesses: makeSubmitBusiness(),
        catalog: makeCatalog([category('SUSHI')]),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_CATEGORY_FOR_TYPE,
        status: 422,
      });
    });

    it('throws 422 ATTRIBUTES_SCHEMA_MISMATCH when attributes drift from the schema', async () => {
      const service = makeService({
        listings: makeSubmitListings(draftListing({ branchIds: ['br-1'], attributes: null })),
        businesses: makeSubmitBusiness(),
        catalog: makeCatalog(undefined, [spec({ key: 'portionGrams', required: true })]),
        branches: makeActiveBranches([{ id: 'br-1', isActive: true }]),
      });

      await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.ATTRIBUTES_SCHEMA_MISMATCH,
        status: 422,
      });
    });
  });

  describe('listByBusiness', () => {
    const query: ListingPageQuery = { status: null, categoryKey: null, page: 1, size: 20 };

    it('returns the repository page and forwards the query for a business the caller owns', async () => {
      const page: ListingPage = { items: [draftListing()], total: 1 };
      const listings = makeListings();
      (listings.findPageByBusiness as jest.Mock).mockResolvedValue(page);
      const service = makeService({ listings });

      const result = await service.listByBusiness(owner, BUSINESS_ID, query);

      expect(result).toBe(page);
      expect(listings.findPageByBusiness).toHaveBeenCalledWith(BUSINESS_ID, query);
    });

    it('throws 404 BUSINESS_NOT_FOUND when the business does not exist', async () => {
      const service = makeService({ businesses: makeBusinesses(null) });

      await expect(service.listByBusiness(owner, BUSINESS_ID, query)).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_FOUND,
        status: 404,
      });
    });

    it('throws 403 FORBIDDEN when the business belongs to another owner', async () => {
      const listings = makeListings();
      const service = makeService({ listings, businesses: makeBusinesses('other-owner') });

      await expect(service.listByBusiness(owner, BUSINESS_ID, query)).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(listings.findPageByBusiness).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('re-validates and persists the edit for a listing the caller owns, recomputing finalPrice', async () => {
      const listings = makeByIdListings(draftListing());
      const service = makeService({ listings });

      const result = await service.update(owner, 'lst-1', createInput({ title: 'Yangi sarlavha' }));

      expect(listings.update).toHaveBeenCalledWith(
        'lst-1',
        expect.objectContaining({
          title: 'Yangi sarlavha',
          discount: expect.objectContaining({ finalPrice: 44_000 }),
        }),
      );
      expect(result.id).toBe('lst-1');
    });

    it('never writes status, currency or usedCount (the owner edits content, not lifecycle)', async () => {
      const listings = makeByIdListings(draftListing());
      const service = makeService({ listings });

      await service.update(owner, 'lst-1', createInput());

      const [, data] = (listings.update as jest.Mock).mock.calls[0];
      expect(data).not.toHaveProperty('status');
      expect(data).not.toHaveProperty('currency');
      expect(data.redemption).not.toHaveProperty('usedCount');
    });

    it('throws 404 LISTING_NOT_FOUND when the listing does not exist', async () => {
      const service = makeService({ listings: makeByIdListings(null) });

      await expect(service.update(owner, 'lst-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
      });
    });

    it('throws 404 LISTING_NOT_FOUND when the listing is ARCHIVED (treated as deleted)', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.ARCHIVED }));
      const service = makeService({ listings });

      await expect(service.update(owner, 'lst-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
      });
      expect(listings.update).not.toHaveBeenCalled();
    });

    it('throws 403 FORBIDDEN when the listing belongs to another owner', async () => {
      const listings = makeByIdListings(draftListing());
      const service = makeService({ listings, businesses: makeBusinesses('other-owner') });

      await expect(service.update(owner, 'lst-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(listings.update).not.toHaveBeenCalled();
    });

    it('throws 422 DISCOUNT_TOO_HIGH when the edited discount exceeds 90%', async () => {
      const listings = makeByIdListings(draftListing());
      const service = makeService({ listings });

      await expect(
        service.update(
          owner,
          'lst-1',
          createInput({
            discount: {
              type: DiscountType.PERCENT,
              value: 95,
              conditions: null,
              appliesToOptions: false,
            },
          }),
        ),
      ).rejects.toMatchObject({ code: ERROR_CODE.DISCOUNT_TOO_HIGH, status: 422 });
      expect(listings.update).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('archives a listing the caller owns', async () => {
      const listings = makeByIdListings(draftListing());
      const service = makeService({ listings });

      await service.archive(owner, 'lst-1');

      expect(listings.archive).toHaveBeenCalledWith('lst-1');
    });

    it('throws 404 LISTING_NOT_FOUND when the listing is already ARCHIVED', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.ARCHIVED }));
      const service = makeService({ listings });

      await expect(service.archive(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
      });
      expect(listings.archive).not.toHaveBeenCalled();
    });

    it('throws 403 FORBIDDEN when the listing belongs to another owner', async () => {
      const listings = makeByIdListings(draftListing());
      const service = makeService({ listings, businesses: makeBusinesses('other-owner') });

      await expect(service.archive(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(listings.archive).not.toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('pauses an ACTIVE listing (ACTIVE → PAUSED)', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.ACTIVE }));
      const service = makeService({ listings });

      const result = await service.pause(owner, 'lst-1');

      expect(listings.setStatus).toHaveBeenCalledWith('lst-1', ListingStatus.PAUSED);
      expect(result.status).toBe(ListingStatus.PAUSED);
    });

    it('throws 409 INVALID_STATUS_TRANSITION when the listing is not ACTIVE', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.DRAFT }));
      const service = makeService({ listings });

      await expect(service.pause(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
        status: 409,
      });
      expect(listings.setStatus).not.toHaveBeenCalled();
    });

    it('throws 403 FORBIDDEN for another owner’s listing', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.ACTIVE }));
      const service = makeService({ listings, businesses: makeBusinesses('other-owner') });

      await expect(service.pause(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(listings.setStatus).not.toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    it('resumes a PAUSED listing whose validFrom has passed → ACTIVE', async () => {
      const listings = makeByIdListings(
        draftListing({
          status: ListingStatus.PAUSED,
          validFrom: new Date(Date.now() - 86_400_000),
        }),
      );
      const service = makeService({ listings });

      const result = await service.activate(owner, 'lst-1');

      expect(listings.setStatus).toHaveBeenCalledWith('lst-1', ListingStatus.ACTIVE);
      expect(result.status).toBe(ListingStatus.ACTIVE);
    });

    it('resumes a PAUSED listing whose validFrom is in the future → SCHEDULED', async () => {
      const listings = makeByIdListings(
        draftListing({
          status: ListingStatus.PAUSED,
          validFrom: new Date(Date.now() + 7 * 86_400_000),
        }),
      );
      const service = makeService({ listings });

      const result = await service.activate(owner, 'lst-1');

      expect(listings.setStatus).toHaveBeenCalledWith('lst-1', ListingStatus.SCHEDULED);
      expect(result.status).toBe(ListingStatus.SCHEDULED);
    });

    it('throws 409 INVALID_STATUS_TRANSITION when the listing is not PAUSED', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.ACTIVE }));
      const service = makeService({ listings });

      await expect(service.activate(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
        status: 409,
      });
      expect(listings.setStatus).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('withdraws a PENDING_REVIEW listing → DRAFT', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.PENDING_REVIEW }));
      const service = makeService({ listings });

      const result = await service.withdraw(owner, 'lst-1');

      expect(listings.setStatus).toHaveBeenCalledWith('lst-1', ListingStatus.DRAFT);
      expect(result.status).toBe(ListingStatus.DRAFT);
    });

    it('throws 409 INVALID_STATUS_TRANSITION when the listing is not PENDING_REVIEW', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.ACTIVE }));
      const service = makeService({ listings });

      await expect(service.withdraw(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
        status: 409,
      });
      expect(listings.setStatus).not.toHaveBeenCalled();
    });
  });

  describe('duplicate', () => {
    it('clones a listing the caller owns into a DRAFT copy', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.EXPIRED }));
      const service = makeService({ listings });

      const result = await service.duplicate(owner, 'lst-1');

      expect(listings.duplicate).toHaveBeenCalledWith('lst-1');
      expect(result.id).toBe('lst-copy');
      expect(result.status).toBe(ListingStatus.DRAFT);
    });

    it('throws 404 LISTING_NOT_FOUND when the listing is ARCHIVED', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.ARCHIVED }));
      const service = makeService({ listings });

      await expect(service.duplicate(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
      });
      expect(listings.duplicate).not.toHaveBeenCalled();
    });
  });

  describe('stats', () => {
    it('returns the aggregates with the derived conversionRate', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.ACTIVE }));
      (listings.stats as jest.Mock).mockResolvedValue({
        viewsCount: 200,
        favoritesCount: 15,
        redemptionsCount: 40,
        totalRevenue: 1_760_000,
      });
      const service = makeService({ listings });

      const result = await service.stats(owner, 'lst-1');

      expect(listings.stats).toHaveBeenCalledWith('lst-1');
      expect(result).toEqual({
        listingId: 'lst-1',
        viewsCount: 200,
        favoritesCount: 15,
        redemptionsCount: 40,
        conversionRate: 0.2,
        totalRevenue: 1_760_000,
      });
    });

    it('reports a 0 conversionRate when there are no views (no divide-by-zero)', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.ACTIVE }));
      (listings.stats as jest.Mock).mockResolvedValue({
        viewsCount: 0,
        favoritesCount: 0,
        redemptionsCount: 0,
        totalRevenue: 0,
      });
      const service = makeService({ listings });

      const result = await service.stats(owner, 'lst-1');

      expect(result.conversionRate).toBe(0);
    });

    it('throws 403 FORBIDDEN for another owner’s listing', async () => {
      const listings = makeByIdListings(draftListing({ status: ListingStatus.ACTIVE }));
      const service = makeService({ listings, businesses: makeBusinesses('other-owner') });

      await expect(service.stats(owner, 'lst-1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(listings.stats).not.toHaveBeenCalled();
    });
  });

  describe('runStatusTransitions', () => {
    it('delegates the sweep to the repository (as of now) and returns the counts', async () => {
      const listings = makeListings();
      (listings.applyStatusTransitions as jest.Mock).mockResolvedValue({
        expired: 3,
        activated: 2,
        soldOut: 1,
      });
      const service = makeService({ listings });

      const result = await service.runStatusTransitions();

      expect(listings.applyStatusTransitions).toHaveBeenCalledWith(expect.any(Date));
      expect(result).toEqual({ expired: 3, activated: 2, soldOut: 1 });
    });
  });
});
