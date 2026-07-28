import { ERROR_CODE } from '../../../common/errors/error-code';
import { BranchInput } from '../../branches/application/branches.io';
import { BranchesService } from '../../branches/application/branches.service';
import { AdminBranch } from '../domain/entities/admin-branch.entity';
import { AdminBranchesService } from './admin-branches.service';
import { AdminBranchesWriteService } from './admin-branches-write.service';

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

function makeReads(overrides: Partial<AdminBranchesService> = {}): AdminBranchesService {
  return {
    getById: jest.fn().mockResolvedValue(BRANCH),
    ...overrides,
  } as AdminBranchesService;
}

function makeBranchesService(overrides: Partial<BranchesService> = {}): BranchesService {
  return {
    adminUpdate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as BranchesService;
}

function baseInput(overrides: Partial<BranchInput> = {}): BranchInput {
  return {
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
    tradeCenterId: null,
    tradeCenterFields: [],
    ...overrides,
  };
}

describe('AdminBranchesWriteService', () => {
  describe('update', () => {
    it('reuses BranchesService.adminUpdate (ownership skipped) and returns the re-fetched admin record', async () => {
      const reads = makeReads();
      const branches = makeBranchesService();
      const service = new AdminBranchesWriteService(reads, branches);
      const input = baseInput();

      const result = await service.update('br-1', input);

      expect(branches.adminUpdate).toHaveBeenCalledWith('br-1', input);
      expect(reads.getById).toHaveBeenCalledWith('br-1');
      expect(result).toBe(BRANCH);
    });

    it('propagates 404 BRANCH_NOT_FOUND from adminUpdate and does not re-fetch', async () => {
      const reads = makeReads();
      const branches = makeBranchesService({
        adminUpdate: jest
          .fn()
          .mockRejectedValue({ code: ERROR_CODE.BRANCH_NOT_FOUND, status: 404 }),
      });
      const service = new AdminBranchesWriteService(reads, branches);

      await expect(service.update('nope', baseInput())).rejects.toMatchObject({
        code: ERROR_CODE.BRANCH_NOT_FOUND,
        status: 404,
      });
      expect(reads.getById).not.toHaveBeenCalled();
    });
  });
});
