/** An issued refresh-token session (D3). Only the SHA-256 hash of the token is persisted. */
export interface RefreshToken {
  id: string;
  accountId: string;
  expiresAt: Date;
  revokedAt: Date | null;
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
