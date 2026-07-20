import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** Verify the 6-digit OTP sent to `phoneNumber`; on success the account's phone becomes verified. */
export class OtpVerifyDto {
  @ApiProperty({ example: '+998901234567', description: 'E.164 format' })
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phoneNumber E.164 formatida bo‘lishi kerak' })
  phoneNumber!: string;

  @ApiProperty({ example: '111111', description: '6-digit code' })
  @Matches(/^\d{6}$/, { message: 'code 6 xonali raqam bo‘lishi kerak' })
  code!: string;
}
