import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
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
    ...overrides,
  };
}

function makeOwners(phoneVerified: boolean | null): BusinessOwnerRepository {
  return { findPhoneVerified: jest.fn().mockResolvedValue(phoneVerified) };
}

function makeCatalog(typeExists: boolean): Pick<CatalogRepository, 'typeExists'> {
  return { typeExists: jest.fn().mockResolvedValue(typeExists) };
}

function makeService(
  businesses: BusinessRepository,
  owners: BusinessOwnerRepository,
  catalog: Pick<CatalogRepository, 'typeExists'>,
): BusinessService {
  return new BusinessService(businesses, owners, catalog as CatalogRepository);
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
