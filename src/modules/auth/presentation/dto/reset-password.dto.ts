import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

/** Reset the account password with the SMS OTP (D5). */
export class ResetPasswordDto {
  @ApiProperty({ example: '+998901234567', description: 'E.164 format' })
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phoneNumber E.164 formatida bo‘lishi kerak' })
  phoneNumber!: string;

  @ApiProperty({ example: '111111', description: '6-digit code' })
  @Matches(/^\d{6}$/, { message: 'code 6 xonali raqam bo‘lishi kerak' })
  code!: string;

  @ApiProperty({ example: 'newsecret123', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
