import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  AdminCatalogWriteRepository,
  CategoryWrite,
} from '../domain/admin-catalog-write.repository';
import { AdminCategory } from '../domain/entities/admin-category.entity';
import { AdminCategoriesService } from './admin-categories.service';

const CATEGORY: AdminCategory = {
  id: 'cat_1',
  businessType: 'NATIONAL_FOOD',
  gender: null,
  key: 'PIZZA',
  nameUz: 'Pitsa',
  nameRu: null,
  iconUrl: null,
  sortOrder: 0,
  requiresCustomName: false,
};

function categoryWrite(overrides: Partial<CategoryWrite> = {}): CategoryWrite {
  return {
    businessType: 'NATIONAL_FOOD',
    gender: null,
    key: 'PIZZA',
    nameUz: 'Pitsa',
    nameRu: null,
    iconUrl: null,
    sortOrder: 0,
    requiresCustomName: false,
    ...overrides,
  };
}

function makeRepo(
  overrides: Partial<AdminCatalogWriteRepository> = {},
): AdminCatalogWriteRepository {
  return {
    businessTypeExists: jest.fn().mockResolvedValue(true),
    findGroupByKey: jest.fn().mockResolvedValue(null),
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
    deleteGroup: jest.fn().mockResolvedValue(undefined),
    countBusinessTypesInGroup: jest.fn().mockResolvedValue(0),
    findCategoryById: jest.fn().mockResolvedValue(null),
    findCategoryByUnique: jest.fn().mockResolvedValue(null),
    createCategory: jest.fn(async () => CATEGORY),
    updateCategory: jest.fn(async () => CATEGORY),
    deleteCategory: jest.fn().mockResolvedValue(undefined),
    countListingsUsingCategory: jest.fn().mockResolvedValue(0),
    findAttributeSpecById: jest.fn().mockResolvedValue(null),
    findAttributeSpecByUnique: jest.fn().mockResolvedValue(null),
    createAttributeSpec: jest.fn(),
    updateAttributeSpec: jest.fn(),
    deleteAttributeSpec: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('AdminCategoriesService', () => {
  it('creates a category when the type exists and the identity is free', async () => {
    const repo = makeRepo();
    const service = new AdminCategoriesService(repo);

    const result = await service.create(categoryWrite());

    expect(result.key).toBe('PIZZA');
    expect(repo.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ businessType: 'NATIONAL_FOOD', key: 'PIZZA' }),
    );
  });

  it('throws 404 BUSINESS_TYPE_NOT_FOUND when the business type is missing', async () => {
    const repo = makeRepo({ businessTypeExists: jest.fn().mockResolvedValue(false) });
    const service = new AdminCategoriesService(repo);

    await expect(service.create(categoryWrite())).rejects.toMatchObject({
      code: ERROR_CODE.BUSINESS_TYPE_NOT_FOUND,
      status: 404,
    });
    expect(repo.createCategory).not.toHaveBeenCalled();
  });

  it('rejects a duplicate identity with 409 CATEGORY_EXISTS', async () => {
    const repo = makeRepo({ findCategoryByUnique: jest.fn().mockResolvedValue(CATEGORY) });
    const service = new AdminCategoriesService(repo);

    await expect(service.create(categoryWrite())).rejects.toMatchObject({
      code: ERROR_CODE.CATEGORY_EXISTS,
      status: 409,
    });
    expect(repo.createCategory).not.toHaveBeenCalled();
  });

  it('throws 404 CATEGORY_NOT_FOUND when updating a missing category', async () => {
    const repo = makeRepo({ findCategoryById: jest.fn().mockResolvedValue(null) });
    const service = new AdminCategoriesService(repo);

    await expect(service.update('NOPE', { nameUz: 'X' })).rejects.toMatchObject({
      code: ERROR_CODE.CATEGORY_NOT_FOUND,
      status: 404,
    });
    expect(repo.updateCategory).not.toHaveBeenCalled();
  });

  it('deletes an unreferenced category', async () => {
    const repo = makeRepo({ findCategoryById: jest.fn().mockResolvedValue(CATEGORY) });
    const service = new AdminCategoriesService(repo);

    await service.delete('cat_1');

    expect(repo.countListingsUsingCategory).toHaveBeenCalledWith('NATIONAL_FOOD', 'PIZZA');
    expect(repo.deleteCategory).toHaveBeenCalledWith('cat_1');
  });

  it('rejects deletion with 409 CATEGORY_IN_USE when listings reference it', async () => {
    const repo = makeRepo({
      findCategoryById: jest.fn().mockResolvedValue(CATEGORY),
      countListingsUsingCategory: jest.fn().mockResolvedValue(7),
    });
    const service = new AdminCategoriesService(repo);

    await expect(service.delete('cat_1')).rejects.toMatchObject({
      code: ERROR_CODE.CATEGORY_IN_USE,
      status: 409,
    });
    expect(repo.deleteCategory).not.toHaveBeenCalled();
  });
});
