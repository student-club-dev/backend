import { Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { ACCOUNT_REPOSITORY, ACCOUNT_TYPE, AccountRepository } from '../domain/account.repository';
import { Account } from '../domain/entities/account.entity';
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
  ) {}

  async register(input: RegisterInput): Promise<AuthTokens> {
    await this.ensureIdentifiersAvailable(input.email, input.phoneNumber);
    const passwordHash = await hash(input.password);
    const account = await this.accounts.create({
      email: input.email,
      phoneNumber: input.phoneNumber,
      passwordHash,
    });
    return this.issueSession(account.id, input);
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
    return this.issueSession(account.id, input);
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
