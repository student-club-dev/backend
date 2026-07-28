import { ERROR_CODE } from '../../../common/errors/error-code';
import { CatalogGroup } from '../../catalog/domain/entities/catalog-group.entity';
import {
  AdminCatalogWriteRepository,
  CatalogGroupWrite,
} from '../domain/admin-catalog-write.repository';
import { AdminCatalogGroupsService } from './admin-catalog-groups.service';

const GROUP: CatalogGroup = {
  key: 'FOOD',
  nameUz: 'Ovqatlanish',
  nameRu: null,
  emoji: null,
  icon: null,
  accentColor: null,
  sortOrder: 0,
  typeKeys: [],
};

function groupWrite(overrides: Partial<CatalogGroupWrite> = {}): CatalogGroupWrite {
  return {
    nameUz: 'Ovqatlanish',
    nameRu: null,
    emoji: null,
    icon: null,
    accentColor: null,
    sortOrder: 0,
    ...overrides,
  };
}

function makeRepo(
  overrides: Partial<AdminCatalogWriteRepository> = {},
): AdminCatalogWriteRepository {
  return {
    businessTypeExists: jest.fn().mockResolvedValue(true),
    findGroupByKey: jest.fn().mockResolvedValue(null),
    createGroup: jest.fn(async (key: string) => ({ ...GROUP, key })),
    updateGroup: jest.fn().mockResolvedValue(GROUP),
    deleteGroup: jest.fn().mockResolvedValue(undefined),
    countBusinessTypesInGroup: jest.fn().mockResolvedValue(0),
    findCategoryById: jest.fn().mockResolvedValue(null),
    findCategoryByUnique: jest.fn().mockResolvedValue(null),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
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

describe('AdminCatalogGroupsService', () => {
  it('creates a group when the key is free', async () => {
    const repo = makeRepo();
    const service = new AdminCatalogGroupsService(repo);

    const result = await service.create('FOOD', groupWrite());

    expect(result.key).toBe('FOOD');
    expect(repo.createGroup).toHaveBeenCalledWith(
      'FOOD',
      expect.objectContaining({ nameUz: 'Ovqatlanish' }),
    );
  });

  it('rejects a duplicate group key with 409 CATALOG_GROUP_EXISTS', async () => {
    const repo = makeRepo({ findGroupByKey: jest.fn().mockResolvedValue(GROUP) });
    const service = new AdminCatalogGroupsService(repo);

    await expect(service.create('FOOD', groupWrite())).rejects.toMatchObject({
      code: ERROR_CODE.CATALOG_GROUP_EXISTS,
      status: 409,
    });
    expect(repo.createGroup).not.toHaveBeenCalled();
  });

  it('throws 404 CATALOG_GROUP_NOT_FOUND when updating a missing group', async () => {
    const repo = makeRepo({ findGroupByKey: jest.fn().mockResolvedValue(null) });
    const service = new AdminCatalogGroupsService(repo);

    await expect(service.update('NOPE', { nameUz: 'X' })).rejects.toMatchObject({
      code: ERROR_CODE.CATALOG_GROUP_NOT_FOUND,
      status: 404,
    });
    expect(repo.updateGroup).not.toHaveBeenCalled();
  });

  it('deletes an unreferenced group', async () => {
    const repo = makeRepo({ findGroupByKey: jest.fn().mockResolvedValue(GROUP) });
    const service = new AdminCatalogGroupsService(repo);

    await service.delete('FOOD');

    expect(repo.deleteGroup).toHaveBeenCalledWith('FOOD');
  });

  it('rejects deletion with 409 CATALOG_GROUP_IN_USE when business types reference it', async () => {
    const repo = makeRepo({
      findGroupByKey: jest.fn().mockResolvedValue(GROUP),
      countBusinessTypesInGroup: jest.fn().mockResolvedValue(2),
    });
    const service = new AdminCatalogGroupsService(repo);

    await expect(service.delete('FOOD')).rejects.toMatchObject({
      code: ERROR_CODE.CATALOG_GROUP_IN_USE,
      status: 409,
    });
    expect(repo.deleteGroup).not.toHaveBeenCalled();
  });
});
