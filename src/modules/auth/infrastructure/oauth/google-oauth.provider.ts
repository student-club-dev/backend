import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { AuthProvider } from '../../../../common/enums/auth-provider.enum';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { OAuthIdentity, OAuthProvider } from '../../domain/oauth/oauth-provider';

/**
 * Google OAuth provider. `verifyIdToken` checks the token's signature, issuer, expiry AND
 * audience (matched against ANY configured client id) in one call, then we extract the identity.
 * Google is used ONLY to prove identity; the backend stays the source of truth (no Google session).
 * More client ids (student apps, web, …) are added via env only — no code change.
 */
@Injectable()
export class GoogleOAuthProvider implements OAuthProvider {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService<Env, true>) {}

  async verify(idToken: string): Promise<OAuthIdentity> {
    const payload = await this.verifyToken(idToken, this.allowedClientIds());
    if (payload.sub === undefined || payload.sub === '') {
      throw this.invalidToken();
    }

    return {
      provider: AuthProvider.GOOGLE,
      providerAccountId: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified ?? false,
      firstName: payload.given_name ?? null,
      lastName: payload.family_name ?? null,
      avatarUrl: payload.picture ?? null,
    };
  }

  /**
   * Accepted Google client ids (Business/Student × Android/iOS/web), comma-separated in
   * GOOGLE_ALLOWED_CLIENT_IDS. A token is accepted when its `aud` matches any of them.
   */
  private allowedClientIds(): string[] {
    const raw = this.config.get('GOOGLE_ALLOWED_CLIENT_IDS', { infer: true }) ?? '';
    const ids = raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (ids.length === 0) {
      throw new AppException(
        ERROR_CODE.INTERNAL_ERROR,
        500,
        'GOOGLE_ALLOWED_CLIENT_IDS sozlanmagan',
      );
    }
    return ids;
  }

  private async verifyToken(idToken: string, audience: string[]): Promise<TokenPayload> {
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (payload === undefined) {
        throw this.invalidToken();
      }
      return payload;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw this.invalidToken();
    }
  }

  private invalidToken(): AppException {
    return AppException.unauthorized('Google token yaroqsiz', ERROR_CODE.INVALID_OAUTH_TOKEN);
  }
}
