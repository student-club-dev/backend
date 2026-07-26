import { ERROR_CODE } from '../../../common/errors/error-code';
import { BusinessTypeWrite, CatalogRepository } from '../domain/catalog.repository';
import { BusinessType } from '../domain/entities/business-type.entity';
import { PriceUnit } from '../domain/enums/price-unit.enum';
import { BusinessTypeAdminService } from './business-type-admin.service';

function write(overrides: Partial<BusinessTypeWrite> = {}): BusinessTypeWrite {
  return {
    groupKey: 'SHOPPING',
    nameUz: 'Kafe',
    nameRu: null,
    emoji: null,
    accentColor: null,
    iconUrl: null,
    defaultPriceUnit: PriceUnit.PER_ITEM,
    priceUnits: [PriceUnit.PER_ITEM],
    availableForGenders: [],
    ...overrides,
  };
}

function businessType(type: string): BusinessType {
  return {
    type,
    groupKey: 'SHOPPING',
    nameUz: 'Kafe',
    nameRu: null,
    iconUrl: null,
    emoji: null,
    accentColor: null,
    defaultPriceUnit: PriceUnit.PER_ITEM,
    priceUnits: [PriceUnit.PER_ITEM],
    availableForGenders: [],
    allCategoryLabel: null,
    optionGroupHint: null,
  };
}

function makeCatalog(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    findBusinessTypes: jest.fn(),
    findGroups: jest.fn().mockResolvedValue([]),
    findBusinessTypesByGroups: jest.fn().mockResolvedValue([]),
    groupExists: jest.fn().mockResolvedValue(true),
    countVisibleListingsByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    countCategoriesByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    findCategoriesByType: jest.fn(),
    findAttributeSpecs: jest.fn(),
    typeExists: jest.fn().mockResolvedValue(false),
    createType: jest.fn(async (type: string) => businessType(type)),
    updateType: jest.fn(async (type: string) => businessType(type)),
    deleteType: jest.fn().mockResolvedValue(undefined),
    countBusinessesOfType: jest.fn().mockResolvedValue(0),
    countCategoriesOfType: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('BusinessTypeAdminService', () => {
  describe('create', () => {
    it('creates a new business type when the key is free', async () => {
      const catalog = makeCatalog({ typeExists: jest.fn().mockResolvedValue(false) });
      const service = new BusinessTypeAdminService(catalog);

      const result = await service.create('GAME_CLUB', write());

      expect(result.type).toBe('GAME_CLUB');
      expect(catalog.createType).toHaveBeenCalledWith(
        'GAME_CLUB',
        expect.objectContaining({ nameUz: 'Kafe' }),
      );
    });

    it('rejects a duplicate key with 409 BUSINESS_TYPE_EXISTS', async () => {
      const catalog = makeCatalog({ typeExists: jest.fn().mockResolvedValue(true) });
      const service = new BusinessTypeAdminService(catalog);

      await expect(service.create('GAME_CLUB', write())).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_TYPE_EXISTS,
        status: 409,
      });
      expect(catalog.createType).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates an existing type', async () => {
      const catalog = makeCatalog({ typeExists: jest.fn().mockResolvedValue(true) });
      const service = new BusinessTypeAdminService(catalog);

      await service.update('GAME_CLUB', { nameUz: 'Klub' });

      expect(catalog.updateType).toHaveBeenCalledWith('GAME_CLUB', { nameUz: 'Klub' });
    });

    it('throws 404 BUSINESS_TYPE_NOT_FOUND when the type is missing', async () => {
      const catalog = makeCatalog({ typeExists: jest.fn().mockResolvedValue(false) });
      const service = new BusinessTypeAdminService(catalog);

      await expect(service.update('NOPE', { nameUz: 'X' })).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_TYPE_NOT_FOUND,
        status: 404,
      });
      expect(catalog.updateType).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes an unreferenced type', async () => {
      const catalog = makeCatalog({
        typeExists: jest.fn().mockResolvedValue(true),
        countBusinessesOfType: jest.fn().mockResolvedValue(0),
        countCategoriesOfType: jest.fn().mockResolvedValue(0),
      });
      const service = new BusinessTypeAdminService(catalog);

      await service.delete('GAME_CLUB');

      expect(catalog.deleteType).toHaveBeenCalledWith('GAME_CLUB');
    });

    it('throws 404 when deleting a missing type', async () => {
      const catalog = makeCatalog({ typeExists: jest.fn().mockResolvedValue(false) });
      const service = new BusinessTypeAdminService(catalog);

      await expect(service.delete('NOPE')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_TYPE_NOT_FOUND,
        status: 404,
      });
    });

    it('rejects deletion with 409 BUSINESS_TYPE_IN_USE when businesses reference it', async () => {
      const catalog = makeCatalog({
        typeExists: jest.fn().mockResolvedValue(true),
        countBusinessesOfType: jest.fn().mockResolvedValue(3),
        countCategoriesOfType: jest.fn().mockResolvedValue(0),
      });
      const service = new BusinessTypeAdminService(catalog);

      await expect(service.delete('GAME_CLUB')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_TYPE_IN_USE,
        status: 409,
      });
      expect(catalog.deleteType).not.toHaveBeenCalled();
    });

    it('rejects deletion when categories reference it', async () => {
      const catalog = makeCatalog({
        typeExists: jest.fn().mockResolvedValue(true),
        countBusinessesOfType: jest.fn().mockResolvedValue(0),
        countCategoriesOfType: jest.fn().mockResolvedValue(5),
      });
      const service = new BusinessTypeAdminService(catalog);

      await expect(service.delete('GAME_CLUB')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_TYPE_IN_USE,
        status: 409,
      });
    });
  });
});
