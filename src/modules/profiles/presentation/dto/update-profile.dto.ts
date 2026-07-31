import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { UpdateProfileInput } from '../../application/profile.io';
import { MAX_BIO_LENGTH } from '../../domain/bio';
import { CourseYear } from '../../domain/enums/course-year.enum';
import { Gender } from '../../domain/enums/gender.enum';
import { LastSeenVisibility } from '../../domain/enums/last-seen-visibility.enum';
import { PhoneVisibility } from '../../domain/enums/phone-visibility.enum';
import { ProfileRole } from '../../domain/enums/profile-role.enum';

/**
 * UpdateProfileRequestDto — a partial update of the authenticated profile (matches elon-uz.json).
 * Every field is optional; an unset (or null) field is left unchanged. `role` is accepted for
 * contract compatibility but ignored — role is read-only, derived from the account type.
 * University/course fields are ignored for a business owner; `gender` applies to both.
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

  @ApiPropertyOptional({
    nullable: true,
    description: 'Unique handle for discovery (students only): 3–20 of a–z, 0–9, _',
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

  @ApiPropertyOptional({
    enum: LastSeenVisibility,
    enumName: 'LastSeenVisibilityDto',
    nullable: true,
    description:
      'Students only — who may see your `online` / `lastSeenAt`. `NOBODY` also hides `online` ' +
      'and suppresses your `presence:update` events.',
  })
  @IsOptional()
  @IsEnum(LastSeenVisibility)
  lastSeenVisibility?: LastSeenVisibility;

  @ApiPropertyOptional({
    enum: PhoneVisibility,
    enumName: 'PhoneVisibilityDto',
    nullable: true,
    description:
      'Students only — who may see your `phoneNumber` on `StudentSummaryDto`. Defaults to ' +
      '**`NOBODY`**; set it explicitly to share your number.',
  })
  @IsOptional()
  @IsEnum(PhoneVisibility)
  phoneVisibility?: PhoneVisibility;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 140,
    description:
      'Students only — up to 140 characters. Links, `t.me/…`, `@handle`s and phone numbers are ' +
      'rejected with `422 BIO_NOT_ALLOWED`. An empty string clears it.',
    example: '5/5 · Dasturiy injiniring',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BIO_LENGTH)
  bio?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  /** Normalises to the application input, coercing explicit nulls to "unchanged" and dropping `role`. */
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
      lastSeenVisibility: this.lastSeenVisibility ?? undefined,
      phoneVisibility: this.phoneVisibility ?? undefined,
      // `?? undefined` on purpose, like every other field here: an explicit `null` means "leave it
      // alone". Clearing a bio is `""`, which survives this and normalises to `null` in the service.
      bio: this.bio ?? undefined,
      avatarUrl: this.avatarUrl ?? undefined,
    };
  }
}
