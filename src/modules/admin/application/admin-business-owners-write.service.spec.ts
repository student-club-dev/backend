import { hash } from '@node-rs/argon2';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { ProfileService } from '../../profiles/application/profile.service';
import { AdminBusinessOwnerWriteRepository } from '../domain/admin-business-owner-write.repository';
import { AdminBusinessOwner } from '../domain/entities/admin-business-owner.entity';
import { AdminUserStatus } from '../domain/enums/admin-user-status.enum';
import { AdminBusinessOwnersService } from './admin-business-owners.service';
import { AdminBusinessOwnersWriteService } from './admin-business-owners-write.service';
import { AdminCreateOwnerInput } from './admin-user-write.io';

jest.mock('@node-rs/argon2', () => ({ hash: jest.fn() }));
const hashMock = hash as unknown as jest.Mock;

const OWNER: AdminBusinessOwner = {
  id: 'own-1',
  email: 'owner@b.uz',
  phoneNumber: '+998901234567',
  phoneVerified: true,
  emailVerified: false,
  firstName: 'Bek',
  lastName: 'Karimov',
  avatarUrl: null,
  gender: null,
  businessesCount: 0,
  status: AdminUserStatus.ACTIVE,
  bannedAt: null,
  banReason: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

function makeReads(
  overrides: Partial<AdminBusinessOwnersService> = {},
): AdminBusinessOwnersService {
  return {
    getById: jest.fn().mockResolvedValue(OWNER),
    ...overrides,
  } as AdminBusinessOwnersService;
}

function makeWriteRepo(
  overrides: Partial<AdminBusinessOwnerWriteRepository> = {},
): AdminBusinessOwnerWriteRepository {
  return {
    existsByEmail: jest.fn().mockResolvedValue(false),
    existsByPhone: jest.fn().mockResolvedValue(false),
    create: jest.fn().mockResolvedValue('own-1'),
    ban: jest.fn().mockResolvedValue(undefined),
    unban: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeProfileService(overrides: Partial<ProfileService> = {}): ProfileService {
  return { updateById: jest.fn().mockResolvedValue(undefined), ...overrides } as ProfileService;
}

function baseCreateInput(overrides: Partial<AdminCreateOwnerInput> = {}): AdminCreateOwnerInput {
  return {
    email: 'new@b.uz',
    phoneNumber: null,
    password: 'secret123',
    firstName: 'Bek',
    lastName: null,
    gender: null,
    avatarUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  hashMock.mockReset().mockResolvedValue('argon2-hash');
});

describe('AdminBusinessOwnersWriteService', () => {
  describe('update', () => {
    it('reuses ProfileService.updateById and returns the re-fetched record (no passwordHash)', async () => {
      const reads = makeReads();
      const profileService = makeProfileService();
      const service = new AdminBusinessOwnersWriteService(reads, makeWriteRepo(), profileService);

      const result = await service.update('own-1', { firstName: 'Bek' });

      expect(reads.getById).toHaveBeenCalledWith('own-1');
      expect(profileService.updateById).toHaveBeenCalledWith(AccountType.BUSINESS, 'own-1', {
        firstName: 'Bek',
      });
      expect(result).toBe(OWNER);
      expect(Object.keys(result)).not.toContain('passwordHash');
    });

    it('throws 404 BUSINESS_OWNER_NOT_FOUND when the id is unknown', async () => {
      const reads = makeReads({
        getById: jest
          .fn()
          .mockRejectedValue({ code: ERROR_CODE.BUSINESS_OWNER_NOT_FOUND, status: 404 }),
      });
      const profileService = makeProfileService();
      const service = new AdminBusinessOwnersWriteService(reads, makeWriteRepo(), profileService);

      await expect(service.update('nope', { firstName: 'X' })).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_OWNER_NOT_FOUND,
        status: 404,
      });
      expect(profileService.updateById).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('hashes the password, creates the owner, and returns it without passwordHash', async () => {
      const reads = makeReads();
      const repo = makeWriteRepo();
      const service = new AdminBusinessOwnersWriteService(reads, repo, makeProfileService());

      const result = await service.create(baseCreateInput({ email: 'new@b.uz' }));

      expect(hashMock).toHaveBeenCalledWith('secret123');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@b.uz', passwordHash: 'argon2-hash' }),
      );
      expect(reads.getById).toHaveBeenCalledWith('own-1');
      expect(result).toBe(OWNER);
      expect(Object.keys(result)).not.toContain('passwordHash');
    });

    it('throws 409 ACCOUNT_EXISTS when the email is taken (no hash, no create)', async () => {
      const repo = makeWriteRepo({ existsByEmail: jest.fn().mockResolvedValue(true) });
      const service = new AdminBusinessOwnersWriteService(makeReads(), repo, makeProfileService());

      await expect(service.create(baseCreateInput({ email: 'taken@b.uz' }))).rejects.toMatchObject({
        code: ERROR_CODE.ACCOUNT_EXISTS,
        status: 409,
      });
      expect(hashMock).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws 409 ACCOUNT_EXISTS when the phone is taken', async () => {
      const repo = makeWriteRepo({ existsByPhone: jest.fn().mockResolvedValue(true) });
      const service = new AdminBusinessOwnersWriteService(makeReads(), repo, makeProfileService());

      await expect(
        service.create(baseCreateInput({ email: null, phoneNumber: '+998901234567' })),
      ).rejects.toMatchObject({ code: ERROR_CODE.ACCOUNT_EXISTS, status: 409 });
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('ban', () => {
    it('bans the owner (delegating session revocation to the repo) and returns the re-fetched record', async () => {
      const reads = makeReads();
      const repo = makeWriteRepo();
      const service = new AdminBusinessOwnersWriteService(reads, repo, makeProfileService());

      const result = await service.ban('own-1', 'fraud');

      expect(reads.getById).toHaveBeenCalledWith('own-1');
      expect(repo.ban).toHaveBeenCalledWith('own-1', 'fraud');
      expect(result).toBe(OWNER);
    });

    it('throws 404 BUSINESS_OWNER_NOT_FOUND when the id is unknown (before banning)', async () => {
      const reads = makeReads({
        getById: jest
          .fn()
          .mockRejectedValue({ code: ERROR_CODE.BUSINESS_OWNER_NOT_FOUND, status: 404 }),
      });
      const repo = makeWriteRepo();
      const service = new AdminBusinessOwnersWriteService(reads, repo, makeProfileService());

      await expect(service.ban('nope', 'fraud')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_OWNER_NOT_FOUND,
        status: 404,
      });
      expect(repo.ban).not.toHaveBeenCalled();
    });
  });

  describe('unban', () => {
    it('unbans the owner and returns the re-fetched record', async () => {
      const reads = makeReads();
      const repo = makeWriteRepo();
      const service = new AdminBusinessOwnersWriteService(reads, repo, makeProfileService());

      const result = await service.unban('own-1');

      expect(repo.unban).toHaveBeenCalledWith('own-1');
      expect(result).toBe(OWNER);
    });
  });
});
