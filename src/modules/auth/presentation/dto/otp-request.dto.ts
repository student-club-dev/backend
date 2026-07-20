import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** Request an OTP for the phone number the authenticated account wants to verify (D1). */
export class OtpRequestDto {
  @ApiProperty({ example: '+998901234567', description: 'E.164 format' })
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phoneNumber E.164 formatida bo‘lishi kerak' })
  phoneNumber!: string;
}
