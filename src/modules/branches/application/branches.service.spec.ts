import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BranchRepository } from '../domain/branches.repository';
import { Branch } from '../domain/entities/branch.entity';
import { DayOfWeek } from '../domain/enums/day-of-week.enum';
import { OwningBusinessRepository } from '../domain/owning-business.repository';
import { BranchInput } from './branches.io';
import { BranchesService } from './branches.service';

const owner: AuthenticatedUser = { id: 'owner-1', type: AccountType.BUSINESS };

function branch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'br-1',
    businessId: 'biz-1',
    name: 'Chilonzor filiali',
    phone: null,
    location: {
      regionId: 'TOSHKENT_SHAHRI',
      districtId: 'CHILONZOR',
      address: 'Chilonzor 9-kvartal, 42-uy',
      landmark: null,
      entranceNote: null,
      lat: 41.2856,
      lng: 69.2034,
      geohash: null,
      mapUrl: null,
      metroStation: null,
    },
    workingHours: [{ day: DayOfWeek.MON, open: '09:00', close: '23:00', isClosed: false }],
    deliveryZone: null,
    isActive: true,
    ...overrides,
  };
}

function createInput(overrides: Partial<BranchInput> = {}): BranchInput {
  return {
    name: 'Chilonzor filiali',
    phone: null,
    location: branch().location,
    workingHours: branch().workingHours,
    deliveryZone: null,
    isActive: true,
    ...overrides,
  };
}

function makeBranches(overrides: Partial<BranchRepository> = {}): BranchRepository {
  return {
    create: jest.fn(async (data) => branch({ businessId: data.businessId, name: data.name })),
    findById: jest.fn().mockResolvedValue(null),
    findManyByBusiness: jest.fn().mockResolvedValue([]),
    update: jest.fn(async (id, data) => branch({ id, name: data.name })),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeBusinesses(ownerId: string | null): OwningBusinessRepository {
  return { findOwnerId: jest.fn().mockResolvedValue(ownerId) };
}

function makeService(
  branches: BranchRepository,
  businesses: OwningBusinessRepository,
): BranchesService {
  return new BranchesService(branches, businesses);
}

describe('BranchesService', () => {
  describe('list', () => {
    it('returns the branches of a business the caller owns', async () => {
      const branches = makeBranches({
        findManyByBusiness: jest.fn().mockResolvedValue([branch()]),
      });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await expect(service.list(owner, 'biz-1')).resolves.toHaveLength(1);
      expect(branches.findManyByBusiness).toHaveBeenCalledWith('biz-1');
    });

    it('throws 404 BUSINESS_NOT_FOUND when the business does not exist', async () => {
      const service = makeService(makeBranches(), makeBusinesses(null));

      await expect(service.list(owner, 'missing')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_FOUND,
        status: 404,
      });
    });

    it('throws 403 FORBIDDEN for another owner’s business', async () => {
      const service = makeService(makeBranches(), makeBusinesses('someone-else'));

      await expect(service.list(owner, 'biz-1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
    });
  });

  describe('create', () => {
    it('creates a branch under a business the caller owns', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('owner-1'));

      const result = await service.create(owner, 'biz-1', createInput());

      expect(result.businessId).toBe('biz-1');
      expect(branches.create).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 'biz-1', name: 'Chilonzor filiali' }),
      );
    });

    it('does not create for another owner’s business (403)', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('someone-else'));

      await expect(service.create(owner, 'biz-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(branches.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('applies the update for the owner', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await service.update(owner, 'biz-1', 'br-1', createInput({ name: 'Yunusobod filiali' }));

      expect(branches.update).toHaveBeenCalledWith(
        'br-1',
        expect.objectContaining({ name: 'Yunusobod filiali' }),
      );
    });

    it('throws 404 BRANCH_NOT_FOUND when the branch does not exist', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(null) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await expect(service.update(owner, 'biz-1', 'missing', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.BRANCH_NOT_FOUND,
        status: 404,
      });
      expect(branches.update).not.toHaveBeenCalled();
    });

    it('treats a branch of another business as not found (404)', async () => {
      const branches = makeBranches({
        findById: jest.fn().mockResolvedValue(branch({ businessId: 'other-biz' })),
      });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await expect(service.update(owner, 'biz-1', 'br-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.BRANCH_NOT_FOUND,
        status: 404,
      });
      expect(branches.update).not.toHaveBeenCalled();
    });

    it('does not update a branch under another owner’s business (403)', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const service = makeService(branches, makeBusinesses('someone-else'));

      await expect(service.update(owner, 'biz-1', 'br-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(branches.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('hard-deletes the owner’s branch', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await service.delete(owner, 'biz-1', 'br-1');

      expect(branches.delete).toHaveBeenCalledWith('br-1');
    });

    it('throws 404 BRANCH_NOT_FOUND when the branch does not exist', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(null) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await expect(service.delete(owner, 'biz-1', 'missing')).rejects.toMatchObject({
        code: ERROR_CODE.BRANCH_NOT_FOUND,
        status: 404,
      });
      expect(branches.delete).not.toHaveBeenCalled();
    });

    it('does not delete a branch under another owner’s business (403)', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const service = makeService(branches, makeBusinesses('someone-else'));

      await expect(service.delete(owner, 'biz-1', 'br-1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(branches.delete).not.toHaveBeenCalled();
    });
  });
});
