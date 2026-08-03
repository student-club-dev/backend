import { ConfigService } from '@nestjs/config';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';
import { CatalogRepository } from '../../catalog/domain/catalog.repository';
import { BusinessOwnerRepository } from '../domain/business-owner.repository';
import { BusinessRepository } from '../domain/business.repository';
import { Business } from '../domain/entities/business.entity';
import { BusinessStatus } from '../domain/enums/business-status.enum';
import { CreateBusinessInput } from './business.io';
import { BusinessService } from './business.service';

const owner: AuthenticatedUser = { id: 'owner-1', type: AccountType.BUSINESS };

function business(overrides: Partial<Business> = {}): Business {
  return {
    id: 'biz-1',
    ownerId: 'owner-1',
    type: 'CAFE_RESTAURANT',
    name: 'Navruz',
    legalName: null,
    inn: null,
    description: null,
    logoUrl: null,
    coverUrl: null,
    phone: '+998901234567',
    contacts: null,
    isOnlineOnly: false,
    status: BusinessStatus.DRAFT,
    rejectionReason: null,
    rating: null,
    reviewsCount: 0,
    listingsCount: 0,
    createdAt: new Date('2026-07-16T10:30:00Z'),
    ...overrides,
  };
}

function createInput(overrides: Partial<CreateBusinessInput> = {}): CreateBusinessInput {
  return {
    type: 'CAFE_RESTAURANT',
    name: 'Navruz',
    phone: '+998901234567',
    legalName: null,
    inn: null,
    description: null,
    logoUrl: null,
    coverUrl: null,
    contacts: null,
    isOnlineOnly: false,
    ...overrides,
  };
}

