import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BusinessStatus } from '../../../business/domain/enums/business-status.enum';
import { AdminBusinessListFilter } from '../../domain/admin-business-read.repository';
import { AdminBusinessSort } from '../../domain/enums/admin-business-sort.enum';
import {
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_DEFAULT_SIZE,
  ADMIN_LIST_MAX_SIZE,
  toQueryBoolean,
} from './admin-user-list-query.dto';

/** A repeatable query param arrives as a single value or an array; normalise to an array. */
const toArray = ({ value }: { value: unknown }): unknown => {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
};

/**
 * Query for `GET /v1/admin/businesses`. `q` matches name / legalName / inn / phone (case-insensitive
 * contains). `status` is repeatable (`?status=APPROVED&status=DRAFT`) and every parameter is optional;
 * absent `page`/`size` default to 1/20 (max size 100).
 */
export class AdminBusinessListQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search over name / legalName / inn / phone.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Keep only businesses of this owner.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({
    enum: BusinessStatus,
    enumName: 'BusinessStatusDto',
    isArray: true,
    description: 'Repeatable — keep businesses in any of these statuses (admin sees ARCHIVED too).',
  })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(BusinessStatus, { each: true })
  status?: BusinessStatus[];

  @ApiPropertyOptional({ description: 'Business type key (FK to business_types).' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Keep businesses with at least one branch in this region.' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: 'Keep only online-only (or only physical) businesses.' })
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  isOnlineOnly?: boolean;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusive lower bound on `createdAt` (ISO-8601).',
    example: '2026-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusive upper bound on `createdAt` (ISO-8601).',
    example: '2026-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({
    enum: AdminBusinessSort,
    enumName: 'AdminBusinessSortDto',
    default: AdminBusinessSort.NEWEST,
    description: '`NEWEST` (default) / `OLDEST` by createdAt, `NAME` alphabetical.',
  })
  @IsOptional()
  @IsEnum(AdminBusinessSort)
  sort?: AdminBusinessSort;

  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    default: ADMIN_LIST_DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    minimum: 1,
    maximum: ADMIN_LIST_MAX_SIZE,
    default: ADMIN_LIST_DEFAULT_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_MAX_SIZE)
  size?: number;

  toFilter(): AdminBusinessListFilter {
    return {
      q: this.q ?? null,
      ownerId: this.ownerId ?? null,
      statuses: this.status ?? [],
      type: this.type ?? null,
      regionId: this.regionId ?? null,
      isOnlineOnly: this.isOnlineOnly ?? null,
      createdFrom: this.createdFrom === undefined ? null : new Date(this.createdFrom),
      createdTo: this.createdTo === undefined ? null : new Date(this.createdTo),
      sort: this.sort ?? AdminBusinessSort.NEWEST,
      page: this.page ?? ADMIN_LIST_DEFAULT_PAGE,
      size: this.size ?? ADMIN_LIST_DEFAULT_SIZE,
    };
  }
}
