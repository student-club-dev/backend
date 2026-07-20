import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { AuthProvider } from '../../../../common/enums/auth-provider.enum';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { OAuthIdentity, OAuthProvider } from '../../domain/oauth/oauth-provider';

/**
 * Google OAuth provider. Verifies the client's Google ID token — signature AND audience are
 * checked by `verifyIdToken` when `audience` is passed — then extracts the identity. Google is
 * used ONLY to prove identity; the backend stays the source of truth (no Google session).
 */
@Injectable()
export class GoogleOAuthProvider implements OAuthProvider {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService<Env, true>) {}

  async verify(idToken: string): Promise<OAuthIdentity> {
    const audience = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    if (audience === undefined || audience === '') {
      throw new AppException(
        ERROR_CODE.INTERNAL_ERROR,
        500,
        'GOOGLE_CLIENT_ID sozlanmagan',
      );
    }

    const payload = await this.verifyToken(idToken, audience);
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

  private async verifyToken(idToken: string, audience: string): Promise<TokenPayload> {
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
