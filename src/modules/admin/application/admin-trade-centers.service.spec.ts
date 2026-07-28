import { ERROR_CODE } from '../../../common/errors/error-code';
import { TradeCenterField } from '../../trade-centers/domain/entities/trade-center.entity';
import { TradeCenterFieldType } from '../../trade-centers/domain/enums/trade-center-field-type.enum';
import {
  AdminTradeCenterWriteRepository,
  TradeCenterFieldWrite,
  TradeCenterWrite,
} from '../domain/admin-trade-center-write.repository';
import { AdminTradeCenterDetail } from '../domain/entities/admin-trade-center.entity';
import { TradeCenterStatus } from '../domain/enums/trade-center-status.enum';
import { AdminTradeCentersService } from './admin-trade-centers.service';

const FIELD: TradeCenterField = {
  id: 'f_qator',
  label: 'Qator',
  type: TradeCenterFieldType.TEXT,
  required: false,
  sortOrder: 0,
};

const CENTER: AdminTradeCenterDetail = {
  id: 'tc_abusaxiy',
  name: 'Abu Saxiy',
  slug: 'abu-saxiy',
  status: TradeCenterStatus.ACTIVE,
  sortOrder: 0,
  fields: [FIELD],
};

function centerWrite(overrides: Partial<TradeCenterWrite> = {}): TradeCenterWrite {
  return {
    name: 'Abu Saxiy',
    slug: 'abu-saxiy',
    status: TradeCenterStatus.ACTIVE,
    sortOrder: 0,
    ...overrides,
  };
}

function fieldWrite(overrides: Partial<TradeCenterFieldWrite> = {}): TradeCenterFieldWrite {
  return {
    label: 'Qator',
    type: TradeCenterFieldType.TEXT,
    required: false,
    sortOrder: 0,
    ...overrides,
  };
}

