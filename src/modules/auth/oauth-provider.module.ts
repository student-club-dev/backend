import { Module } from '@nestjs/common';
import { AuthProvider } from '../../common/enums/auth-provider.enum';
import {
  OAUTH_PROVIDER_REGISTRY,
  OAuthProvider,
  OAuthProviderRegistry,
} from './domain/oauth/oauth-provider';
import { AppleOAuthProvider } from './infrastructure/oauth/apple-oauth.provider';
import { GoogleOAuthProvider } from './infrastructure/oauth/google-oauth.provider';

/**
 * Shared OAuth provider registry. Binds each AuthProvider to its implementation so AuthService
 * selects a provider by name and new providers (Apple) plug in without changing the flow.
 * Imported by both per-type auth modules — the providers are account-type agnostic.
 */
@Module({
  providers: [
    GoogleOAuthProvider,
    AppleOAuthProvider,
    {
      provide: OAUTH_PROVIDER_REGISTRY,
      inject: [GoogleOAuthProvider, AppleOAuthProvider],
      useFactory: (
        google: GoogleOAuthProvider,
        apple: AppleOAuthProvider,
      ): OAuthProviderRegistry =>
        new Map<AuthProvider, OAuthProvider>([
          [AuthProvider.GOOGLE, google],
          [AuthProvider.APPLE, apple],
        ]),
    },
  ],
  exports: [OAUTH_PROVIDER_REGISTRY],
})
export class OAuthProviderModule {}
