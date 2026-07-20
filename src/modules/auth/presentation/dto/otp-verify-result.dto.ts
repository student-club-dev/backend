import { ApiProperty } from '@nestjs/swagger';

/** Result of a successful OTP verification (the account's phone is now verified). */
export class OtpVerifyResultDto {
  @ApiProperty({ example: true })
  verified!: boolean;

  static verified(): OtpVerifyResultDto {
    const dto = new OtpVerifyResultDto();
    dto.verified = true;
    return dto;
  }
}
