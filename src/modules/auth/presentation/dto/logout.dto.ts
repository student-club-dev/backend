import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import type { LogoutInput } from '../../application/auth.io';

/** Revoke a single refresh token (session). Idempotent. */
export class LogoutDto {
  @ApiProperty({ description: 'The opaque refresh token to revoke' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  toInput(): LogoutInput {
    return { refreshToken: this.refreshToken };
  }
}
