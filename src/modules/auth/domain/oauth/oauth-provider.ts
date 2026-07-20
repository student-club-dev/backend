import { AuthProvider } from '../../../../common/enums/auth-provider.enum';

/**
 * The verified identity an OAuth provider returns after validating an ID token. The backend
 * stays the source of truth (D4): the provider is used only to prove who the caller is.
 */
export interface OAuthIdentity {
  provider: AuthProvider;
  /** The provider's stable account id (Google `sub` / Apple `sub`) — the primary link key (D4). */
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

/**
 * Port for an OAuth identity provider. Implementations live in infrastructure (Google, Apple);
 * the application layer depends on this interface only — never on the provider SDK directly.
 */
export interface OAuthProvider {
  /** Verifies the provider ID token (signature + audience) and returns the identity, or throws. */
  verify(idToken: string): Promise<OAuthIdentity>;
}

/** Injection token for the provider registry (a map keyed by AuthProvider, bound in the module). */
export const OAUTH_PROVIDER_REGISTRY = Symbol('OAUTH_PROVIDER_REGISTRY');

/** Resolves the OAuth provider implementation for a given AuthProvider so the flow stays generic. */
export type OAuthProviderRegistry = ReadonlyMap<AuthProvider, OAuthProvider>;
