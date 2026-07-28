import { ERROR_CODE } from '../../../common/errors/error-code';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import {
  AdminCatalogWriteRepository,
  AttributeSpecWrite,
} from '../domain/admin-catalog-write.repository';
import { AdminAttributeSpec } from '../domain/entities/admin-attribute-spec.entity';
import { AdminAttributeSpecsService } from './admin-attribute-specs.service';

const SPEC: AdminAttributeSpec = {
  id: 'spec_1',
  businessType: 'GAME_CLUB',
  categoryKey: 'PLAYSTATION',
  key: 'model',
  label: 'Model',
  kind: AttributeFieldType.TEXT,
  required: false,
  hint: null,
  suffix: null,
  multiple: null,
  options: null,
  sortOrder: 0,
};

function specWrite(overrides: Partial<AttributeSpecWrite> = {}): AttributeSpecWrite {
  return {
    businessType: 'GAME_CLUB',
    categoryKey: 'PLAYSTATION',
    key: 'model',
    label: 'Model',
    kind: AttributeFieldType.TEXT,
    required: false,
    hint: null,
    suffix: null,
    multiple: null,
    options: null,
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
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
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
    createAttributeSpec: jest.fn(async () => SPEC),
    updateAttributeSpec: jest.fn(async () => SPEC),
    deleteAttributeSpec: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('AdminAttributeSpecsService', () => {
  it('creates a spec when the type exists and the identity is free', async () => {
    const repo = makeRepo();
    const service = new AdminAttributeSpecsService(repo);

    const result = await service.create(specWrite());

    expect(result.key).toBe('model');
    expect(repo.createAttributeSpec).toHaveBeenCalledWith(
      expect.objectContaining({ businessType: 'GAME_CLUB', key: 'model' }),
    );
  });

  it('throws 404 BUSINESS_TYPE_NOT_FOUND when the business type is missing', async () => {
    const repo = makeRepo({ businessTypeExists: jest.fn().mockResolvedValue(false) });
    const service = new AdminAttributeSpecsService(repo);

    await expect(service.create(specWrite())).rejects.toMatchObject({
      code: ERROR_CODE.BUSINESS_TYPE_NOT_FOUND,
      status: 404,
    });
    expect(repo.createAttributeSpec).not.toHaveBeenCalled();
  });

  it('rejects a duplicate identity with 409 ATTRIBUTE_SPEC_EXISTS', async () => {
    const repo = makeRepo({ findAttributeSpecByUnique: jest.fn().mockResolvedValue(SPEC) });
    const service = new AdminAttributeSpecsService(repo);

    await expect(service.create(specWrite())).rejects.toMatchObject({
      code: ERROR_CODE.ATTRIBUTE_SPEC_EXISTS,
      status: 409,
    });
    expect(repo.createAttributeSpec).not.toHaveBeenCalled();
  });

  it('throws 404 ATTRIBUTE_SPEC_NOT_FOUND when updating a missing spec', async () => {
    const repo = makeRepo({ findAttributeSpecById: jest.fn().mockResolvedValue(null) });
    const service = new AdminAttributeSpecsService(repo);

    await expect(service.update('NOPE', { label: 'X' })).rejects.toMatchObject({
      code: ERROR_CODE.ATTRIBUTE_SPEC_NOT_FOUND,
      status: 404,
    });
    expect(repo.updateAttributeSpec).not.toHaveBeenCalled();
  });

  it('deletes a spec with no in-use guard', async () => {
    const repo = makeRepo({ findAttributeSpecById: jest.fn().mockResolvedValue(SPEC) });
    const service = new AdminAttributeSpecsService(repo);

    await service.delete('spec_1');

    expect(repo.deleteAttributeSpec).toHaveBeenCalledWith('spec_1');
  });

  it('throws 404 ATTRIBUTE_SPEC_NOT_FOUND when deleting a missing spec', async () => {
    const repo = makeRepo({ findAttributeSpecById: jest.fn().mockResolvedValue(null) });
    const service = new AdminAttributeSpecsService(repo);

    await expect(service.delete('NOPE')).rejects.toMatchObject({
      code: ERROR_CODE.ATTRIBUTE_SPEC_NOT_FOUND,
      status: 404,
    });
    expect(repo.deleteAttributeSpec).not.toHaveBeenCalled();
  });
});
