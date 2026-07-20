import { ApiProperty } from '@nestjs/swagger';
import type { AuthTokens } from '../../application/auth.io';

/** The token pair returned by register / login / refresh. */
export class AuthTokensDto {
  @ApiProperty({ description: 'Short-lived JWT access token (15m)' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque refresh token — store securely; rotated on each refresh' })
  refreshToken!: string;

  static fromDomain(tokens: AuthTokens): AuthTokensDto {
    const dto = new AuthTokensDto();
    dto.accessToken = tokens.accessToken;
    dto.refreshToken = tokens.refreshToken;
    return dto;
  }
}
