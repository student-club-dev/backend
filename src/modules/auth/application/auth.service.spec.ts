import { hash, verify } from '@node-rs/argon2';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { AccountRepository } from '../domain/account.repository';
import { Account } from '../domain/entities/account.entity';
import { RefreshToken } from '../domain/entities/refresh-token.entity';
import { RefreshTokenRepository } from '../domain/refresh-token.repository';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

const hashMock = hash as unknown as jest.Mock;
const verifyMock = verify as unknown as jest.Mock;

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    email: 'a@b.com',
    phoneNumber: null,
    passwordHash: 'stored-hash',
    ...overrides,
  };
}

function makeAccountRepository(overrides: Partial<AccountRepository> = {}): AccountRepository {
  return {
    findByEmail: jest.fn().mockResolvedValue(null),
    findByPhone: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(makeAccount()),
    ...overrides,
  };
}

function makeRefreshTokenRepository(
  overrides: Partial<RefreshTokenRepository> = {},
): RefreshTokenRepository {
  return {
    create: jest.fn().mockResolvedValue(undefined),
    findActiveByHash: jest.fn().mockResolvedValue(null),
    revoke: jest.fn().mockResolvedValue(undefined),
    rotate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTokenService(): TokenService {
  return {
    signAccessToken: jest.fn().mockResolvedValue('access-token'),
    generateRefreshToken: jest.fn().mockReturnValue('plain-refresh'),
    hashRefreshToken: jest.fn((token: string) => `hash:${token}`),
    refreshTokenExpiry: jest.fn().mockReturnValue(new Date(Date.now() + 60_000)),
  } as unknown as TokenService;
}

function makeService(
  accounts: AccountRepository,
  refreshTokens: RefreshTokenRepository,
  tokenService: TokenService = makeTokenService(),
): AuthService {
  return new AuthService(accounts, refreshTokens, AccountType.STUDENT, tokenService);
}

const noDevice = { deviceName: null, platform: null, ipAddress: null } as const;

beforeEach(() => {
  hashMock.mockReset().mockResolvedValue('argon2-hash');
  verifyMock.mockReset().mockResolvedValue(true);
});

describe('AuthService', () => {
  describe('register', () => {
    it('hashes the password, creates the account, and returns a token pair', async () => {
      const accounts = makeAccountRepository();
      const refreshTokens = makeRefreshTokenRepository();
      const service = makeService(accounts, refreshTokens);

      const result = await service.register({
        email: 'new@b.com',
        phoneNumber: null,
        password: 'password123',
        ...noDevice,
      });

      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'plain-refresh' });
      expect(hashMock).toHaveBeenCalledWith('password123');
      expect(accounts.create).toHaveBeenCalledWith({
        email: 'new@b.com',
        phoneNumber: null,
        passwordHash: 'argon2-hash',
      });
      expect(refreshTokens.create).toHaveBeenCalledTimes(1);
    });

    it('throws ACCOUNT_EXISTS (409) when the email already exists', async () => {
      const accounts = makeAccountRepository({
        findByEmail: jest.fn().mockResolvedValue(makeAccount()),
      });
      const service = makeService(accounts, makeRefreshTokenRepository());

      await expect(
        service.register({
          email: 'taken@b.com',
          phoneNumber: null,
          password: 'password123',
          ...noDevice,
        }),
      ).rejects.toMatchObject({ code: ERROR_CODE.ACCOUNT_EXISTS, status: 409 });
      expect(accounts.create).not.toHaveBeenCalled();
    });

    it('throws ACCOUNT_EXISTS when the phone already exists', async () => {
      const accounts = makeAccountRepository({
        findByPhone: jest.fn().mockResolvedValue(makeAccount()),
      });
      const service = makeService(accounts, makeRefreshTokenRepository());

      await expect(
        service.register({
          email: null,
          phoneNumber: '+998901234567',
          password: 'password123',
          ...noDevice,
        }),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('login', () => {
    it('returns tokens when the password verifies', async () => {
      const accounts = makeAccountRepository({
        findByEmail: jest.fn().mockResolvedValue(makeAccount({ passwordHash: 'stored' })),
      });
      const refreshTokens = makeRefreshTokenRepository();
      const service = makeService(accounts, refreshTokens);

      const result = await service.login({
        email: 'a@b.com',
        phoneNumber: null,
        password: 'password123',
        ...noDevice,
      });

      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'plain-refresh' });
      expect(verifyMock).toHaveBeenCalledWith('stored', 'password123');
      expect(refreshTokens.create).toHaveBeenCalledTimes(1);
    });

    it('throws INVALID_CREDENTIALS (401) when the account is not found', async () => {
      const service = makeService(makeAccountRepository(), makeRefreshTokenRepository());

      await expect(
        service.login({
          email: 'missing@b.com',
          phoneNumber: null,
          password: 'password123',
          ...noDevice,
        }),
      ).rejects.toMatchObject({ code: ERROR_CODE.INVALID_CREDENTIALS, status: 401 });
      expect(verifyMock).not.toHaveBeenCalled();
    });

    it('throws INVALID_CREDENTIALS for an OAuth-only account (no password hash)', async () => {
      const accounts = makeAccountRepository({
        findByEmail: jest.fn().mockResolvedValue(makeAccount({ passwordHash: null })),
      });
      const service = makeService(accounts, makeRefreshTokenRepository());

      await expect(
        service.login({
          email: 'a@b.com',
          phoneNumber: null,
          password: 'password123',
          ...noDevice,
        }),
      ).rejects.toMatchObject({ code: ERROR_CODE.INVALID_CREDENTIALS });
      expect(verifyMock).not.toHaveBeenCalled();
    });

    it('throws INVALID_CREDENTIALS when the password does not match', async () => {
      const accounts = makeAccountRepository({
        findByEmail: jest.fn().mockResolvedValue(makeAccount({ passwordHash: 'stored' })),
      });
      const service = makeService(accounts, makeRefreshTokenRepository());
      verifyMock.mockResolvedValue(false);

      await expect(
        service.login({ email: 'a@b.com', phoneNumber: null, password: 'wrong', ...noDevice }),
      ).rejects.toMatchObject({ code: ERROR_CODE.INVALID_CREDENTIALS });
    });
  });

  describe('refresh', () => {
    it('rotates the active session and returns a new token pair', async () => {
      const session: RefreshToken = {
        id: 'rt-1',
        accountId: 'acc-9',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      };
      const refreshTokens = makeRefreshTokenRepository({
        findActiveByHash: jest.fn().mockResolvedValue(session),
      });
      const service = makeService(makeAccountRepository(), refreshTokens);

      const result = await service.refresh({ refreshToken: 'old-plain', ...noDevice });

      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'plain-refresh' });
      expect(refreshTokens.findActiveByHash).toHaveBeenCalledWith('hash:old-plain');
      expect(refreshTokens.rotate).toHaveBeenCalledTimes(1);
      const [currentTokenId, next] = (refreshTokens.rotate as jest.Mock).mock.calls[0];
      expect(currentTokenId).toBe('rt-1');
      expect(next).toMatchObject({ accountId: 'acc-9', tokenHash: 'hash:plain-refresh' });
    });

    it('throws INVALID_REFRESH_TOKEN (401) when no active session matches', async () => {
      const service = makeService(makeAccountRepository(), makeRefreshTokenRepository());

      await expect(service.refresh({ refreshToken: 'nope', ...noDevice })).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_REFRESH_TOKEN,
        status: 401,
      });
    });
  });

  describe('logout', () => {
    it('revokes the hashed token and resolves (idempotent)', async () => {
      const refreshTokens = makeRefreshTokenRepository();
      const service = makeService(makeAccountRepository(), refreshTokens);

      await expect(service.logout({ refreshToken: 'plain' })).resolves.toBeUndefined();
      expect(refreshTokens.revoke).toHaveBeenCalledWith('hash:plain');
    });
  });
});
