import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { UpdateProfileInput } from '../../../profiles/application/profile.io';
import { CourseYear } from '../../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';

/**
 * Admin partial update of a student (Faza 3). Every field is optional; an absent (or null) field is
 * left unchanged. Same rules as the student's own profile update — normalised to UpdateProfileInput
 * and applied by ProfileService (phone-change resets `phoneVerified`, username lowercased + unique).
 */
export class AdminUpdateStudentDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Unique handle for discovery: 3–20 of a–z, 0–9, _',
    example: 'quvonchbek',
  })
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_]{3,20}$/, { message: 'username 3–20 belgi: harf, raqam yoki _' })
  username?: string;

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

  /** Normalises to the shared profile input, lowercasing `username` and coercing nulls to "unchanged". */
  toInput(): UpdateProfileInput {
    return {
      firstName: this.firstName ?? undefined,
      lastName: this.lastName ?? undefined,
      username: this.username?.toLowerCase(),
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
