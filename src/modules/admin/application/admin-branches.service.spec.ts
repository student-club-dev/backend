import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  AdminBranchListFilter,
  AdminBranchReadRepository,
} from '../domain/admin-branch-read.repository';
import { AdminBranch } from '../domain/entities/admin-branch.entity';
import { AdminBranchSort } from '../domain/enums/admin-branch-sort.enum';
import { AdminBranchesService } from './admin-branches.service';

function makeRepo(overrides: Partial<AdminBranchReadRepository> = {}): AdminBranchReadRepository {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    ...overrides,
  };
}

function makeFilter(overrides: Partial<AdminBranchListFilter> = {}): AdminBranchListFilter {
  return {
    q: null,
    businessId: null,
    ownerId: null,
    regionId: null,
    districtId: null,
    tradeCenterId: null,
    isActive: null,
    hasDelivery: null,
    geo: null,
    sort: AdminBranchSort.NEWEST,
    page: 1,
    size: 20,
    ...overrides,
  };
}

const BRANCH: AdminBranch = {
  branch: {
    id: 'br-1',
    businessId: 'biz-1',
    name: 'Chilonzor filiali',
    phone: null,
    location: {
      regionId: 'TOSHKENT_SHAHRI',
      districtId: 'CHILONZOR',
      address: 'Chilonzor 9-kvartal',
      landmark: null,
      entranceNote: null,
      lat: 41.2856,
      lng: 69.2034,
      geohash: null,
      mapUrl: null,
      metroStation: null,
    },
    workingHours: [],
    deliveryZone: null,
    isActive: true,
    tradeCenter: null,
    tradeCenterFields: [],
  },
  businessName: 'Navruz Cafe',
  regionName: 'Toshkent shahri',
  districtName: 'Chilonzor',
};

describe('AdminBranchesService', () => {
  describe('list', () => {
    it('passes the filter through to the repository unchanged and returns its page', async () => {
      const page = { items: [], total: 0 };
      const repo = makeRepo({ list: jest.fn().mockResolvedValue(page) });
      const service = new AdminBranchesService(repo);
      const filter = makeFilter({
        q: 'chilonzor',
        geo: { mode: 'RADIUS', scope: { lat: 41.3, lng: 69.2, radiusMeters: 5000 } },
        page: 3,
        size: 10,
      });

      const result = await service.list(filter);

      expect(repo.list).toHaveBeenCalledWith(filter);
      expect(result).toBe(page);
    });
  });

  describe('getById', () => {
    it('returns the branch when found', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(BRANCH) });
      const service = new AdminBranchesService(repo);

      const result = await service.getById('br-1');

      expect(result).toBe(BRANCH);
      expect(repo.findById).toHaveBeenCalledWith('br-1');
    });

    it('throws 404 BRANCH_NOT_FOUND when the id is unknown', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = new AdminBranchesService(repo);

      await expect(service.getById('nope')).rejects.toMatchObject({
        code: ERROR_CODE.BRANCH_NOT_FOUND,
        status: 404,
      });
    });
  });
});
