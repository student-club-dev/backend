import { AuthProvider } from '../../../common/enums/auth-provider.enum';

/** Injection token for the per-type OAuth-account repository (bound to the Prisma impl in the module). */
export const OAUTH_ACCOUNT_REPOSITORY = Symbol('OAUTH_ACCOUNT_REPOSITORY');

/**
 * OAuth-account data-access port. One implementation per account table (D6): links a provider
 * identity (`provider`, `providerAccountId`) to an account in this type's table.
 */
export interface OAuthAccountRepository {
  /** Returns the linked account id for `(provider, providerAccountId)`, or null if unlinked. */
  findAccountIdByProvider(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<string | null>;

  /** Attaches an OAuth identity to an existing account (inserts a link row). */
  link(accountId: string, provider: AuthProvider, providerAccountId: string): Promise<void>;
}
