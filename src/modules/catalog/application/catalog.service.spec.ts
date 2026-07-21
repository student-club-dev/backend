import { AppException } from '../../../common/exceptions/app.exception';
import { CatalogRepository } from '../domain/catalog.repository';
import { BusinessType } from '../domain/entities/business-type.entity';
import { Category } from '../domain/entities/category.entity';
import { Gender } from '../domain/enums/gender.enum';
import { PriceUnit } from '../domain/enums/price-unit.enum';
import { CatalogService } from './catalog.service';

function businessType(type: string, genders: Gender[]): BusinessType {
  return {
    type,
    nameUz: type,
    nameRu: null,
    iconUrl: null,
    emoji: null,
    accentColor: null,
    defaultPriceUnit: PriceUnit.PER_ITEM,
    priceUnits: [PriceUnit.PER_ITEM],
    availableForGenders: genders,
  };
}

function category(key: string, gender: Gender | null): Category {
  return {
    key,
    businessType: 'CLOTHING',
    nameUz: key,
    nameRu: null,
    iconUrl: null,
    sortOrder: 0,
    requiresCustomName: false,
    fields: [],
    gender,
  };
}

const ALL_TYPES: BusinessType[] = [
  businessType('GAME_CLUB', [Gender.MALE, Gender.FEMALE]),
  businessType('CLOTHING', [Gender.MALE, Gender.FEMALE]),
  businessType('CAFE_RESTAURANT', [Gender.MALE, Gender.FEMALE]),
  businessType('EDUCATION_CENTER', [Gender.MALE, Gender.FEMALE]),
  businessType('ENTERTAINMENT', [Gender.MALE, Gender.FEMALE]),
  businessType('BARBERSHOP', [Gender.MALE]),
  businessType('BEAUTY_SALON', [Gender.FEMALE]),
];

function makeRepository(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    findBusinessTypes: jest.fn().mockResolvedValue(ALL_TYPES),
    findCategoriesByType: jest.fn().mockResolvedValue([]),
    findAttributeSpecs: jest.fn().mockResolvedValue([]),
    typeExists: jest.fn().mockResolvedValue(true),
    createType: jest.fn(),
    updateType: jest.fn(),
    deleteType: jest.fn(),
    countBusinessesOfType: jest.fn().mockResolvedValue(0),
    countCategoriesOfType: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('CatalogService', () => {
  describe('getBusinessTypes', () => {
    it('returns all 7 types when no gender is given', async () => {
      const service = new CatalogService(makeRepository());
      expect(await service.getBusinessTypes(null)).toHaveLength(7);
    });

    it('excludes BEAUTY_SALON for MALE (6 types)', async () => {
      const service = new CatalogService(makeRepository());
      const result = await service.getBusinessTypes(Gender.MALE);
      expect(result).toHaveLength(6);
      expect(result.map((type) => type.type)).not.toContain('BEAUTY_SALON');
    });

    it('excludes BARBERSHOP for FEMALE (6 types)', async () => {
      const service = new CatalogService(makeRepository());
      const result = await service.getBusinessTypes(Gender.FEMALE);
      expect(result).toHaveLength(6);
      expect(result.map((type) => type.type)).not.toContain('BARBERSHOP');
    });
  });

  describe('getCategories', () => {
    it('throws a 404 AppException when the business type does not exist', async () => {
      const repository = makeRepository({
        findCategoriesByType: jest.fn().mockResolvedValue(null),
      });
      const service = new CatalogService(repository);
      await expect(service.getCategories('NOPE', null)).rejects.toBeInstanceOf(AppException);
    });

    it('returns only base categories when no gender is given', async () => {
      const repository = makeRepository({
        findCategoriesByType: jest
          .fn()
          .mockResolvedValue([
            category('ALL', null),
            category('MEN_SHIRTS', Gender.MALE),
            category('WOMEN_DRESS', Gender.FEMALE),
          ]),
      });
      const service = new CatalogService(repository);
      const result = await service.getCategories('CLOTHING', null);
      expect(result.map((item) => item.key)).toEqual(['ALL']);
    });

    it('adds the matching per-gender categories when a gender is given', async () => {
      const repository = makeRepository({
        findCategoriesByType: jest
          .fn()
          .mockResolvedValue([
            category('ALL', null),
            category('MEN_SHIRTS', Gender.MALE),
            category('WOMEN_DRESS', Gender.FEMALE),
          ]),
      });
      const service = new CatalogService(repository);
      const result = await service.getCategories('CLOTHING', Gender.MALE);
      expect(result.map((item) => item.key)).toEqual(['ALL', 'MEN_SHIRTS']);
    });
  });
});
