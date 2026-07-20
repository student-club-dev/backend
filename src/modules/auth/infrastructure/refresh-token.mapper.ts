import { RefreshToken } from '../domain/entities/refresh-token.entity';

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
