import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CourseYear } from '../../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { ConnectionView } from '../../domain/enums/connection-view.enum';
import { StudentSort } from '../../domain/student-directory.repository';

/** `?k=a,b` and a repeated `?k=a&k=b` both arrive as the same list; blanks are dropped. */
const csv = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parts = (Array.isArray(value) ? value : [value]).flatMap((entry) =>
    typeof entry === 'string' ? entry.split(',') : [entry],
  );
  const cleaned = parts
    .map((part) => (typeof part === 'string' ? part.trim() : part))
    .filter(Boolean);
  return cleaned.length === 0 ? undefined : cleaned;
};

/** Shared pagination query — absent `page`/`size` default to 1/20 in the controller. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}

/**
 * Query for `GET /v1/students/search` (deprecated) — `q` is now optional, so an empty call
 * behaves exactly like an unfiltered `GET /v1/students`.
 */
export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matched against username (prefix) or full name (contains)' })
  @IsOptional()
  @IsString()
  q?: string;
}

/**
 * Query for `GET /v1/students` — the filtered directory. Every parameter is optional; supplying
 * none returns the full paginated list. Multi-value parameters accept `a,b` or a repeated key.
 */
export class StudentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matched against username (prefix) or full name (contains)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description:
      'One or more university ids, comma-separated. Matched exactly against the value students ' +
      'set on their profile (currently `emis-<profEmisId>`).',
    example: 'emis-142,emis-77',
  })
  @IsOptional()
  @Transform(csv)
  @IsString({ each: true })
  universityId?: string[];

  @ApiPropertyOptional({
    enum: Gender,
    enumName: 'GenderDto',
    isArray: true,
    description: 'One or more, comma-separated.',
  })
  @IsOptional()
  @Transform(csv)
  @IsEnum(Gender, { each: true })
  gender?: Gender[];

  @ApiPropertyOptional({
    enum: CourseYear,
    enumName: 'CourseYearDto',
    isArray: true,
    description: 'One or more, comma-separated.',
    example: '1,2',
  })
  @IsOptional()
  @Transform(csv)
  @IsEnum(CourseYear, { each: true })
  courseYear?: CourseYear[];

  @ApiPropertyOptional({ description: 'Inclusive lower bound on birth year', example: 2002 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  birthYearFrom?: number;

  @ApiPropertyOptional({ description: 'Inclusive upper bound on birth year', example: 2006 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  birthYearTo?: number;

  @ApiPropertyOptional({
    enum: ConnectionView,
    enumName: 'ConnectionViewDto',
    description: 'Keep only students you stand in this relationship with. `NONE` = not yet linked.',
  })
  @IsOptional()
  @IsEnum(ConnectionView)
  connectionStatus?: ConnectionView;

  @ApiPropertyOptional({
    enum: StudentSort,
    enumName: 'StudentSortDto',
    default: StudentSort.RECENT,
    description: '`RECENT` = newest accounts first. `NAME` = alphabetical.',
  })
  @IsOptional()
  @IsEnum(StudentSort)
  sort?: StudentSort;
}

/** Query for `GET /v1/connections/requests`. */
export class RequestsQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: ['incoming', 'outgoing'] })
  @IsIn(['incoming', 'outgoing'])
  direction!: 'incoming' | 'outgoing';
}

/** Query for `GET /v1/connections`. */
export class ConnectionsQueryDto extends PaginationQueryDto {}
