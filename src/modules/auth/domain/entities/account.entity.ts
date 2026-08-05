import { AccountStatus } from '../enums/account-status.enum';

/**
 * The auth-relevant view of an account (student or business owner). Type-specific profile
 * fields live in the respective table but are not part of credential auth (pod-1).
 */
export interface Account {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  passwordHash: string | null;
  /** Lifecycle state — only ACTIVE may log in / refresh (admin ban gate, Faza 3). */
  status: AccountStatus;
}

/** Data required to create a credential account. New accounts are unverified (D1). */
export interface CreateAccountData {
  email: string | null;
  phoneNumber: string | null;
  passwordHash: string;
  /**
   * Whether the phone was proven by an OTP during registration (D1).
   *
   * The account is written verified rather than verified afterwards because there is no window in
   * between: the code is consumed and the row is created in the same request, and a row that was
   * created unverified would be one more unverified row holding a number.
   */
  phoneVerified?: boolean;
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
