import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { IsEmailOrPhoneProvided } from '../../../../common/validation/is-email-or-phone-provided.validator';
import { CourseYear } from '../../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { AdminCreateStudentInput } from '../../application/admin-user-write.io';

/**
 * Admin creation of a student (Faza 3, ADMIN only). At least one of `email` / `phoneNumber` is
 * required; `password` is the admin-set initial password (min 8). Optional profile fields mirror
 * the self-profile update. The service hashes the password (argon2) and enforces uniqueness.
 */
export class AdminCreateStudentDto {
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

  /** Normalises to the application input, lowercasing `username` and coercing absent fields to null. */
  toInput(): AdminCreateStudentInput {
    return {
      email: this.email ?? null,
      phoneNumber: this.phoneNumber ?? null,
      password: this.password,
      firstName: this.firstName ?? null,
      lastName: this.lastName ?? null,
      username: this.username?.toLowerCase() ?? null,
      gender: this.gender ?? null,
      universityId: this.universityId ?? null,
      universityEmail: this.universityEmail ?? null,
      birthYear: this.birthYear ?? null,
      courseYear: this.courseYear ?? null,
      avatarUrl: this.avatarUrl ?? null,
    };
  }
}
