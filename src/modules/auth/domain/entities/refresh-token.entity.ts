/** An issued refresh-token session (D3). Only the SHA-256 hash of the token is persisted. */
export interface RefreshToken {
  id: string;
  accountId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * A device/session summary for the account's session list (D3). Never carries the token hash —
 * only the metadata safe to expose to the account owner.
 */
export interface RefreshTokenSession {
  id: string;
  deviceName: string | null;
  platform: string | null;
  ipAddress: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/** Data required to persist a new refresh-token session, including device metadata (D3). */
export interface CreateRefreshTokenData {
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
  deviceName: string | null;
  platform: string | null;
  ipAddress: string | null;
  lastUsedAt: Date | null;
}
