import { ERROR_CODE } from '../../../common/errors/error-code';
import { UpdateBusinessInput } from '../../business/application/business.io';
import { BusinessService } from '../../business/application/business.service';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { AdminBusiness } from '../domain/entities/admin-business.entity';
import { AdminBusinessesService } from './admin-businesses.service';
import { AdminBusinessesWriteService } from './admin-businesses-write.service';

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

function makeReads(overrides: Partial<AdminBusinessesService> = {}): AdminBusinessesService {
  return {
    getById: jest.fn().mockResolvedValue(BUSINESS),
    ...overrides,
  } as AdminBusinessesService;
}

function makeBusinessService(overrides: Partial<BusinessService> = {}): BusinessService {
  return {
    adminUpdate: jest.fn().mockResolvedValue(undefined),
    adminApprove: jest.fn().mockResolvedValue(undefined),
    adminReject: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as BusinessService;
}

function baseInput(overrides: Partial<UpdateBusinessInput> = {}): UpdateBusinessInput {
  return { name: 'Navruz 2', ...overrides };
}

describe('AdminBusinessesWriteService', () => {
  describe('update', () => {
    it('reuses BusinessService.adminUpdate (ownership skipped) and returns the re-fetched admin record', async () => {
      const reads = makeReads();
      const businesses = makeBusinessService();
      const service = new AdminBusinessesWriteService(reads, businesses);

      const result = await service.update('biz-1', baseInput());

      expect(businesses.adminUpdate).toHaveBeenCalledWith('biz-1', { name: 'Navruz 2' });
      expect(reads.getById).toHaveBeenCalledWith('biz-1');
      expect(result).toBe(BUSINESS);
    });

    it('propagates 404 BUSINESS_NOT_FOUND from adminUpdate and does not re-fetch', async () => {
      const reads = makeReads();
      const businesses = makeBusinessService({
        adminUpdate: jest
          .fn()
          .mockRejectedValue({ code: ERROR_CODE.BUSINESS_NOT_FOUND, status: 404 }),
      });
      const service = new AdminBusinessesWriteService(reads, businesses);

      await expect(service.update('nope', baseInput())).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_FOUND,
        status: 404,
      });
      expect(reads.getById).not.toHaveBeenCalled();
    });

    it('propagates 422 BUSINESS_TYPE_IMMUTABLE from adminUpdate and does not re-fetch', async () => {
      const reads = makeReads();
      const businesses = makeBusinessService({
        adminUpdate: jest
          .fn()
          .mockRejectedValue({ code: ERROR_CODE.BUSINESS_TYPE_IMMUTABLE, status: 422 }),
      });
      const service = new AdminBusinessesWriteService(reads, businesses);

      await expect(service.update('biz-1', baseInput({ type: 'GAME_CLUB' }))).rejects.toMatchObject(
        { code: ERROR_CODE.BUSINESS_TYPE_IMMUTABLE, status: 422 },
      );
      expect(reads.getById).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('delegates the decision and returns the re-fetched admin record', async () => {
      const reads = makeReads();
      const businesses = makeBusinessService();
      const service = new AdminBusinessesWriteService(reads, businesses);

      const result = await service.approve('biz-1');

      expect(businesses.adminApprove).toHaveBeenCalledWith('biz-1');
      expect(reads.getById).toHaveBeenCalledWith('biz-1');
      expect(result).toBe(BUSINESS);
    });

    it('propagates 409 INVALID_STATUS_TRANSITION and does not re-fetch', async () => {
      const reads = makeReads();
      const businesses = makeBusinessService({
        adminApprove: jest
          .fn()
          .mockRejectedValue({ code: ERROR_CODE.INVALID_STATUS_TRANSITION, status: 409 }),
      });
      const service = new AdminBusinessesWriteService(reads, businesses);

      await expect(service.approve('biz-1')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
        status: 409,
      });
      expect(reads.getById).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('passes the verdict through and returns the re-fetched admin record', async () => {
      const reads = makeReads();
      const businesses = makeBusinessService();
      const service = new AdminBusinessesWriteService(reads, businesses);

      const result = await service.reject('biz-1', 'FAKE_DISCOUNT');

      expect(businesses.adminReject).toHaveBeenCalledWith('biz-1', 'FAKE_DISCOUNT');
      expect(result).toBe(BUSINESS);
    });
  });
});
