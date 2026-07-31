import { ApiProperty } from '@nestjs/swagger';
import { CourseYear } from '../../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { StudentPhoto, StudentSummary } from '../../domain/entities/student-summary.entity';

/** One picture from a student's profile-photo set. */
export class StudentPhotoDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Requires the same bearer token as any other call.' })
  url!: string;

  @ApiProperty({ type: String, nullable: true })
  thumbUrl!: string | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  width!: number | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  height!: number | null;

  static fromDomain(photo: StudentPhoto): StudentPhotoDto {
    const dto = new StudentPhotoDto();
    dto.id = photo.id;
    dto.url = photo.url;
    dto.thumbUrl = photo.thumbUrl;
    dto.width = photo.width;
    dto.height = photo.height;
    return dto;
  }
}

/** A student as shown wherever a person appears (search, connections, requests). Matches chat.md. */
export class StudentSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  username!: string | null;

  @ApiProperty({ type: String, nullable: true })
  fullName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({
    type: [StudentPhotoDto],
    description:
      'The student’s profile pictures, in display order — swipe through them on the profile ' +
      'screen. The first element always matches `avatarUrl`. **Empty** for a student who has never ' +
      'added one, in which case fall back to `avatarUrl` (which may itself be null).',
  })
  photos!: StudentPhotoDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 140,
    description:
      'Short profile blurb, up to 140 characters. Never contains a link, a `@handle` or a phone ' +
      'number — those are rejected on write, so this is safe to render as plain text.',
    example: '5/5 · Dasturiy injiniring',
  })
  bio!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'E.164 phone number, subject to the target’s `phoneVisibility`: `EVERYONE` always, ' +
      '`CONNECTIONS` only once connected, `NOBODY` (**the default**) never. `null` when hidden — ' +
      'so expect `null` for most students, and do not draw the row at all when it is.',
    example: '+998901234567',
  })
  phoneNumber!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The value the student set on their own profile — the same string `GET /v1/students` ' +
      'accepts in `universityId`. There is no server-side university catalogue yet, so this is ' +
      'free-form (the app currently writes `emis-<profEmisId>`, e.g. `emis-142`).',
    example: 'emis-142',
  })
  universityId!: string | null;

  @ApiProperty({ enum: Gender, enumName: 'GenderDto', nullable: true })
  gender!: Gender | null;

  @ApiProperty({ enum: CourseYear, enumName: 'CourseYearDto', nullable: true })
  courseYear!: CourseYear | null;

  @ApiProperty({
    description:
      'Live presence. Real everywhere the viewer is allowed to see it — subject to the target’s ' +
      '`lastSeenVisibility`: `EVERYONE` always, `CONNECTIONS` (the default) only once connected, ' +
      '`NOBODY` never. When hidden this is `false` and `lastSeenAt` is `null`.',
  })
  online!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'When the student last closed their last socket. `null` while online or hidden.',
  })
  lastSeenAt!: string | null;

  static fromDomain(student: StudentSummary): StudentSummaryDto {
    const dto = new StudentSummaryDto();
    dto.id = student.id;
    dto.username = student.username;
    dto.fullName = student.fullName;
    dto.avatarUrl = student.avatarUrl;
    dto.photos = student.photos.map(StudentPhotoDto.fromDomain);
    dto.bio = student.bio;
    // Already masked by `applyPresenceVisibility` — this only serialises what survived it.
    dto.phoneNumber = student.phoneNumber;
    dto.universityId = student.universityId;
    dto.gender = student.gender;
    dto.courseYear = student.courseYear;
    dto.online = student.online;
    dto.lastSeenAt = student.lastSeenAt === null ? null : student.lastSeenAt.toISOString();
    return dto;
  }
}
