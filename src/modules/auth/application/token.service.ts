import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { JwtPayload } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Token strategy (D2). Access tokens are stateless JWTs signed with JWT_ACCESS_SECRET
 * (secret + expiry configured on the JwtModule). Refresh tokens are opaque random strings;
 * only their deterministic SHA-256 hash is stored, so they can be looked up but not reversed.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccessToken(accountId: string, type: AccountType): Promise<string> {
    const payload: JwtPayload = { sub: accountId, type };
    return this.jwt.signAsync(payload);
  }

  /** New opaque refresh token handed to the client (never stored in this form). */
  generateRefreshToken(): string {
    return randomBytes(32).toString('hex');
  }

  /** Deterministic hash of a refresh token — the value stored and looked up. */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Sliding expiry: now + JWT_REFRESH_TTL. */
  refreshTokenExpiry(): Date {
    const ttl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    return new Date(Date.now() + this.parseDurationMs(ttl));
  }

  private parseDurationMs(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (match === null) {
      throw new AppException(ERROR_CODE.INTERNAL_ERROR, 500, 'JWT_REFRESH_TTL formati noto‘g‘ri');
    }
    return Number(match[1]) * DURATION_UNIT_MS[match[2]];
  }
}
