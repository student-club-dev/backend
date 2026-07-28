import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { UpdateProfileInput } from '../../../profiles/application/profile.io';
import { Gender } from '../../../profiles/domain/enums/gender.enum';

/**
 * Admin partial update of a business owner (Faza 3). Every field is optional; an absent (or null)
 * field is left unchanged. Same rules as the owner's own profile update — normalised to
 * UpdateProfileInput and applied by ProfileService (a phone-number change resets `phoneVerified`).
 */
export class AdminUpdateOwnerDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ nullable: true, description: 'E.164 format', example: '+998901234567' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phoneNumber E.164 formatida bo‘lishi kerak' })
  phoneNumber?: string;

  @ApiPropertyOptional({ enum: Gender, enumName: 'GenderDto', nullable: true })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  /** Normalises to the shared profile input, coercing nulls to "unchanged". */
  toInput(): UpdateProfileInput {
    return {
      firstName: this.firstName ?? undefined,
      lastName: this.lastName ?? undefined,
      phoneNumber: this.phoneNumber ?? undefined,
      gender: this.gender ?? undefined,
      avatarUrl: this.avatarUrl ?? undefined,
    };
  }
}
