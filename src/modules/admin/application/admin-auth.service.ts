import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from '@node-rs/argon2';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { Env } from '../../../config/env';
import { AdminJwtPayload, AdminPrincipal } from '../domain/admin-principal';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { AdminTokens } from './admin-auth.io';

/** A credential resolved from env for a given email. */
interface AdminCredential {
  role: AdminRole;
  passwordHash: string;
}

/**
 * Env-based admin/moderator auth (Faza 0) — NO DB table. Credentials live in env
 * (`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`, `MODERATOR_EMAIL`/`MODERATOR_PASSWORD_HASH`); passwords are
 * stored as argon2 hashes. Access tokens are signed with the SAME access secret/TTL the auth module
 * uses (`JWT_ACCESS_SECRET` / `JWT_ACCESS_TTL`), carrying `{ sub: email, type: 'admin', role }`.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Verifies env credentials and issues an admin access token. Bad creds → 401. */
  async login(email: string, password: string): Promise<AdminTokens> {
    const credential = this.resolveByEmail(email);
    // Same error for an unknown email and a wrong password — no admin enumeration.
    if (credential === null) {
      throw this.invalidCredentials();
    }
    const passwordMatches = await verify(credential.passwordHash, password);
    if (!passwordMatches) {
      throw this.invalidCredentials();
    }
    const accessToken = await this.signAccessToken(email, credential.role);
    return { accessToken };
  }

  /** The authenticated admin's own identity (`GET /admin/auth/me`). */
  me(principal: AdminPrincipal): AdminPrincipal {
    return { email: principal.email, role: principal.role };
  }

  /**
   * Maps an email to its configured role + argon2 hash, or null when it is not a configured admin.
   * A configured entry needs BOTH the email and its hash present (an email without a hash is treated
   * as unconfigured). Moderator creds are optional (single-admin setups leave them unset).
   */
  private resolveByEmail(email: string): AdminCredential | null {
    const adminEmail = this.config.get('ADMIN_EMAIL', { infer: true });
    const adminHash = this.config.get('ADMIN_PASSWORD_HASH', { infer: true });
    if (adminEmail !== undefined && adminHash !== undefined && email === adminEmail) {
      return { role: AdminRole.ADMIN, passwordHash: adminHash };
    }

    const moderatorEmail = this.config.get('MODERATOR_EMAIL', { infer: true });
    const moderatorHash = this.config.get('MODERATOR_PASSWORD_HASH', { infer: true });
    if (moderatorEmail !== undefined && moderatorHash !== undefined && email === moderatorEmail) {
      return { role: AdminRole.MODERATOR, passwordHash: moderatorHash };
    }

    return null;
  }

  private signAccessToken(email: string, role: AdminRole): Promise<string> {
    const payload: AdminJwtPayload = { sub: email, type: AccountType.ADMIN, role };
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
  }

  private invalidCredentials(): AppException {
    return AppException.unauthorized(
      'Email yoki parol noto‘g‘ri',
      ERROR_CODE.ADMIN_INVALID_CREDENTIALS,
    );
  }
}
