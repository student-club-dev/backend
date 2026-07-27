import { ApiProperty } from '@nestjs/swagger';
import { StartResult } from '../../application/redemptions.io';

/** `start` response — the single-use code the app renders (QR or text) and its expiry. */
export class StartRedemptionResponseDto {
  @ApiProperty({ description: 'Single-use redemption code — render as a QR or show as text' })
  code!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  static fromResult(result: StartResult): StartRedemptionResponseDto {
    const dto = new StartRedemptionResponseDto();
    dto.code = result.code;
    dto.expiresAt = result.expiresAt.toISOString();
    return dto;
  }
}
