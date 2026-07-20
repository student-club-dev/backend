import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** Request a password-reset OTP via SMS (D5). Always succeeds — see the endpoint docs. */
export class ForgotPasswordDto {
  @ApiProperty({ example: '+998901234567', description: 'E.164 format' })
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phoneNumber E.164 formatida bo‘lishi kerak' })
  phoneNumber!: string;
}
