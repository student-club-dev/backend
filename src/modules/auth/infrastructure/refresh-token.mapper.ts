import { RefreshToken, RefreshTokenSession } from '../domain/entities/refresh-token.entity';

/**
 * Normalised refresh-token row. Each repository maps its own FK column
 * (`studentId` / `businessOwnerId`) to `accountId` before calling this.
 */
interface RefreshTokenRow {
  id: string;
  accountId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export function toRefreshToken(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    accountId: row.accountId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

/** Session-metadata subset shared by both refresh-token tables (never includes the token hash). */
interface RefreshTokenSessionRow {
  id: string;
  deviceName: string | null;
  platform: string | null;
  ipAddress: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export function toRefreshTokenSession(row: RefreshTokenSessionRow): RefreshTokenSession {
  return {
    id: row.id,
    deviceName: row.deviceName,
    platform: row.platform,
    ipAddress: row.ipAddress,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}
