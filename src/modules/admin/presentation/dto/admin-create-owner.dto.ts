import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { IsEmailOrPhoneProvided } from '../../../../common/validation/is-email-or-phone-provided.validator';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { AdminCreateOwnerInput } from '../../application/admin-user-write.io';

/**
 * Admin creation of a business owner (Faza 3, ADMIN only). At least one of `email` / `phoneNumber`
 * is required; `password` is the admin-set initial password (min 8). The service hashes the
 * password (argon2) and enforces uniqueness within `business_owners`.
 */
export class AdminCreateOwnerDto {
  @ApiPropertyOptional({ example: 'owner@example.com' })
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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ enum: Gender, enumName: 'GenderDto', nullable: true })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  /** Normalises to the application input, coercing absent fields to null. */
  toInput(): AdminCreateOwnerInput {
    return {
      email: this.email ?? null,
      phoneNumber: this.phoneNumber ?? null,
      password: this.password,
      firstName: this.firstName ?? null,
      lastName: this.lastName ?? null,
      gender: this.gender ?? null,
      avatarUrl: this.avatarUrl ?? null,
    };
  }
}