function makeBusinesses(overrides: Partial<BusinessRepository> = {}): BusinessRepository {
  return {
    create: jest.fn(async (data) =>
      business({ ownerId: data.ownerId, type: data.type, name: data.name, status: data.status }),
    ),
    findById: jest.fn().mockResolvedValue(null),
    findManyByOwner: jest.fn().mockResolvedValue([]),
    update: jest.fn(async (id, data) => business({ id, ...data })),
    archive: jest.fn().mockResolvedValue(undefined),
    setStatus: jest.fn(async (id, status, rejectionReason) =>
      business({ id, status, rejectionReason }),
    ),
    countByOwner: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function makeOwners(phoneVerified: boolean | null): BusinessOwnerRepository {
  return { findPhoneVerified: jest.fn().mockResolvedValue(phoneVerified) };
}

function makeCatalog(typeExists: boolean): Pick<CatalogRepository, 'typeExists'> {
  return { typeExists: jest.fn().mockResolvedValue(typeExists) };
}

/** Only MODERATION_ENABLED is ever read from config here, so the stub answers that and nothing else. */
function makeConfig(moderation: 'true' | 'false'): ConfigService<Env, true> {
  return {
    get: jest.fn((key: string) => (key === 'MODERATION_ENABLED' ? moderation : undefined)),
  } as unknown as ConfigService<Env, true>;
}

function makeService(
  businesses: BusinessRepository,
  owners: BusinessOwnerRepository,
  catalog: Pick<CatalogRepository, 'typeExists'>,
  moderation: 'true' | 'false' = 'false',
): BusinessService {
  return new BusinessService(
    businesses,
    owners,
    catalog as CatalogRepository,
    makeConfig(moderation),
  );
}

describe('BusinessService', () => {
  describe('create', () => {
    it('creates an APPROVED business (MVP auto-approve) owned by the caller when the type exists and the phone is verified', async () => {
      const businesses = makeBusinesses();
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      const result = await service.create(owner, createInput());

      expect(result.status).toBe(BusinessStatus.APPROVED);
      expect(businesses.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'owner-1',
          status: BusinessStatus.APPROVED,
          type: 'CAFE_RESTAURANT',
          name: 'Navruz',
        }),
      );
    });

    it('rejects an unknown business type with 422 BUSINESS_TYPE_NOT_FOUND', async () => {
      const businesses = makeBusinesses();
      const service = makeService(businesses, makeOwners(true), makeCatalog(false));

      await expect(service.create(owner, createInput({ type: 'NOPE' }))).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_TYPE_NOT_FOUND,
        status: 422,
      });
      expect(businesses.create).not.toHaveBeenCalled();
    });

    it('enforces the D1 phone-verification gate with 403 PHONE_NOT_VERIFIED', async () => {
      const businesses = makeBusinesses();
      const service = makeService(businesses, makeOwners(false), makeCatalog(true));

      await expect(service.create(owner, createInput())).rejects.toMatchObject({
        code: ERROR_CODE.PHONE_NOT_VERIFIED,
        status: 403,
      });
      expect(businesses.create).not.toHaveBeenCalled();
    });

    it('blocks creation when the owner account is missing (phoneVerified null)', async () => {
      const service = makeService(makeBusinesses(), makeOwners(null), makeCatalog(true));

      await expect(service.create(owner, createInput())).rejects.toMatchObject({
        code: ERROR_CODE.PHONE_NOT_VERIFIED,
        status: 403,
      });
    });

    it('creates a DRAFT when moderation is on — the owner must submit it', async () => {
      const businesses = makeBusinesses();
      const service = makeService(businesses, makeOwners(true), makeCatalog(true), 'true');

      const result = await service.create(owner, createInput());

      expect(result.status).toBe(BusinessStatus.DRAFT);
    });

    it('rejects the sixth business with 429', async () => {
      const businesses = makeBusinesses({ countByOwner: jest.fn().mockResolvedValue(5) });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await expect(service.create(owner, createInput())).rejects.toMatchObject({
        code: ERROR_CODE.RATE_LIMITED,
        status: 429,
      });
      expect(businesses.create).not.toHaveBeenCalled();
    });

    it('allows the fifth business', async () => {
      const businesses = makeBusinesses({ countByOwner: jest.fn().mockResolvedValue(4) });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await expect(service.create(owner, createInput())).resolves.toMatchObject({
        ownerId: 'owner-1',
      });
    });
  });

  describe('submit', () => {
    it('moves a DRAFT to PENDING_REVIEW when moderation is on', async () => {
      const businesses = makeBusinesses({
        findById: jest.fn().mockResolvedValue(business({ status: BusinessStatus.DRAFT })),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true), 'true');

      const result = await service.submit(owner, 'biz-1');

      expect(businesses.setStatus).toHaveBeenCalledWith(
        'biz-1',
        BusinessStatus.PENDING_REVIEW,
        null,
      );
      expect(result.status).toBe(BusinessStatus.PENDING_REVIEW);
    });

    it('approves directly when moderation is off — the endpoint is never a dead end', async () => {
      const businesses = makeBusinesses({
        findById: jest.fn().mockResolvedValue(business({ status: BusinessStatus.DRAFT })),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await service.submit(owner, 'biz-1');

      expect(businesses.setStatus).toHaveBeenCalledWith('biz-1', BusinessStatus.APPROVED, null);
    });

    it('clears a previous rejectionReason when a REJECTED business is resubmitted', async () => {
      const businesses = makeBusinesses({
        findById: jest
          .fn()
          .mockResolvedValue(
            business({ status: BusinessStatus.REJECTED, rejectionReason: 'POOR_IMAGE' }),
          ),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true), 'true');

      await service.submit(owner, 'biz-1');

      expect(businesses.setStatus).toHaveBeenCalledWith(
        'biz-1',
        BusinessStatus.PENDING_REVIEW,
        null,
      );
    });

    it('409s a business that is already APPROVED', async () => {
      const businesses = makeBusinesses({
        findById: jest.fn().mockResolvedValue(business({ status: BusinessStatus.APPROVED })),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true), 'true');

      await expect(service.submit(owner, 'biz-1')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
        status: 409,
      });
      expect(businesses.setStatus).not.toHaveBeenCalled();
    });

    it('403s someone else’s business', async () => {
      const businesses = makeBusinesses({
        findById: jest.fn().mockResolvedValue(business({ ownerId: 'other-owner' })),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true), 'true');

      await expect(service.submit(owner, 'biz-1')).rejects.toMatchObject({ status: 403 });
    });

    it('404s an unknown id', async () => {
      const service = makeService(makeBusinesses(), makeOwners(true), makeCatalog(true), 'true');

      await expect(service.submit(owner, 'nope')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_FOUND,
        status: 404,
      });
    });
  });

  describe('adminApprove / adminReject', () => {
    it('approves a business under review, clearing any stale verdict', async () => {
      const businesses = makeBusinesses({
        findById: jest
          .fn()
          .mockResolvedValue(
            business({ status: BusinessStatus.PENDING_REVIEW, rejectionReason: 'POOR_IMAGE' }),
          ),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true), 'true');

      await service.adminApprove('biz-1');

      expect(businesses.setStatus).toHaveBeenCalledWith('biz-1', BusinessStatus.APPROVED, null);
    });

    it('rejects a business under review, recording the verdict', async () => {
      const businesses = makeBusinesses({
        findById: jest.fn().mockResolvedValue(business({ status: BusinessStatus.PENDING_REVIEW })),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true), 'true');

      await service.adminReject('biz-1', 'FAKE_DISCOUNT');

      expect(businesses.setStatus).toHaveBeenCalledWith(
        'biz-1',
        BusinessStatus.REJECTED,
        'FAKE_DISCOUNT',
      );
    });

    it('409s a business that is not awaiting a decision', async () => {
      const businesses = makeBusinesses({
        findById: jest.fn().mockResolvedValue(business({ status: BusinessStatus.APPROVED })),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true), 'true');

      await expect(service.adminApprove('biz-1')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_STATUS_TRANSITION,
        status: 409,
      });
      expect(businesses.setStatus).not.toHaveBeenCalled();
    });

    it('404s an unknown id', async () => {
      const service = makeService(makeBusinesses(), makeOwners(true), makeCatalog(true), 'true');

      await expect(service.adminApprove('nope')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_FOUND,
        status: 404,
      });
    });

    it('does not require ownership — an admin acts on any business', async () => {
      const businesses = makeBusinesses({
        findById: jest
          .fn()
          .mockResolvedValue(
            business({ ownerId: 'someone-else', status: BusinessStatus.PENDING_REVIEW }),
          ),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true), 'true');

      await expect(service.adminApprove('biz-1')).resolves.toMatchObject({
        status: BusinessStatus.APPROVED,
      });
    });
  });

  describe('getById', () => {
    it('returns the business to its owner', async () => {
      const businesses = makeBusinesses({ findById: jest.fn().mockResolvedValue(business()) });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await expect(service.getById(owner, 'biz-1')).resolves.toMatchObject({ id: 'biz-1' });
    });

    it('throws 404 BUSINESS_NOT_FOUND when it does not exist', async () => {
      const service = makeService(makeBusinesses(), makeOwners(true), makeCatalog(true));

      await expect(service.getById(owner, 'missing')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_FOUND,
        status: 404,
      });
    });

    it('treats an archived business as not found (404)', async () => {
      const businesses = makeBusinesses({
        findById: jest.fn().mockResolvedValue(business({ status: BusinessStatus.ARCHIVED })),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await expect(service.getById(owner, 'biz-1')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_FOUND,
        status: 404,
      });
    });

    it('throws 403 FORBIDDEN for another owner’s business', async () => {
      const businesses = makeBusinesses({
        findById: jest.fn().mockResolvedValue(business({ ownerId: 'someone-else' })),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await expect(service.getById(owner, 'biz-1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
    });
  });

  describe('update', () => {
    it('applies the update for the owner', async () => {
      const businesses = makeBusinesses({ findById: jest.fn().mockResolvedValue(business()) });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await service.update(owner, 'biz-1', { name: 'Navruz 2' });

      expect(businesses.update).toHaveBeenCalledWith(
        'biz-1',
        expect.objectContaining({ name: 'Navruz 2' }),
      );
    });

    it('allows resending the same immutable type (no-op)', async () => {
      const businesses = makeBusinesses({ findById: jest.fn().mockResolvedValue(business()) });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await expect(
        service.update(owner, 'biz-1', { type: 'CAFE_RESTAURANT', name: 'X' }),
      ).resolves.toBeDefined();
    });

    it('rejects changing the type with 422 BUSINESS_TYPE_IMMUTABLE', async () => {
      const businesses = makeBusinesses({ findById: jest.fn().mockResolvedValue(business()) });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await expect(service.update(owner, 'biz-1', { type: 'GAME_CLUB' })).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_TYPE_IMMUTABLE,
        status: 422,
      });
      expect(businesses.update).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('archives the owner’s business', async () => {
      const businesses = makeBusinesses({ findById: jest.fn().mockResolvedValue(business()) });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await service.archive(owner, 'biz-1');

      expect(businesses.archive).toHaveBeenCalledWith('biz-1');
    });

    it('does not archive another owner’s business (403)', async () => {
      const businesses = makeBusinesses({
        findById: jest.fn().mockResolvedValue(business({ ownerId: 'someone-else' })),
      });
      const service = makeService(businesses, makeOwners(true), makeCatalog(true));

      await expect(service.archive(owner, 'biz-1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(businesses.archive).not.toHaveBeenCalled();
    });
  });
});
