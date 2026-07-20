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
