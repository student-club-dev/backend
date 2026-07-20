import { Account, CreateAccountData, CreateOAuthAccountData } from './entities/account.entity';

/** Injection token for the per-type account repository (bound to the Prisma impl in the module). */
export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

/** Injection token carrying the module's AccountType value (student / business). */
export const ACCOUNT_TYPE = Symbol('ACCOUNT_TYPE');

/**
 * Account data-access port. One implementation per account table (D6). The application
 * layer depends on this interface only; the Prisma implementations live in infrastructure.
 */
export interface AccountRepository {
  findByEmail(email: string): Promise<Account | null>;
  findByPhone(phoneNumber: string): Promise<Account | null>;
  findById(id: string): Promise<Account | null>;
  create(data: CreateAccountData): Promise<Account>;

  /** Creates a credential-less account from a verified OAuth identity (D4). */
  createFromOAuth(data: CreateOAuthAccountData): Promise<Account>;

  /** Marks the account's phone as verified and sets it to the just-verified number (D1 gate). */
  markPhoneVerified(accountId: string, phoneNumber: string): Promise<void>;

  /** Sets (or replaces) the account's password hash (set-password D9 / reset D5). */
  setPassword(accountId: string, passwordHash: string): Promise<void>;
}
