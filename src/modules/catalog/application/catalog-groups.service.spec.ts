import { CatalogRepository } from '../domain/catalog.repository';
import { BusinessType } from '../domain/entities/business-type.entity';
import { CatalogGroup } from '../domain/entities/catalog-group.entity';
import { Gender } from '../domain/enums/gender.enum';
import { PriceUnit } from '../domain/enums/price-unit.enum';
import { CatalogGroupsService } from './catalog-groups.service';

function group(key: string, sortOrder: number, typeKeys: string[]): CatalogGroup {
  return {
    key,
    nameUz: key,
    nameRu: null,
    emoji: null,
    icon: null,
    accentColor: null,
    sortOrder,
    typeKeys,
  };
}

function businessType(type: string, groupKey: string, genders: Gender[]): BusinessType {
  return {
    type,
    groupKey,
    nameUz: type,
    nameRu: null,
    iconUrl: null,
    emoji: null,
    accentColor: null,
    defaultPriceUnit: PriceUnit.PER_ITEM,
    priceUnits: [PriceUnit.PER_ITEM],
    availableForGenders: genders,
    allCategoryLabel: null,
    optionGroupHint: null,
  };
}

const GROUPS: CatalogGroup[] = [
  group('FOOD', 1, ['NATIONAL_FOOD', 'FAST_FOOD']),
  group('BEAUTY', 6, ['BARBERSHOP', 'BEAUTY_SALON']),
];

const BEAUTY_TYPES: BusinessType[] = [
  businessType('BARBERSHOP', 'BEAUTY', [Gender.MALE]),
  businessType('BEAUTY_SALON', 'BEAUTY', [Gender.FEMALE]),
];

function makeRepository(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    findBusinessTypes: jest.fn().mockResolvedValue([]),
    findCategoriesByType: jest.fn().mockResolvedValue([]),
    findAttributeSpecs: jest.fn().mockResolvedValue([]),
    typeExists: jest.fn().mockResolvedValue(true),
    createType: jest.fn(),
    updateType: jest.fn(),
    deleteType: jest.fn(),
    countBusinessesOfType: jest.fn().mockResolvedValue(0),
    countCategoriesOfType: jest.fn().mockResolvedValue(0),
    findGroups: jest.fn().mockResolvedValue(GROUPS),
    findBusinessTypesByGroups: jest.fn().mockResolvedValue(BEAUTY_TYPES),
    groupExists: jest.fn().mockResolvedValue(true),
    countVisibleListingsByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    countCategoriesByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    ...overrides,
  };
}

describe('CatalogGroupsService', () => {
  describe('getGroups', () => {
    it('sums the per-type counts into each group and keeps empty groups', async () => {
      const repository = makeRepository({
        countVisibleListingsByType: jest.fn().mockResolvedValue(
          new Map([
            ['NATIONAL_FOOD', 12],
            ['FAST_FOOD', 5],
          ]),
        ),
      });
      const service = new CatalogGroupsService(repository);

      const groups = await service.getGroups(null);

      expect(groups).toHaveLength(2);
      expect(groups[0]).toMatchObject({ key: 'FOOD', typesCount: 2, listingsCount: 17 });
      // Empty groups still come back — the client dims them instead of hiding them.
      expect(groups[1]).toMatchObject({ key: 'BEAUTY', typesCount: 2, listingsCount: 0 });
    });

    it('passes the geo scope through to the count query', async () => {
      const countVisibleListingsByType = jest.fn().mockResolvedValue(new Map<string, number>());
      const service = new CatalogGroupsService(makeRepository({ countVisibleListingsByType }));

      await service.getGroups({ lat: 41.31, lng: 69.27, radiusMeters: 5000 });

      expect(countVisibleListingsByType).toHaveBeenCalledWith({
        lat: 41.31,
        lng: 69.27,
        radiusMeters: 5000,
      });
    });
  });

  describe('getTypes', () => {
    it('filters the type list by gender but never the counts (D16)', async () => {
      const repository = makeRepository({
        countVisibleListingsByType: jest.fn().mockResolvedValue(
          new Map([
            ['BARBERSHOP', 7],
            ['BEAUTY_SALON', 9],
          ]),
        ),
        countCategoriesByType: jest.fn().mockResolvedValue(new Map([['BARBERSHOP', 8]])),
      });
      const service = new CatalogGroupsService(repository);

      const types = await service.getTypes(['BEAUTY'], Gender.MALE, null);

      expect(types).toHaveLength(1);
      expect(types[0]).toMatchObject({
        type: 'BARBERSHOP',
        categoriesCount: 8,
        listingsCount: 7,
      });
    });

    it('returns every type when no gender is given', async () => {
      const service = new CatalogGroupsService(makeRepository());

      const types = await service.getTypes(['BEAUTY'], null, null);

      expect(types.map((type) => type.type)).toEqual(['BARBERSHOP', 'BEAUTY_SALON']);
    });

    it('defaults missing counts to zero', async () => {
      const service = new CatalogGroupsService(makeRepository());

      const types = await service.getTypes(['BEAUTY'], null, null);

      expect(types[0]).toMatchObject({ categoriesCount: 0, listingsCount: 0 });
    });

    it('keeps a group total equal to the sum of its types (§12.19)', async () => {
      const counts = new Map([
        ['BARBERSHOP', 7],
        ['BEAUTY_SALON', 9],
      ]);
      const service = new CatalogGroupsService(
        makeRepository({ countVisibleListingsByType: jest.fn().mockResolvedValue(counts) }),
      );

      const beauty = (await service.getGroups(null)).find((g) => g.key === 'BEAUTY');
      const types = await service.getTypes(['BEAUTY'], null, null);

      const sum = types.reduce((total, type) => total + type.listingsCount, 0);
      expect(sum).toBe(beauty?.listingsCount);
      expect(sum).toBe(16);
    });
  });
});
