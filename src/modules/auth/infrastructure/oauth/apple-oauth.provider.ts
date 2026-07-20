import { Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import { OAuthIdentity, OAuthProvider } from '../../domain/oauth/oauth-provider';

/**
 * Apple OAuth provider — stub. Implements the port so Apple plugs into the same flow later
 * without touching AuthService; until then `verify` surfaces a 501 through the registry.
 */
@Injectable()
export class AppleOAuthProvider implements OAuthProvider {
  verify(_idToken: string): Promise<OAuthIdentity> {
    return Promise.reject(
      new AppException(
        ERROR_CODE.NOT_IMPLEMENTED,
        501,
        "Apple bilan kirish hali qo'llab-quvvatlanmaydi",
      ),
    );
  }
}
