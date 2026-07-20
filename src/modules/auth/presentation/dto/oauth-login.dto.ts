import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { DeviceContext } from '../../application/auth.io';

/** OAuth login — the provider ID token to verify, plus optional device/session metadata (D3). */
export class OAuthLoginDto {
  @ApiProperty({ description: 'The provider-issued ID token (Google/Apple) to verify' })
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @ApiPropertyOptional({ example: 'iPhone 15' })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({ example: 'iOS' })
  @IsOptional()
  @IsString()
  platform?: string;

  toDevice(ipAddress: string | null): DeviceContext {
    return {
      deviceName: this.deviceName ?? null,
      platform: this.platform ?? null,
      ipAddress,
    };
  }
}
