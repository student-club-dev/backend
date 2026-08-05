import { Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { AuthProvider } from '../../../common/enums/auth-provider.enum';
import { ACCOUNT_REPOSITORY, ACCOUNT_TYPE, AccountRepository } from '../domain/account.repository';
import { AccountStatus } from '../domain/enums/account-status.enum';
import { Account } from '../domain/entities/account.entity';
import { RefreshTokenSession } from '../domain/entities/refresh-token.entity';
import {
  OAUTH_ACCOUNT_REPOSITORY,
  OAuthAccountRepository,
} from '../domain/oauth-account.repository';
import {
  OAUTH_PROVIDER_REGISTRY,
  OAuthProvider,
  OAuthProviderRegistry,
} from '../domain/oauth/oauth-provider';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
} from '../domain/refresh-token.repository';
import {
  AuthTokens,
  DeviceContext,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from './auth.io';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

/**
 * Shared credential-auth core (D6). One instance is wired per account type: the module
 * binds the matching account/refresh-token repositories and the ACCOUNT_TYPE value, so the
 * same class serves both students and business owners without copy-paste.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(ACCOUNT_TYPE) private readonly accountType: AccountType,
    private readonly tokenService: TokenService,
    @Inject(OAUTH_ACCOUNT_REPOSITORY) private readonly oauthAccounts: OAuthAccountRepository,
    @Inject(OAUTH_PROVIDER_REGISTRY) private readonly oauthProviders: OAuthProviderRegistry,
    private readonly otpService: OtpService,
  ) {}

  /**
   * Credential registration.
   *
   * ⚠️ The OTP gate below is the difference between "you registered your number" and "you claimed
   * somebody's number". `phoneNumber` is unique, so an account created for a number the caller does
   * not own **permanently locks its real owner out of registering** — and until this existed, the
   * request also handed back a working session for that number.
   *
   * The gate applies only when a phone is supplied, and that is D1 rather than a compromise: phone
   * is **not** required to create an account — email, Google and Apple are all complete signups on
   * their own, and verification is asked for later, at the actions where trust matters. An
   * email-only registration therefore has nothing to prove here.
   *
   * There is deliberately no flag to turn this off. A phone number written without proof is the
   * vulnerability itself, so an environment variable that disables the check would only be a way to
   * leave it open — and a switch someone forgets to flip.
   */
  async register(input: RegisterInput): Promise<AuthTokens> {
    await this.ensureIdentifiersAvailable(input.email, input.phoneNumber);

    const phoneVerified = await this.verifyRegistrationPhone(input);
    const passwordHash = await hash(input.password);
    const account = await this.accounts.create({
      email: input.email,
      phoneNumber: input.phoneNumber,
      passwordHash,
      phoneVerified,
    });
    return this.issueSession(account.id, input);
  }

  /**
   * Proves the phone, or refuses the registration. Returns whether a phone ended up verified.
   *
   * Runs **after** the uniqueness check and **before** the row is written, so a code is never
   * burned for a registration that was going to fail anyway, and a row is never written for a code
   * that did not check out.
   */
  private async verifyRegistrationPhone(input: RegisterInput): Promise<boolean> {
    if (input.phoneNumber === null) {
      return false;
    }
    if (input.otpCode === null) {
      throw AppException.validation({ otpCode: 'Telefon raqamni tasdiqlash kodi kerak' });
    }
    await this.otpService.verifyRegistration(input.phoneNumber, input.otpCode);
    return true;
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const account = await this.findByIdentifier(input.email, input.phoneNumber);
    // Same error for missing account, OAuth-only account, and wrong password — no enumeration.
    if (account === null || account.passwordHash === null) {
      throw this.invalidCredentials();
    }
    const passwordMatches = await verify(account.passwordHash, input.password);
    if (!passwordMatches) {
      throw this.invalidCredentials();
    }
    // Ban gate (Faza 3) — checked only after the credentials verify, so a banned account is never
    // revealed to someone who does not already hold the correct password (no enumeration).
    this.assertActive(account);
    return this.issueSession(account.id, input);
  }

  /**
   * OAuth login (D4). Verifies the provider ID token, resolves the account within THIS type's
   * tables — link by provider id, else link by verified email, else create — and issues a session.
   */
  async oauthLogin(
    provider: AuthProvider,
    idToken: string,
    device: DeviceContext,
  ): Promise<AuthTokens> {
    const identity = await this.resolveProvider(provider).verify(idToken);

    // (a) Known provider identity → log into the linked account.
    const linkedId = await this.oauthAccounts.findAccountIdByProvider(
      provider,
      identity.providerAccountId,
    );
    if (linkedId !== null) {
      // Ban gate (Faza 3): a banned account must not obtain a session via a linked OAuth identity.
      const linked = await this.accounts.findById(linkedId);
      if (linked !== null) {
        this.assertActive(linked);
      }
      return this.issueSession(linkedId, device);
    }

    // (b) Verified email matches an existing account → attach this identity and log in.
    if (identity.email !== null && identity.emailVerified) {
      const existing = await this.accounts.findByEmail(identity.email);
      if (existing !== null) {
        // Ban gate (Faza 3): block a banned account before linking / issuing a session.
        this.assertActive(existing);
        await this.oauthAccounts.link(existing.id, provider, identity.providerAccountId);
        return this.issueSession(existing.id, device);
      }
    }

    // (c) New person → create an account from the identity and link it.
    const account = await this.accounts.createFromOAuth({
      email: identity.email,
      emailVerified: identity.emailVerified,
      firstName: identity.firstName,
      lastName: identity.lastName,
      avatarUrl: identity.avatarUrl,
    });
    await this.oauthAccounts.link(account.id, provider, identity.providerAccountId);
    return this.issueSession(account.id, device);
  }

  async refresh(input: RefreshInput): Promise<AuthTokens> {
    const tokenHash = this.tokenService.hashRefreshToken(input.refreshToken);
    const session = await this.refreshTokens.findActiveByHash(tokenHash);
    if (session === null) {
      throw AppException.unauthorized(
        'Sessiya yaroqsiz, qaytadan kiring',
        ERROR_CODE.INVALID_REFRESH_TOKEN,
      );
    }
    // Ban gate (Faza 3). A ban revokes the account's refresh tokens, so this is a second line of
    // defence: even a still-active token cannot refresh once the account is no longer ACTIVE.
    const account = await this.accounts.findById(session.accountId);
    if (account !== null) {
      this.assertActive(account);
    }
    const accessToken = await this.tokenService.signAccessToken(
      session.accountId,
      this.accountType,
    );
    const refreshToken = this.tokenService.generateRefreshToken();
    await this.refreshTokens.rotate(session.id, {
      accountId: session.accountId,
      tokenHash: this.tokenService.hashRefreshToken(refreshToken),
      expiresAt: this.tokenService.refreshTokenExpiry(),
      deviceName: input.deviceName,
      platform: input.platform,
      ipAddress: input.ipAddress,
      lastUsedAt: new Date(),
    });
    return { accessToken, refreshToken };
  }

  async logout(input: LogoutInput): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(input.refreshToken);
    await this.refreshTokens.revoke(tokenHash);
  }

  /** The account's active device sessions (D3). Never exposes the token hash. */
  listSessions(accountId: string): Promise<RefreshTokenSession[]> {
    return this.refreshTokens.listActiveByAccount(accountId);
  }

  /**
   * Revokes one of the account's own device sessions (D3). Enforces ownership — a session that is
   * not the caller's (or already gone) yields SESSION_NOT_FOUND rather than revoking anything.
   */
  async revokeSession(accountId: string, sessionId: string): Promise<void> {
    const existed = await this.refreshTokens.revokeById(sessionId, accountId);
    if (!existed) {
      throw AppException.notFound(ERROR_CODE.SESSION_NOT_FOUND, 'Sessiya topilmadi');
    }
  }

  /** Revokes all of the account's device sessions ("logout all devices" — D3). */
  logoutAll(accountId: string): Promise<void> {
    return this.refreshTokens.revokeAllByAccount(accountId);
  }

  /**
   * Sets or changes the account password (D9). First-time set (OAuth-only account with no password)
   * needs no current password and does NOT revoke sessions. Changing an existing password requires
   * the correct current password and revokes all refresh tokens (D3 — re-login everywhere).
   */
  async setPassword(
    accountId: string,
    currentPassword: string | null,
    newPassword: string,
  ): Promise<void> {
    const account = await this.accounts.findById(accountId);
    if (account === null) {
      throw AppException.unauthorized();
    }

    const existingHash = account.passwordHash;
    const isChange = existingHash !== null;
    if (existingHash !== null) {
      if (currentPassword === null) {
        throw this.invalidCredentials();
      }
      const matches = await verify(existingHash, currentPassword);
      if (!matches) {
        throw this.invalidCredentials();
      }
    }

    const passwordHash = await hash(newPassword);
    await this.accounts.setPassword(accountId, passwordHash);

    if (isChange) {
      await this.refreshTokens.revokeAllByAccount(accountId);
    }
  }

  /**
   * Password-reset request (D5). Sends a password-reset OTP only when an account with this phone
   * exists AND its phone is verified. Always resolves the same way — it never reveals whether the
   * account exists or whether the phone is verified (anti-enumeration).
   */
  async forgotPassword(phoneNumber: string): Promise<void> {
    const account = await this.accounts.findByPhone(phoneNumber);
    if (account !== null && account.phoneVerified) {
      await this.otpService.request(phoneNumber, 'password_reset');
    }
  }

  /**
   * Password reset (D5). Verifies the password-reset OTP (throws OTP_* on failure), then sets the
   * new password and revokes all refresh tokens (D3 — force re-login everywhere).
   */
  async resetPassword(phoneNumber: string, code: string, newPassword: string): Promise<void> {
    const e164 = await this.otpService.verifyPasswordReset(phoneNumber, code);
    const account = await this.accounts.findByPhone(e164);
    if (account === null) {
      throw this.invalidCredentials();
    }
    const passwordHash = await hash(newPassword);
    await this.accounts.setPassword(account.id, passwordHash);
    await this.refreshTokens.revokeAllByAccount(account.id);
  }

  private async issueSession(accountId: string, device: DeviceContext): Promise<AuthTokens> {
    const accessToken = await this.tokenService.signAccessToken(accountId, this.accountType);
    const refreshToken = this.tokenService.generateRefreshToken();
    await this.refreshTokens.create({
      accountId,
      tokenHash: this.tokenService.hashRefreshToken(refreshToken),
      expiresAt: this.tokenService.refreshTokenExpiry(),
      deviceName: device.deviceName,
      platform: device.platform,
      ipAddress: device.ipAddress,
      lastUsedAt: null,
    });
    return { accessToken, refreshToken };
  }

  private async ensureIdentifiersAvailable(
    email: string | null,
    phoneNumber: string | null,
  ): Promise<void> {
    if (email !== null && (await this.accounts.findByEmail(email)) !== null) {
      throw this.accountExists();
    }
    if (phoneNumber !== null && (await this.accounts.findByPhone(phoneNumber)) !== null) {
      throw this.accountExists();
    }
  }

  private async findByIdentifier(
    email: string | null,
    phoneNumber: string | null,
  ): Promise<Account | null> {
    if (email !== null) {
      const byEmail = await this.accounts.findByEmail(email);
      if (byEmail !== null) {
        return byEmail;
      }
    }
    if (phoneNumber !== null) {
      return this.accounts.findByPhone(phoneNumber);
    }
    return null;
  }

  private resolveProvider(provider: AuthProvider): OAuthProvider {
    const impl = this.oauthProviders.get(provider);
    if (impl === undefined) {
      throw new AppException(ERROR_CODE.INTERNAL_ERROR, 500, 'OAuth provayder sozlanmagan');
    }
    return impl;
  }

  /** Rejects a non-ACTIVE (banned) account with 403 ACCOUNT_BANNED. No-op for ACTIVE accounts. */
  private assertActive(account: Account): void {
    if (account.status !== AccountStatus.ACTIVE) {
      throw new AppException(ERROR_CODE.ACCOUNT_BANNED, 403, 'Hisobingiz bloklangan');
    }
  }

  private invalidCredentials(): AppException {
    return AppException.unauthorized('Login yoki parol xato', ERROR_CODE.INVALID_CREDENTIALS);
  }

  private accountExists(): AppException {
    return AppException.conflict(
      ERROR_CODE.ACCOUNT_EXISTS,
      'Bu email yoki telefon bilan hisob allaqachon mavjud',
    );
  }
}
