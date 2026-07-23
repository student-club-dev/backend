import { ApiProperty } from '@nestjs/swagger';
import { Profile } from '../../domain/entities/profile.entity';
import { CourseYear } from '../../domain/enums/course-year.enum';
import { Gender } from '../../domain/enums/gender.enum';
import { ProfileRole } from '../../domain/enums/profile-role.enum';

/**
 * UserProfileDto — the authenticated account's profile (matches elon-uz.json). The
 * university/course fields (universityId, universityEmail, birthYear, courseYear) are `null`
 * for a business owner; `gender` is carried by both account types.
 */
export class UserProfileDto {
  @ApiProperty({ nullable: true, example: 'Quvonchbek' })
  firstName!: string | null;

  @ApiProperty({ nullable: true, example: "G'afurov" })
  lastName!: string | null;

  @ApiProperty({ nullable: true, description: 'E.164 format', example: '+998901234567' })
  phoneNumber!: string | null;

  @ApiProperty({ enum: Gender, enumName: 'GenderDto', nullable: true })
  gender!: Gender | null;

  @ApiProperty({ enum: ProfileRole, enumName: 'ProfileRoleDto', nullable: true })
  role!: ProfileRole | null;

  @ApiProperty({ nullable: true })
  universityId!: string | null;

  @ApiProperty({ nullable: true })
  universityEmail!: string | null;

  @ApiProperty({ nullable: true, example: 2004 })
  birthYear!: number | null;

  @ApiProperty({ enum: CourseYear, enumName: 'CourseYearDto', nullable: true })
  courseYear!: CourseYear | null;

  @ApiProperty({
    nullable: true,
    description: 'Public URL of the profile picture',
    example: 'https://cdn.elon.uz/avatars/abc123.jpg',
  })
  avatarUrl!: string | null;

  static fromDomain(profile: Profile): UserProfileDto {
    const dto = new UserProfileDto();
    dto.firstName = profile.firstName;
    dto.lastName = profile.lastName;
    dto.phoneNumber = profile.phoneNumber;
    dto.gender = profile.gender;
    dto.role = profile.role;
    dto.universityId = profile.universityId;
    dto.universityEmail = profile.universityEmail;
    dto.birthYear = profile.birthYear;
    dto.courseYear = profile.courseYear;
    dto.avatarUrl = profile.avatarUrl;
    return dto;
  }
}
