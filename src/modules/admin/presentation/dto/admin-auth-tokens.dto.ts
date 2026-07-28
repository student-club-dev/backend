import { ApiProperty } from '@nestjs/swagger';
import type { AdminTokens } from '../../application/admin-auth.io';

/** The token returned by admin login. No refresh token in Faza 0 — re-login on expiry. */
export class AdminAuthTokensDto {
  @ApiProperty({ description: 'Short-lived JWT access token (JWT_ACCESS_TTL)' })
  accessToken!: string;

  static fromDomain(tokens: AdminTokens): AdminAuthTokensDto {
    const dto = new AdminAuthTokensDto();
    dto.accessToken = tokens.accessToken;
    return dto;
  }
}
