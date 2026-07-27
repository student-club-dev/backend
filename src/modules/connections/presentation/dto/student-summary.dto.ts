import { ApiProperty } from '@nestjs/swagger';
import { StudentSummary } from '../../domain/entities/student-summary.entity';

/** A student as shown wherever a person appears (search, connections, requests). Matches chat.md. */
export class StudentSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  username!: string | null;

  @ApiProperty({ nullable: true })
  fullName!: string | null;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ description: 'Populated only for connections; false in v1' })
  online!: boolean;

  @ApiProperty({ nullable: true, format: 'date-time' })
  lastSeenAt!: string | null;

  static fromDomain(student: StudentSummary): StudentSummaryDto {
    const dto = new StudentSummaryDto();
    dto.id = student.id;
    dto.username = student.username;
    dto.fullName = student.fullName;
    dto.avatarUrl = student.avatarUrl;
    dto.online = student.online;
    dto.lastSeenAt = student.lastSeenAt === null ? null : student.lastSeenAt.toISOString();
    return dto;
  }
}