function makeRepo(
  overrides: Partial<AdminTradeCenterWriteRepository> = {},
): AdminTradeCenterWriteRepository {
  return {
    findAll: jest.fn().mockResolvedValue([CENTER]),
    findByIdWithFields: jest.fn().mockResolvedValue(CENTER),
    findIdBySlug: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(CENTER),
    update: jest.fn().mockResolvedValue(CENTER),
    delete: jest.fn().mockResolvedValue(undefined),
    countBranches: jest.fn().mockResolvedValue(0),
    findField: jest.fn().mockResolvedValue(FIELD),
    createField: jest.fn().mockResolvedValue(FIELD),
    updateField: jest.fn().mockResolvedValue(FIELD),
    deleteField: jest.fn().mockResolvedValue(undefined),
    countFieldValues: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('AdminTradeCentersService', () => {
  describe('centers', () => {
    it('creates a center when the slug is free', async () => {
      const repo = makeRepo({ findIdBySlug: jest.fn().mockResolvedValue(null) });
      const service = new AdminTradeCentersService(repo);

      const result = await service.create(centerWrite());

      expect(result).toBe(CENTER);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'abu-saxiy' }));
    });

    it('rejects a duplicate slug with 409 TRADE_CENTER_SLUG_EXISTS', async () => {
      const repo = makeRepo({ findIdBySlug: jest.fn().mockResolvedValue('tc_other') });
      const service = new AdminTradeCentersService(repo);

      await expect(service.create(centerWrite())).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_SLUG_EXISTS,
        status: 409,
      });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws 404 TRADE_CENTER_NOT_FOUND when updating a missing center', async () => {
      const repo = makeRepo({ findByIdWithFields: jest.fn().mockResolvedValue(null) });
      const service = new AdminTradeCentersService(repo);

      await expect(service.update('NOPE', { name: 'X' })).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_NOT_FOUND,
        status: 404,
      });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rejects a slug change that collides with another center (409)', async () => {
      const repo = makeRepo({
        findByIdWithFields: jest.fn().mockResolvedValue(CENTER),
        findIdBySlug: jest.fn().mockResolvedValue('tc_other'),
      });
      const service = new AdminTradeCentersService(repo);

      await expect(service.update('tc_abusaxiy', { slug: 'taken' })).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_SLUG_EXISTS,
        status: 409,
      });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('allows a slug that resolves to the same center on update', async () => {
      const repo = makeRepo({
        findByIdWithFields: jest.fn().mockResolvedValue(CENTER),
        findIdBySlug: jest.fn().mockResolvedValue('tc_abusaxiy'),
      });
      const service = new AdminTradeCentersService(repo);

      await service.update('tc_abusaxiy', { slug: 'abu-saxiy' });

      expect(repo.update).toHaveBeenCalledWith('tc_abusaxiy', { slug: 'abu-saxiy' });
    });

    it('deletes an unreferenced center', async () => {
      const repo = makeRepo({ countBranches: jest.fn().mockResolvedValue(0) });
      const service = new AdminTradeCentersService(repo);

      await service.delete('tc_abusaxiy');

      expect(repo.delete).toHaveBeenCalledWith('tc_abusaxiy');
    });

    it('rejects deletion with 409 TRADE_CENTER_IN_USE when branches reference it', async () => {
      const repo = makeRepo({ countBranches: jest.fn().mockResolvedValue(2) });
      const service = new AdminTradeCentersService(repo);

      await expect(service.delete('tc_abusaxiy')).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_IN_USE,
        status: 409,
      });
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });

  describe('fields', () => {
    it('adds a field to an existing center', async () => {
      const repo = makeRepo({ findByIdWithFields: jest.fn().mockResolvedValue(CENTER) });
      const service = new AdminTradeCentersService(repo);

      const result = await service.createField('tc_abusaxiy', fieldWrite());

      expect(result).toBe(FIELD);
      expect(repo.createField).toHaveBeenCalledWith(
        'tc_abusaxiy',
        expect.objectContaining({ label: 'Qator' }),
      );
    });

    it('throws 404 TRADE_CENTER_NOT_FOUND when adding a field to a missing center', async () => {
      const repo = makeRepo({ findByIdWithFields: jest.fn().mockResolvedValue(null) });
      const service = new AdminTradeCentersService(repo);

      await expect(service.createField('NOPE', fieldWrite())).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_NOT_FOUND,
        status: 404,
      });
      expect(repo.createField).not.toHaveBeenCalled();
    });

    it('throws 404 TRADE_CENTER_FIELD_NOT_FOUND when the field is unknown under the center', async () => {
      const repo = makeRepo({ findField: jest.fn().mockResolvedValue(null) });
      const service = new AdminTradeCentersService(repo);

      await expect(
        service.updateField('tc_abusaxiy', 'ghost', { label: 'X' }),
      ).rejects.toMatchObject({ code: ERROR_CODE.TRADE_CENTER_FIELD_NOT_FOUND, status: 404 });
      expect(repo.updateField).not.toHaveBeenCalled();
    });

    it('rejects field deletion with 409 TRADE_CENTER_FIELD_IN_USE when a branch has a value', async () => {
      const repo = makeRepo({
        findField: jest.fn().mockResolvedValue(FIELD),
        countFieldValues: jest.fn().mockResolvedValue(1),
      });
      const service = new AdminTradeCentersService(repo);

      await expect(service.deleteField('tc_abusaxiy', 'f_qator')).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_FIELD_IN_USE,
        status: 409,
      });
      expect(repo.deleteField).not.toHaveBeenCalled();
    });

    it('deletes an unused field', async () => {
      const repo = makeRepo({
        findField: jest.fn().mockResolvedValue(FIELD),
        countFieldValues: jest.fn().mockResolvedValue(0),
      });
      const service = new AdminTradeCentersService(repo);

      await service.deleteField('tc_abusaxiy', 'f_qator');

      expect(repo.deleteField).toHaveBeenCalledWith('f_qator');
    });
  });
});
