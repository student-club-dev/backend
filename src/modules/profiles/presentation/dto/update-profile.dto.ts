import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { UpdateProfileInput } from '../../application/profile.io';
import { CourseYear } from '../../domain/enums/course-year.enum';
import { Gender } from '../../domain/enums/gender.enum';
import { ProfileRole } from '../../domain/enums/profile-role.enum';

/**
 * UpdateProfileRequestDto — a partial update of the authenticated profile (matches elon-uz.json).
 * Every field is optional; an unset (or null) field is left unchanged. `role` is accepted for
 * contract compatibility but ignored — role is read-only, derived from the account type.
 * Student-only fields are ignored for a business owner.
 */
export class UpdateProfileDto {
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

  @ApiPropertyOptional({ enum: ProfileRole, enumName: 'ProfileRoleDto', nullable: true })
  @IsOptional()
  @IsEnum(ProfileRole)
  role?: ProfileRole;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  universityId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsEmail()
  universityEmail?: string;

  @ApiPropertyOptional({ nullable: true, example: 2004 })
  @IsOptional()
  @IsInt()
  birthYear?: number;

  @ApiPropertyOptional({ enum: CourseYear, enumName: 'CourseYearDto', nullable: true })
  @IsOptional()
  @IsEnum(CourseYear)
  courseYear?: CourseYear;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  /** Normalises to the application input, coercing explicit nulls to "unchanged" and dropping `role`. */
  toInput(): UpdateProfileInput {
    return {
      firstName: this.firstName ?? undefined,
      lastName: this.lastName ?? undefined,
      phoneNumber: this.phoneNumber ?? undefined,
      gender: this.gender ?? undefined,
      universityId: this.universityId ?? undefined,
      universityEmail: this.universityEmail ?? undefined,
      birthYear: this.birthYear ?? undefined,
      courseYear: this.courseYear ?? undefined,
      avatarUrl: this.avatarUrl ?? undefined,
    };
  }
}
