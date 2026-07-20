import {
  CreateRefreshTokenData,
  RefreshToken,
  RefreshTokenSession,
} from './entities/refresh-token.entity';

/** Injection token for the per-type refresh-token repository. */
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

/**
 * Refresh-token data-access port. One implementation per account table (D6). Lookups are
 * by SHA-256 hash; `rotate` revokes the current session and issues its replacement atomically.
 */
export interface RefreshTokenRepository {
  create(data: CreateRefreshTokenData): Promise<void>;

  /** Returns a non-revoked, non-expired session for the hash, or null. */
  findActiveByHash(tokenHash: string): Promise<RefreshToken | null>;

  /** Revokes the (still-active) session with the given hash. Idempotent. */
  revoke(tokenHash: string): Promise<void>;

  /** Revokes the current session and creates its replacement in one transaction. */
  rotate(currentTokenId: string, next: CreateRefreshTokenData): Promise<void>;

  /** Active (non-revoked, non-expired) sessions for the account — the device list (D3). */
  listActiveByAccount(accountId: string): Promise<RefreshTokenSession[]>;

  /**
   * Revokes a single active session by id, but only when it belongs to `accountId` (ownership).
   * Returns whether a matching active session existed (false → not the caller's / already gone).
   */
  revokeById(id: string, accountId: string): Promise<boolean>;

  /** Revokes all of the account's active sessions ("logout all" / password change — D3). */
  revokeAllByAccount(accountId: string): Promise<void>;
}
