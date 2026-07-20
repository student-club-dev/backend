import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { IsEmailOrPhoneProvided } from '../../../../common/validation/is-email-or-phone-provided.validator';
import type { RegisterInput } from '../../application/auth.io';

/** Credential registration — at least one of `email` / `phoneNumber` is required. */
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
      deviceName: this.deviceName ?? null,
      platform: this.platform ?? null,
      ipAddress,
    };
  }
}
