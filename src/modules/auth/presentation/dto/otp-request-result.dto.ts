import { ApiProperty } from '@nestjs/swagger';
import type { OtpRequestResult } from '../../application/otp.io';

/** The OTP-request outcome — identical whether the Dev or Eskiz provider sent the SMS. */
export class OtpRequestResultDto {
  @ApiProperty({ example: true })
  sent!: boolean;

  @ApiProperty({ example: 300, description: 'Seconds until the code expires' })
  expiresInSeconds!: number;

  @ApiProperty({ example: 60, description: 'Seconds before another code can be requested' })
  resendCooldownSeconds!: number;

  static fromDomain(result: OtpRequestResult): OtpRequestResultDto {
    const dto = new OtpRequestResultDto();
    dto.sent = result.sent;
    dto.expiresInSeconds = result.expiresInSeconds;
    dto.resendCooldownSeconds = result.resendCooldownSeconds;
    return dto;
  }
}
