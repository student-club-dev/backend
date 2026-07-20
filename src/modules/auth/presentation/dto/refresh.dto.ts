import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { RefreshInput } from '../../application/auth.io';

/** Rotate a refresh token. The opaque token is carried in the body (not the Authorization header). */
export class RefreshDto {
  @ApiProperty({ description: 'The opaque refresh token issued at login / previous refresh' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @ApiPropertyOptional({ example: 'iPhone 15' })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({ example: 'iOS' })
  @IsOptional()
  @IsString()
  platform?: string;

  toInput(ipAddress: string | null): RefreshInput {
    return {
      refreshToken: this.refreshToken,
      deviceName: this.deviceName ?? null,
      platform: this.platform ?? null,
      ipAddress,
    };
  }
}
