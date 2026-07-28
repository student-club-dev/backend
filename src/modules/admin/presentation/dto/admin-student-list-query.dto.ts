import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CourseYear } from '../../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { AdminStudentListFilter } from '../../domain/admin-student-read.repository';
import { AdminUserListQueryDto } from './admin-user-list-query.dto';

/**
 * Query for `GET /v1/admin/students`. Extends the shared admin filters with the student-only ones.
 * `q` matches firstName / lastName / username / phoneNumber / email (case-insensitive contains).
 */
export class AdminStudentListQueryDto extends AdminUserListQueryDto {
  @ApiPropertyOptional({
    description: 'Exact match on the value the student set on their profile (e.g. `emis-142`).',
    example: 'emis-142',
  })
  @IsOptional()
  @IsString()
  universityId?: string;

  @ApiPropertyOptional({ enum: CourseYear, enumName: 'CourseYearDto' })
  @IsOptional()
  @IsEnum(CourseYear)
  courseYear?: CourseYear;

  @ApiPropertyOptional({ enum: Gender, enumName: 'GenderDto' })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  toFilter(): AdminStudentListFilter {
    return {
      q: this.q ?? null,
      universityId: this.universityId ?? null,
      courseYear: this.courseYear ?? null,
      gender: this.gender ?? null,
      phoneVerified: this.phoneVerified ?? null,
      createdFrom: this.createdFromDate(),
      createdTo: this.createdToDate(),
      sort: this.sortOrDefault(),
      page: this.pageOrDefault(),
      size: this.sizeOrDefault(),
    };
  }
}
