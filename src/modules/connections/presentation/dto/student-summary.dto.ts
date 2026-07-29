import { ApiProperty } from '@nestjs/swagger';
import { CourseYear } from '../../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { StudentSummary } from '../../domain/entities/student-summary.entity';

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
    dto.universityId = student.universityId;
    dto.gender = student.gender;
    dto.courseYear = student.courseYear;
    dto.online = student.online;
    dto.lastSeenAt = student.lastSeenAt === null ? null : student.lastSeenAt.toISOString();
    return dto;
  }
}
