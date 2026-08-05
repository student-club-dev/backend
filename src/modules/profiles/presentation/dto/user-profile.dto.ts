import { ApiProperty } from '@nestjs/swagger';
import { Profile } from '../../domain/entities/profile.entity';
import { CourseYear } from '../../domain/enums/course-year.enum';
import { Gender } from '../../domain/enums/gender.enum';
import { LastSeenVisibility } from '../../domain/enums/last-seen-visibility.enum';
import { PhoneVisibility } from '../../domain/enums/phone-visibility.enum';
import { ProfileRole } from '../../domain/enums/profile-role.enum';

/**
 * UserProfileDto — the authenticated account's profile (matches elon-uz.json). The
 * university/course fields (universityId, universityEmail, birthYear, courseYear) and
 * `lastSeenVisibility` are `null` for a business owner; `gender` is carried by both account types.
 */
export class UserProfileDto {
  @ApiProperty({ type: String, nullable: true, example: 'Quvonchbek' })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "G'afurov" })
  lastName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Unique handle (students only)',
    example: 'quvonchbek',
  })
  username!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'E.164 format',
    example: '+998901234567',
  })
  phoneNumber!: string | null;

  @ApiProperty({ enum: Gender, enumName: 'GenderDto', nullable: true })
  gender!: Gender | null;

  @ApiProperty({ enum: ProfileRole, enumName: 'ProfileRoleDto', nullable: true })
  role!: ProfileRole | null;

  @ApiProperty({ type: String, nullable: true })
  universityId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  universityEmail!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'TOSHKENT_SHAHRI',
    description:
      'Where the student lives. Writable through `PATCH /v1/profile/me` and now returned here too ' +
      '— without it the value was written and never came back, so a reinstall or a second device ' +
      'showed an empty address the user had already filled in.\n\n' +
      'Null for a business-owner profile and for a student who has not set it.',
  })
  regionId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'CHILONZOR',
    description: 'The finer half of the same address; preferred over `regionId` when both are set.',
  })
  districtId!: string | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true, example: 2004 })
  birthYear!: number | null;

  @ApiProperty({ enum: CourseYear, enumName: 'CourseYearDto', nullable: true })
  courseYear!: CourseYear | null;

  @ApiProperty({
    enum: LastSeenVisibility,
    enumName: 'LastSeenVisibilityDto',
    nullable: true,
    description:
      'Students only — who may see your `online` / `lastSeenAt`. `NOBODY` also hides `online` ' +
      'and suppresses your `presence:update` events. Defaults to `CONNECTIONS`.',
  })
  lastSeenVisibility!: LastSeenVisibility | null;

  @ApiProperty({
    enum: PhoneVisibility,
    enumName: 'PhoneVisibilityDto',
    nullable: true,
    description:
      'Students only — who may see your `phoneNumber` on `StudentSummaryDto`. Defaults to ' +
      '**`NOBODY`**, unlike `lastSeenVisibility`: your number is how you sign in, not something we ' +
      'publish unless you say so.',
  })
  phoneVisibility!: PhoneVisibility | null;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 140,
    description:
      'Students only — a short blurb, up to 140 characters. Links, `t.me/…`, `@handle`s and phone ' +
      'numbers are rejected with `422 BIO_NOT_ALLOWED`. Send an empty string to clear it.',
    example: '5/5 · Dasturiy injiniring',
  })
  bio!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Public URL of the profile picture',
    example: 'https://cdn.elon.uz/avatars/abc123.jpg',
  })
  avatarUrl!: string | null;

  static fromDomain(profile: Profile): UserProfileDto {
    const dto = new UserProfileDto();
    dto.firstName = profile.firstName;
    dto.lastName = profile.lastName;
    dto.username = profile.username;
    dto.phoneNumber = profile.phoneNumber;
    dto.gender = profile.gender;
    dto.role = profile.role;
    dto.universityId = profile.universityId;
    dto.universityEmail = profile.universityEmail;
    dto.regionId = profile.regionId;
    dto.districtId = profile.districtId;
    dto.birthYear = profile.birthYear;
    dto.courseYear = profile.courseYear;
    dto.lastSeenVisibility = profile.lastSeenVisibility;
    dto.phoneVisibility = profile.phoneVisibility;
    dto.bio = profile.bio;
    dto.avatarUrl = profile.avatarUrl;
    return dto;
  }
}
