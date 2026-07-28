import { ApiProperty } from '@nestjs/swagger';
import { CourseYear } from '../../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { LastSeenVisibility } from '../../../profiles/domain/enums/last-seen-visibility.enum';
import { AdminStudentPage } from '../../domain/admin-student-read.repository';
import { AdminStudent, AdminStudentSummary } from '../../domain/entities/admin-student.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';

/** One student row in the admin list. */
export class AdminStudentSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  firstName!: string | null;

  @ApiProperty({ nullable: true })
  lastName!: string | null;

  @ApiProperty({ nullable: true })
  username!: string | null;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ nullable: true, description: 'E.164 format' })
  phoneNumber!: string | null;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  universityId!: string | null;

  @ApiProperty({ enum: CourseYear, enumName: 'CourseYearDto', nullable: true })
  courseYear!: CourseYear | null;

  @ApiProperty({ enum: AdminUserStatus, enumName: 'AdminUserStatusDto' })
  status!: AdminUserStatus;

  @ApiProperty({ format: 'date-time', nullable: true, description: 'When the account was banned.' })
  bannedAt!: string | null;

  @ApiProperty({ nullable: true, description: 'Admin-supplied ban reason.' })
  banReason!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromDomain(student: AdminStudentSummary): AdminStudentSummaryDto {
    const dto = new AdminStudentSummaryDto();
    dto.id = student.id;
    dto.firstName = student.firstName;
    dto.lastName = student.lastName;
    dto.username = student.username;
    dto.avatarUrl = student.avatarUrl;
    dto.phoneNumber = student.phoneNumber;
    dto.email = student.email;
    dto.universityId = student.universityId;
    dto.courseYear = student.courseYear;
    dto.status = student.status;
    dto.bannedAt = student.bannedAt === null ? null : student.bannedAt.toISOString();
    dto.banReason = student.banReason;
    dto.createdAt = student.createdAt.toISOString();
    return dto;
  }
}

/** A page of student summaries — matches the CLAUDE.md envelope (`items/page/size/total/hasNext`). */
export class AdminStudentPageDto {
  @ApiProperty({ type: [AdminStudentSummaryDto] })
  items!: AdminStudentSummaryDto[];

  @ApiProperty({ format: 'int32', example: 1 })
  page!: number;

  @ApiProperty({ format: 'int32', example: 20 })
  size!: number;

  @ApiProperty({ format: 'int64', example: 42 })
  total!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  static fromPage(page: AdminStudentPage, pageNumber: number, size: number): AdminStudentPageDto {
    const dto = new AdminStudentPageDto();
    dto.items = page.items.map(AdminStudentSummaryDto.fromDomain);
    dto.page = pageNumber;
    dto.size = size;
    dto.total = page.total;
    dto.hasNext = pageNumber * size < page.total;
    return dto;
  }
}

/** The full student record for the admin detail view — every field except `passwordHash`. */
export class AdminStudentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true, description: 'E.164 format' })
  phoneNumber!: string | null;

  @ApiProperty()
  phoneVerified!: boolean;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty({ nullable: true })
  firstName!: string | null;

  @ApiProperty({ nullable: true })
  lastName!: string | null;

  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ nullable: true })
  username!: string | null;

  @ApiProperty({ enum: Gender, enumName: 'GenderDto', nullable: true })
  gender!: Gender | null;

  @ApiProperty({ nullable: true })
  universityId!: string | null;

  @ApiProperty({ nullable: true })
  universityEmail!: string | null;

  @ApiProperty({ nullable: true, example: 2004 })
  birthYear!: number | null;

  @ApiProperty({ enum: CourseYear, enumName: 'CourseYearDto', nullable: true })
  courseYear!: CourseYear | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastSeenAt!: string | null;

  @ApiProperty({ enum: LastSeenVisibility, enumName: 'LastSeenVisibilityDto' })
  lastSeenVisibility!: LastSeenVisibility;

  @ApiProperty({ enum: AdminUserStatus, enumName: 'AdminUserStatusDto' })
  status!: AdminUserStatus;

  @ApiProperty({ format: 'date-time', nullable: true, description: 'When the account was banned.' })
  bannedAt!: string | null;

  @ApiProperty({ nullable: true, description: 'Admin-supplied ban reason.' })
  banReason!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static fromDomain(student: AdminStudent): AdminStudentDto {
    const dto = new AdminStudentDto();
    dto.id = student.id;
    dto.email = student.email;
    dto.phoneNumber = student.phoneNumber;
    dto.phoneVerified = student.phoneVerified;
    dto.emailVerified = student.emailVerified;
    dto.firstName = student.firstName;
    dto.lastName = student.lastName;
    dto.avatarUrl = student.avatarUrl;
    dto.username = student.username;
    dto.gender = student.gender;
    dto.universityId = student.universityId;
    dto.universityEmail = student.universityEmail;
    dto.birthYear = student.birthYear;
    dto.courseYear = student.courseYear;
    dto.lastSeenAt = student.lastSeenAt === null ? null : student.lastSeenAt.toISOString();
    dto.lastSeenVisibility = student.lastSeenVisibility;
    dto.status = student.status;
    dto.bannedAt = student.bannedAt === null ? null : student.bannedAt.toISOString();
    dto.banReason = student.banReason;
    dto.createdAt = student.createdAt.toISOString();
    dto.updatedAt = student.updatedAt.toISOString();
    return dto;
  }
}
