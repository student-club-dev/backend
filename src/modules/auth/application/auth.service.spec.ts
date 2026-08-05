import { hash, verify } from '@node-rs/argon2';
import { AccountType } from '../../../common/enums/account-type.enum';
import { AuthProvider } from '../../../common/enums/auth-provider.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { AccountRepository } from '../domain/account.repository';
import { AccountStatus } from '../domain/enums/account-status.enum';
import { Account } from '../domain/entities/account.entity';
import { RefreshToken } from '../domain/entities/refresh-token.entity';
import { OAuthAccountRepository } from '../domain/oauth-account.repository';
import {
  OAuthIdentity,
  OAuthProvider,
  OAuthProviderRegistry,
} from '../domain/oauth/oauth-provider';
import { RefreshTokenRepository } from '../domain/refresh-token.repository';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
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
    phoneVerified: false,
    passwordHash: 'stored-hash',
    status: AccountStatus.ACTIVE,
    ...overrides,
  };
}

function makeAccountRepository(overrides: Partial<AccountRepository> = {}): AccountRepository {
  return {
    findByEmail: jest.fn().mockResolvedValue(null),
    findByPhone: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(makeAccount()),
    createFromOAuth: jest.fn().mockResolvedValue(makeAccount({ id: 'acc-new' })),
    markPhoneVerified: jest.fn().mockResolvedValue(undefined),
    setPassword: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeIdentity(overrides: Partial<OAuthIdentity> = {}): OAuthIdentity {
  return {
    provider: AuthProvider.GOOGLE,
    providerAccountId: 'google-sub-1',
    email: 'oauth@b.com',
    emailVerified: true,
    firstName: 'Ali',
    lastName: 'Valiev',
    avatarUrl: null,
    ...overrides,
  };
}

function makeOAuthProvider(identity: OAuthIdentity = makeIdentity()): OAuthProvider {
  return { verify: jest.fn().mockResolvedValue(identity) };
}

function makeRegistry(provider: OAuthProvider = makeOAuthProvider()): OAuthProviderRegistry {
  return new Map<AuthProvider, OAuthProvider>([[AuthProvider.GOOGLE, provider]]);
}

function makeOAuthAccountRepository(
  overrides: Partial<OAuthAccountRepository> = {},
): OAuthAccountRepository {
  return {
    findAccountIdByProvider: jest.fn().mockResolvedValue(null),
    link: jest.fn().mockResolvedValue(undefined),
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
    listActiveByAccount: jest.fn().mockResolvedValue([]),
    revokeById: jest.fn().mockResolvedValue(true),
    revokeAllByAccount: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeOtpService(overrides: Partial<OtpService> = {}): OtpService {
  return {
    request: jest
      .fn()
      .mockResolvedValue({ sent: true, expiresInSeconds: 300, resendCooldownSeconds: 60 }),
    verify: jest.fn().mockResolvedValue(undefined),
    verifyPasswordReset: jest.fn().mockResolvedValue('+998901234567'),
    verifyRegistration: jest.fn().mockResolvedValue('+998901234567'),
    ...overrides,
  } as unknown as OtpService;
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
  oauthAccounts: OAuthAccountRepository = makeOAuthAccountRepository(),
  registry: OAuthProviderRegistry = makeRegistry(),
  otpService: OtpService = makeOtpService(),
): AuthService {
  return new AuthService(
    accounts,
    refreshTokens,
    AccountType.STUDENT,
    tokenService,
    oauthAccounts,
    registry,
    otpService,
  );
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
        otpCode: null,
        ...noDevice,
      });

      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'plain-refresh' });
      expect(hashMock).toHaveBeenCalledWith('password123');
      expect(accounts.create).toHaveBeenCalledWith({
        email: 'new@b.com',
        phoneNumber: null,
        passwordHash: 'argon2-hash',
        phoneVerified: false,
      });
      expect(refreshTokens.create).toHaveBeenCalledTimes(1);
    });

    /**
     * ⚠️ The vulnerability this gate closes: `phoneNumber` is unique, so an account created for a
     * number the caller does not own **permanently locks out its real owner** — and the same
     * request handed back a working session for it. Anyone could claim any number by typing it.
     */
    describe('the phone-number gate', () => {
      const withPhone = {
        email: null,
        phoneNumber: '+998901234567',
        password: 'password123',
        ...noDevice,
      };

      function gated(otpService: OtpService, accounts = makeAccountRepository()) {
        return {
          accounts,
          service: makeService(
            accounts,
            makeRefreshTokenRepository(),
            makeTokenService(),
            makeOAuthAccountRepository(),
            makeRegistry(),
            otpService,
          ),
        };
      }

      it('refuses a phone registration with no code, and writes nothing', async () => {
        const { service, accounts } = gated(makeOtpService());

        await expect(service.register({ ...withPhone, otpCode: null })).rejects.toMatchObject({
          code: ERROR_CODE.VALIDATION_ERROR,
          status: 422,
        });
        expect(accounts.create).not.toHaveBeenCalled();
      });

      it('refuses a wrong code, and writes nothing', async () => {
        const otpService = makeOtpService();
        (otpService.verifyRegistration as jest.Mock).mockRejectedValue(
          new AppException(ERROR_CODE.OTP_INVALID, 422, 'Kod noto‘g‘ri'),
        );
        const { service, accounts } = gated(otpService);

        await expect(service.register({ ...withPhone, otpCode: '000000' })).rejects.toMatchObject({
          code: ERROR_CODE.OTP_INVALID,
        });
        expect(accounts.create).not.toHaveBeenCalled();
      });

      it('creates the account already verified when the code checks out', async () => {
        const { service, accounts } = gated(makeOtpService());

        await service.register({ ...withPhone, otpCode: '123456' });

        expect(accounts.create).toHaveBeenCalledWith(
          expect.objectContaining({ phoneNumber: '+998901234567', phoneVerified: true }),
        );
      });

      // An email-only signup has no number to prove, and nobody else is competing for that
      // identifier the way they compete for a phone number.
      it('leaves an email-only registration alone', async () => {
        const otpService = makeOtpService();
        const { service, accounts } = gated(otpService);

        await service.register({
          email: 'new@b.com',
          phoneNumber: null,
          password: 'password123',
          otpCode: null,
          ...noDevice,
        });

        expect(otpService.verifyRegistration).not.toHaveBeenCalled();
        expect(accounts.create).toHaveBeenCalledWith(
          expect.objectContaining({ phoneVerified: false }),
        );
      });

      /** The proof is recorded on the row, so nothing has to re-check it later. */
      it('marks the phone verified on the row it creates', async () => {
        const accounts = makeAccountRepository();
        const service = makeService(accounts, makeRefreshTokenRepository());

        await service.register({ ...withPhone, otpCode: '123456' });

        expect(accounts.create).toHaveBeenCalledWith(
          expect.objectContaining({ phoneVerified: true }),
        );
      });
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
          otpCode: null,
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
          otpCode: null,
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

    it('throws ACCOUNT_BANNED (403) for a BANNED account whose password verifies (no session)', async () => {
      const accounts = makeAccountRepository({
        findByEmail: jest
          .fn()
          .mockResolvedValue(makeAccount({ passwordHash: 'stored', status: AccountStatus.BANNED })),
      });
      const refreshTokens = makeRefreshTokenRepository();
      const service = makeService(accounts, refreshTokens);

      await expect(
        service.login({
          email: 'a@b.com',
          phoneNumber: null,
          password: 'password123',
          ...noDevice,
        }),
      ).rejects.toMatchObject({ code: ERROR_CODE.ACCOUNT_BANNED, status: 403 });
      expect(verifyMock).toHaveBeenCalled();
      expect(refreshTokens.create).not.toHaveBeenCalled();
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

    it('throws ACCOUNT_BANNED (403) when the session belongs to a BANNED account (no rotation)', async () => {
      const session: RefreshToken = {
        id: 'rt-1',
        accountId: 'acc-9',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      };
      const accounts = makeAccountRepository({
        findById: jest.fn().mockResolvedValue(makeAccount({ status: AccountStatus.BANNED })),
      });
      const refreshTokens = makeRefreshTokenRepository({
        findActiveByHash: jest.fn().mockResolvedValue(session),
      });
      const service = makeService(accounts, refreshTokens);

      await expect(
        service.refresh({ refreshToken: 'old-plain', ...noDevice }),
      ).rejects.toMatchObject({ code: ERROR_CODE.ACCOUNT_BANNED, status: 403 });
      expect(refreshTokens.rotate).not.toHaveBeenCalled();
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

  describe('oauthLogin', () => {
    it('logs into the linked account when the provider identity is already known (branch a)', async () => {
      const accounts = makeAccountRepository();
      const refreshTokens = makeRefreshTokenRepository();
      const oauthAccounts = makeOAuthAccountRepository({
        findAccountIdByProvider: jest.fn().mockResolvedValue('acc-linked'),
      });
      const provider = makeOAuthProvider();
      const service = makeService(
        accounts,
        refreshTokens,
        makeTokenService(),
        oauthAccounts,
        makeRegistry(provider),
      );

      const result = await service.oauthLogin(AuthProvider.GOOGLE, 'id-token', noDevice);

      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'plain-refresh' });
      expect(provider.verify).toHaveBeenCalledWith('id-token');
      expect(oauthAccounts.findAccountIdByProvider).toHaveBeenCalledWith(
        AuthProvider.GOOGLE,
        'google-sub-1',
      );
      expect(oauthAccounts.link).not.toHaveBeenCalled();
      expect(accounts.createFromOAuth).not.toHaveBeenCalled();
      expect(refreshTokens.create).toHaveBeenCalledTimes(1);
    });

    it('links to an existing account by verified email, then logs in (branch b)', async () => {
      const accounts = makeAccountRepository({
        findByEmail: jest.fn().mockResolvedValue(makeAccount({ id: 'acc-email' })),
      });
      const refreshTokens = makeRefreshTokenRepository();
      const oauthAccounts = makeOAuthAccountRepository();
      const service = makeService(
        accounts,
        refreshTokens,
        makeTokenService(),
        oauthAccounts,
        makeRegistry(),
      );

      const result = await service.oauthLogin(AuthProvider.GOOGLE, 'id-token', noDevice);

      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'plain-refresh' });
      expect(accounts.findByEmail).toHaveBeenCalledWith('oauth@b.com');
      expect(oauthAccounts.link).toHaveBeenCalledWith(
        'acc-email',
        AuthProvider.GOOGLE,
        'google-sub-1',
      );
      expect(accounts.createFromOAuth).not.toHaveBeenCalled();
      expect(refreshTokens.create).toHaveBeenCalledTimes(1);
    });

    it('does not link on an unverified email — creates a new account instead', async () => {
      const accounts = makeAccountRepository({
        findByEmail: jest.fn().mockResolvedValue(makeAccount({ id: 'acc-email' })),
      });
      const oauthAccounts = makeOAuthAccountRepository();
      const provider = makeOAuthProvider(makeIdentity({ emailVerified: false }));
      const service = makeService(
        accounts,
        makeRefreshTokenRepository(),
        makeTokenService(),
        oauthAccounts,
        makeRegistry(provider),
      );

      await service.oauthLogin(AuthProvider.GOOGLE, 'id-token', noDevice);

      expect(accounts.findByEmail).not.toHaveBeenCalled();
      expect(accounts.createFromOAuth).toHaveBeenCalledTimes(1);
      expect(oauthAccounts.link).toHaveBeenCalledWith(
        'acc-new',
        AuthProvider.GOOGLE,
        'google-sub-1',
      );
    });

    it('creates a new account from the identity and links it (branch c)', async () => {
      const accounts = makeAccountRepository();
      const refreshTokens = makeRefreshTokenRepository();
      const oauthAccounts = makeOAuthAccountRepository();
      const service = makeService(
        accounts,
        refreshTokens,
        makeTokenService(),
        oauthAccounts,
        makeRegistry(),
      );

      const result = await service.oauthLogin(AuthProvider.GOOGLE, 'id-token', noDevice);

      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'plain-refresh' });
      expect(accounts.createFromOAuth).toHaveBeenCalledWith({
        email: 'oauth@b.com',
        emailVerified: true,
        firstName: 'Ali',
        lastName: 'Valiev',
        avatarUrl: null,
      });
      expect(oauthAccounts.link).toHaveBeenCalledWith(
        'acc-new',
        AuthProvider.GOOGLE,
        'google-sub-1',
      );
      expect(refreshTokens.create).toHaveBeenCalledTimes(1);
    });

    it('surfaces the provider error (e.g. an invalid Apple token) without touching repositories', async () => {
      const accounts = makeAccountRepository();
      const oauthAccounts = makeOAuthAccountRepository();
      const failing: OAuthProvider = {
        verify: jest
          .fn()
          .mockRejectedValue(
            new AppException(ERROR_CODE.INVALID_OAUTH_TOKEN, 401, 'Apple token yaroqsiz'),
          ),
      };
      const registry: OAuthProviderRegistry = new Map([[AuthProvider.APPLE, failing]]);
      const service = makeService(
        accounts,
        makeRefreshTokenRepository(),
        makeTokenService(),
        oauthAccounts,
        registry,
      );

      await expect(
        service.oauthLogin(AuthProvider.APPLE, 'id-token', noDevice),
      ).rejects.toMatchObject({ code: ERROR_CODE.INVALID_OAUTH_TOKEN, status: 401 });
      expect(oauthAccounts.findAccountIdByProvider).not.toHaveBeenCalled();
      expect(accounts.createFromOAuth).not.toHaveBeenCalled();
    });
  });

  describe('listSessions', () => {
    it('returns the account’s active sessions from the repository', async () => {
      const sessions = [
        {
          id: 's1',
          deviceName: 'iPhone 15',
          platform: 'iOS',
          ipAddress: null,
          lastUsedAt: null,
          createdAt: new Date(),
        },
      ];
      const refreshTokens = makeRefreshTokenRepository({
        listActiveByAccount: jest.fn().mockResolvedValue(sessions),
      });
      const service = makeService(makeAccountRepository(), refreshTokens);

      await expect(service.listSessions('acc-1')).resolves.toBe(sessions);
      expect(refreshTokens.listActiveByAccount).toHaveBeenCalledWith('acc-1');
    });
  });

  describe('revokeSession', () => {
    it('revokes the caller’s own session', async () => {
      const refreshTokens = makeRefreshTokenRepository({
        revokeById: jest.fn().mockResolvedValue(true),
      });
      const service = makeService(makeAccountRepository(), refreshTokens);

      await expect(service.revokeSession('acc-1', 'sess-1')).resolves.toBeUndefined();
      expect(refreshTokens.revokeById).toHaveBeenCalledWith('sess-1', 'acc-1');
    });

    it('throws SESSION_NOT_FOUND (404) when the session is not the caller’s', async () => {
      const refreshTokens = makeRefreshTokenRepository({
        revokeById: jest.fn().mockResolvedValue(false),
      });
      const service = makeService(makeAccountRepository(), refreshTokens);

      await expect(service.revokeSession('acc-1', 'other-session')).rejects.toMatchObject({
        code: ERROR_CODE.SESSION_NOT_FOUND,
        status: 404,
      });
    });
  });

  describe('logoutAll', () => {
    it('revokes all of the account’s sessions', async () => {
      const refreshTokens = makeRefreshTokenRepository();
      const service = makeService(makeAccountRepository(), refreshTokens);

      await expect(service.logoutAll('acc-1')).resolves.toBeUndefined();
      expect(refreshTokens.revokeAllByAccount).toHaveBeenCalledWith('acc-1');
    });
  });

  describe('setPassword', () => {
    it('first-time set (OAuth-only account): no current password, no session revoke', async () => {
      const accounts = makeAccountRepository({
        findById: jest.fn().mockResolvedValue(makeAccount({ passwordHash: null })),
      });
      const refreshTokens = makeRefreshTokenRepository();
      const service = makeService(accounts, refreshTokens);

      await service.setPassword('acc-1', null, 'newpassword123');

      expect(verifyMock).not.toHaveBeenCalled();
      expect(hashMock).toHaveBeenCalledWith('newpassword123');
      expect(accounts.setPassword).toHaveBeenCalledWith('acc-1', 'argon2-hash');
      expect(refreshTokens.revokeAllByAccount).not.toHaveBeenCalled();
    });

    it('change: verifies the current password, sets the new one, revokes all sessions', async () => {
      const accounts = makeAccountRepository({
        findById: jest.fn().mockResolvedValue(makeAccount({ passwordHash: 'stored' })),
      });
      const refreshTokens = makeRefreshTokenRepository();
      const service = makeService(accounts, refreshTokens);

      await service.setPassword('acc-1', 'current-pass', 'newpassword123');

      expect(verifyMock).toHaveBeenCalledWith('stored', 'current-pass');
      expect(accounts.setPassword).toHaveBeenCalledWith('acc-1', 'argon2-hash');
      expect(refreshTokens.revokeAllByAccount).toHaveBeenCalledWith('acc-1');
    });

    it('throws INVALID_CREDENTIALS (401) when the current password is wrong', async () => {
      const accounts = makeAccountRepository({
        findById: jest.fn().mockResolvedValue(makeAccount({ passwordHash: 'stored' })),
      });
      const refreshTokens = makeRefreshTokenRepository();
      const service = makeService(accounts, refreshTokens);
      verifyMock.mockResolvedValue(false);

      await expect(service.setPassword('acc-1', 'wrong', 'newpassword123')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_CREDENTIALS,
        status: 401,
      });
      expect(accounts.setPassword).not.toHaveBeenCalled();
      expect(refreshTokens.revokeAllByAccount).not.toHaveBeenCalled();
    });

    it('throws INVALID_CREDENTIALS when changing but no current password is provided', async () => {
      const accounts = makeAccountRepository({
        findById: jest.fn().mockResolvedValue(makeAccount({ passwordHash: 'stored' })),
      });
      const service = makeService(accounts, makeRefreshTokenRepository());

      await expect(service.setPassword('acc-1', null, 'newpassword123')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_CREDENTIALS,
      });
      expect(verifyMock).not.toHaveBeenCalled();
      expect(accounts.setPassword).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('sends a password_reset OTP when the account exists and the phone is verified', async () => {
      const accounts = makeAccountRepository({
        findByPhone: jest.fn().mockResolvedValue(makeAccount({ phoneVerified: true })),
      });
      const otpService = makeOtpService();
      const service = makeService(
        accounts,
        makeRefreshTokenRepository(),
        makeTokenService(),
        makeOAuthAccountRepository(),
        makeRegistry(),
        otpService,
      );

      await expect(service.forgotPassword('+998901234567')).resolves.toBeUndefined();
      expect(otpService.request).toHaveBeenCalledWith('+998901234567', 'password_reset');
    });

    it('does NOT send when the phone is unverified but still resolves (anti-enumeration)', async () => {
      const accounts = makeAccountRepository({
        findByPhone: jest.fn().mockResolvedValue(makeAccount({ phoneVerified: false })),
      });
      const otpService = makeOtpService();
      const service = makeService(
        accounts,
        makeRefreshTokenRepository(),
        makeTokenService(),
        makeOAuthAccountRepository(),
        makeRegistry(),
        otpService,
      );

      await expect(service.forgotPassword('+998901234567')).resolves.toBeUndefined();
      expect(otpService.request).not.toHaveBeenCalled();
    });

    it('does NOT send and still resolves when no account exists (anti-enumeration)', async () => {
      const accounts = makeAccountRepository();
      const otpService = makeOtpService();
      const service = makeService(
        accounts,
        makeRefreshTokenRepository(),
        makeTokenService(),
        makeOAuthAccountRepository(),
        makeRegistry(),
        otpService,
      );

      await expect(service.forgotPassword('+998901234567')).resolves.toBeUndefined();
      expect(otpService.request).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('valid OTP → sets the new password and revokes all sessions', async () => {
      const accounts = makeAccountRepository({
        findByPhone: jest.fn().mockResolvedValue(makeAccount({ id: 'acc-7', phoneVerified: true })),
      });
      const refreshTokens = makeRefreshTokenRepository();
      const otpService = makeOtpService({
        verifyPasswordReset: jest.fn().mockResolvedValue('+998901234567'),
        verifyRegistration: jest.fn().mockResolvedValue('+998901234567'),
      });
      const service = makeService(
        accounts,
        refreshTokens,
        makeTokenService(),
        makeOAuthAccountRepository(),
        makeRegistry(),
        otpService,
      );

      await service.resetPassword('+998901234567', '111111', 'newpassword123');

      expect(otpService.verifyPasswordReset).toHaveBeenCalledWith('+998901234567', '111111');
      expect(hashMock).toHaveBeenCalledWith('newpassword123');
      expect(accounts.setPassword).toHaveBeenCalledWith('acc-7', 'argon2-hash');
      expect(refreshTokens.revokeAllByAccount).toHaveBeenCalledWith('acc-7');
    });

    it('invalid OTP → surfaces the OTP error and never touches the password', async () => {
      const accounts = makeAccountRepository();
      const refreshTokens = makeRefreshTokenRepository();
      const otpService = makeOtpService({
        verifyPasswordReset: jest
          .fn()
          .mockRejectedValue(new AppException(ERROR_CODE.OTP_INVALID, 422, 'Kod noto‘g‘ri')),
      });
      const service = makeService(
        accounts,
        refreshTokens,
        makeTokenService(),
        makeOAuthAccountRepository(),
        makeRegistry(),
        otpService,
      );

      await expect(
        service.resetPassword('+998901234567', '000000', 'newpassword123'),
      ).rejects.toMatchObject({ code: ERROR_CODE.OTP_INVALID, status: 422 });
      expect(accounts.setPassword).not.toHaveBeenCalled();
      expect(refreshTokens.revokeAllByAccount).not.toHaveBeenCalled();
    });
  });
});
