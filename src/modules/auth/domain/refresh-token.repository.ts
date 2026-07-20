import { CreateRefreshTokenData, RefreshToken } from './entities/refresh-token.entity';

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
}
