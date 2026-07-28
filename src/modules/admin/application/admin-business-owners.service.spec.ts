import { ERROR_CODE } from '../../../common/errors/error-code';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import {
  AdminBusinessOwnerReadRepository,
  AdminOwnerListFilter,
} from '../domain/admin-business-owner-read.repository';
import {
  AdminBusinessOwner,
  AdminOwnerBusinessSummary,
} from '../domain/entities/admin-business-owner.entity';
import { AdminUserSort } from '../domain/enums/admin-user-sort.enum';
import { AdminUserStatus } from '../domain/enums/admin-user-status.enum';
import { AdminBusinessOwnersService } from './admin-business-owners.service';

function makeRepo(
  overrides: Partial<AdminBusinessOwnerReadRepository> = {},
): AdminBusinessOwnerReadRepository {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    exists: jest.fn(),
    listBusinesses: jest.fn(),
    ...overrides,
  };
}

function makeFilter(overrides: Partial<AdminOwnerListFilter> = {}): AdminOwnerListFilter {
  return {
    q: null,
    status: null,
    phoneVerified: null,
    createdFrom: null,
    createdTo: null,
    sort: AdminUserSort.NEWEST,
    page: 1,
    size: 20,
    ...overrides,
  };
}

const OWNER: AdminBusinessOwner = {
  id: 'own-1',
  email: 'owner@b.uz',
  phoneNumber: '+998901112233',
  phoneVerified: true,
  emailVerified: false,
  firstName: 'Bek',
  lastName: 'Karimov',
  avatarUrl: null,
  gender: null,
  businessesCount: 2,
  status: AdminUserStatus.ACTIVE,
  bannedAt: null,
  banReason: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

const BUSINESS: AdminOwnerBusinessSummary = {
  id: 'biz-1',
  name: 'Cafe',
  type: 'CAFE',
  status: BusinessStatus.APPROVED,
  listingsCount: 5,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('AdminBusinessOwnersService', () => {
  describe('list', () => {
    it('passes the filter through to the repository unchanged and returns its page', async () => {
      const page = { items: [], total: 0 };
      const repo = makeRepo({ list: jest.fn().mockResolvedValue(page) });
      const service = new AdminBusinessOwnersService(repo);
      const filter = makeFilter({ q: 'bek', page: 3, size: 5 });

      const result = await service.list(filter);

      expect(repo.list).toHaveBeenCalledWith(filter);
      expect(result).toBe(page);
    });
  });

  describe('getById', () => {
    it('returns the owner when found (no passwordHash in the record)', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(OWNER) });
      const service = new AdminBusinessOwnersService(repo);

      const result = await service.getById('own-1');

      expect(result).toBe(OWNER);
      expect(Object.keys(result)).not.toContain('passwordHash');
    });

    it('throws 404 BUSINESS_OWNER_NOT_FOUND when the id is unknown', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = new AdminBusinessOwnersService(repo);

      await expect(service.getById('nope')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_OWNER_NOT_FOUND,
        status: 404,
      });
    });
  });

  describe('listBusinesses', () => {
    it('returns the businesses when the owner exists', async () => {
      const repo = makeRepo({
        exists: jest.fn().mockResolvedValue(true),
        listBusinesses: jest.fn().mockResolvedValue([BUSINESS]),
      });
      const service = new AdminBusinessOwnersService(repo);

      const result = await service.listBusinesses('own-1');

      expect(result).toEqual([BUSINESS]);
      expect(repo.listBusinesses).toHaveBeenCalledWith('own-1');
    });

    it('throws 404 BUSINESS_OWNER_NOT_FOUND when the owner is missing, without querying businesses', async () => {
      const repo = makeRepo({ exists: jest.fn().mockResolvedValue(false) });
      const service = new AdminBusinessOwnersService(repo);

      await expect(service.listBusinesses('nope')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_OWNER_NOT_FOUND,
        status: 404,
      });
      expect(repo.listBusinesses).not.toHaveBeenCalled();
    });
  });
});
