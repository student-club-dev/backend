import { ERROR_CODE } from '../../../common/errors/error-code';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import {
  AdminBusinessListFilter,
  AdminBusinessReadRepository,
} from '../domain/admin-business-read.repository';
import { AdminBusiness } from '../domain/entities/admin-business.entity';
import { AdminBusinessSort } from '../domain/enums/admin-business-sort.enum';
import { AdminBusinessesService } from './admin-businesses.service';

function makeRepo(
  overrides: Partial<AdminBusinessReadRepository> = {},
): AdminBusinessReadRepository {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    ...overrides,
  };
}

function makeFilter(overrides: Partial<AdminBusinessListFilter> = {}): AdminBusinessListFilter {
  return {
    q: null,
    ownerId: null,
    statuses: [],
    type: null,
    regionId: null,
    isOnlineOnly: null,
    createdFrom: null,
    createdTo: null,
    sort: AdminBusinessSort.NEWEST,
    page: 1,
    size: 20,
    ...overrides,
  };
}

const BUSINESS: AdminBusiness = {
  business: {
    id: 'biz-1',
    ownerId: 'own-1',
    type: 'CAFE',
    name: 'Navruz Cafe',
    legalName: null,
    inn: null,
    description: null,
    logoUrl: null,
    coverUrl: null,
    phone: '+998901112233',
    contacts: null,
    isOnlineOnly: false,
    status: BusinessStatus.APPROVED,
    rejectionReason: null,
    rating: null,
    reviewsCount: 0,
    listingsCount: 3,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  owner: { ownerId: 'own-1', ownerFullName: 'Bek Karimov', ownerPhone: '+998901112233' },
  branchesCount: 2,
};

describe('AdminBusinessesService', () => {
  describe('list', () => {
    it('passes the filter through to the repository unchanged and returns its page', async () => {
      const page = { items: [], total: 0 };
      const repo = makeRepo({ list: jest.fn().mockResolvedValue(page) });
      const service = new AdminBusinessesService(repo);
      const filter = makeFilter({
        q: 'navruz',
        statuses: [BusinessStatus.APPROVED],
        page: 2,
        size: 5,
      });

      const result = await service.list(filter);

      expect(repo.list).toHaveBeenCalledWith(filter);
      expect(result).toBe(page);
    });
  });

  describe('getById', () => {
    it('returns the business when found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(BUSINESS) });
      const service = new AdminBusinessesService(repo);

      const result = await service.getById('biz-1');

      expect(result).toBe(BUSINESS);
      expect(repo.findById).toHaveBeenCalledWith('biz-1');
    });

    it('throws 404 BUSINESS_NOT_FOUND when the id is unknown', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = new AdminBusinessesService(repo);

      await expect(service.getById('nope')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_FOUND,
        status: 404,
      });
    });
  });
});
