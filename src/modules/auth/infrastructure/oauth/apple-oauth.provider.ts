import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AuthProvider } from '../../../../common/enums/auth-provider.enum';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { OAuthIdentity, OAuthProvider } from '../../domain/oauth/oauth-provider';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');

/**
 * Apple OAuth provider. `verify` validates the identity token against Apple's public keys (signature
 * + issuer + audience + expiry) via jose's remote JWKS — which fetches, caches and rotates the keys
 * on its own — then extracts the identity. Apple only proves identity (D4); it never returns a name
 * in the token (that comes once, in the authorization response, and the app must relay it), so
 * `firstName`/`lastName`/`avatarUrl` are always null here. Bundle ids are added via env only.
 */
@Injectable()
export class AppleOAuthProvider implements OAuthProvider {
  private readonly jwks = createRemoteJWKSet(APPLE_JWKS_URL);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async verify(idToken: string): Promise<OAuthIdentity> {
    const payload = await this.verifyToken(idToken, this.allowedClientIds());

    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (sub === '') {
      throw this.invalidToken();
    }

    return {
      provider: AuthProvider.APPLE,
      providerAccountId: sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      // Apple sends `email_verified` as a boolean or the string "true"/"false".
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      firstName: null,
      lastName: null,
      avatarUrl: null,
    };
  }

  /**
   * Accepted Apple client ids (the native apps' bundle ids + any web Services id), comma-separated
   * in APPLE_ALLOWED_CLIENT_IDS. A token is accepted when its `aud` matches any of them.
   */
  private allowedClientIds(): string[] {
    const raw = this.config.get('APPLE_ALLOWED_CLIENT_IDS', { infer: true }) ?? '';
    const ids = raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (ids.length === 0) {
      throw new AppException(
        ERROR_CODE.INTERNAL_ERROR,
        500,
        'APPLE_ALLOWED_CLIENT_IDS sozlanmagan',
      );
    }
    return ids;
  }

  private async verifyToken(idToken: string, audience: string[]): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: APPLE_ISSUER,
        audience,
      });
      return payload;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw this.invalidToken();
    }
  }

  private invalidToken(): AppException {
    return AppException.unauthorized('Apple token yaroqsiz', ERROR_CODE.INVALID_OAUTH_TOKEN);
  }
}
