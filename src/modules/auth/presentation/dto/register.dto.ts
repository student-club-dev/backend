import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { IsEmailOrPhoneProvided } from '../../../../common/validation/is-email-or-phone-provided.validator';
import type { RegisterInput } from '../../application/auth.io';

/**
 * Credential registration — at least one of `email` / `phoneNumber` is required.
 *
 * A registration that carries a phone number must also carry the OTP proving it (see `otpCode`):
 * the column is unique, so claiming a stranger's number locks its real owner out permanently.
 */
export class RegisterDto {
  @ApiPropertyOptional({ example: 'student@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+998901234567', description: 'E.164 format' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phoneNumber E.164 formatida bo‘lishi kerak' })
  phoneNumber?: string;

  @ApiProperty({ example: 'secret123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @IsEmailOrPhoneProvided()
  password!: string;

  @ApiPropertyOptional({
    example: '123456',
    description:
      'The code from `POST /v1/auth/{student|business}/register/otp`.\n\n' +
      '**Required whenever `phoneNumber` is sent.** `phoneNumber` is unique, so a registration ' +
      'that claimed a number without proving it would lock out that number’s real owner for good ' +
      '— which is why there is no way to skip this.\n\n' +
      'Not needed for an email-only registration: phone is not required to create an account at ' +
      'all (email, Google and Apple are complete signups on their own), and verification is asked ' +
      'for later, at the actions where trust matters.',
  })
  @IsOptional()
  @IsString()
  otpCode?: string;

  @ApiPropertyOptional({ example: 'iPhone 15' })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({ example: 'iOS' })
  @IsOptional()
  @IsString()
  platform?: string;

  toInput(ipAddress: string | null): RegisterInput {
    return {
      email: this.email ?? null,
      phoneNumber: this.phoneNumber ?? null,
      password: this.password,
      otpCode: this.otpCode ?? null,
      deviceName: this.deviceName ?? null,
      platform: this.platform ?? null,
      ipAddress,
    };
  }
}
