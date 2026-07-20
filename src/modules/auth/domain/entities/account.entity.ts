/**
 * The auth-relevant view of an account (student or business owner). Type-specific profile
 * fields live in the respective table but are not part of credential auth (pod-1).
 */
export interface Account {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  passwordHash: string | null;
}

/** Data required to create a credential account. New accounts are unverified (D1). */
export interface CreateAccountData {
  email: string | null;
  phoneNumber: string | null;
  passwordHash: string;
}

/**
 * Data required to create an account from a verified OAuth identity (D4). No password or phone —
 * the account is credential-less until a password is set later; `emailVerified` reflects the provider.
 */
export interface CreateOAuthAccountData {
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}
