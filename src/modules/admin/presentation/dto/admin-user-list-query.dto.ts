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
import { AdminUserSort } from '../../domain/enums/admin-user-sort.enum';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';

export const ADMIN_LIST_DEFAULT_PAGE = 1;
export const ADMIN_LIST_DEFAULT_SIZE = 20;
export const ADMIN_LIST_MAX_SIZE = 100;

/** Query-string booleans arrive as strings; map `true`/`false` and let `@IsBoolean` reject the rest. */
export const toQueryBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) {
    return true;
  }
  if (value === 'false' || value === false) {
    return false;
  }
  return value;
};

/**
 * Shared query for the admin cross-user lists — the filters students and business owners have in
 * common. Every parameter is optional; absent `page`/`size` default to 1/20 (max size 100). The
 * concrete subclass adds its entity-specific filters and a `toFilter()` mapping to the domain type.
 */
export abstract class AdminUserListQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search (case-insensitive contains).' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    enum: AdminUserStatus,
    enumName: 'AdminUserStatusDto',
    description: 'Keep only accounts in this lifecycle state (ACTIVE / BANNED / DELETED).',
  })
  @IsOptional()
  @IsEnum(AdminUserStatus)
  status?: AdminUserStatus;

  @ApiPropertyOptional({ description: 'Keep only accounts whose phone is (un)verified.' })
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  phoneVerified?: boolean;

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
    enum: AdminUserSort,
    enumName: 'AdminUserSortDto',
    default: AdminUserSort.NEWEST,
    description: '`NEWEST` = newest accounts first (default). `OLDEST` = oldest first.',
  })
  @IsOptional()
  @IsEnum(AdminUserSort)
  sort?: AdminUserSort;

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

  protected pageOrDefault(): number {
    return this.page ?? ADMIN_LIST_DEFAULT_PAGE;
  }

  protected sizeOrDefault(): number {
    return this.size ?? ADMIN_LIST_DEFAULT_SIZE;
  }

  protected sortOrDefault(): AdminUserSort {
    return this.sort ?? AdminUserSort.NEWEST;
  }

  protected createdFromDate(): Date | null {
    return this.createdFrom === undefined ? null : new Date(this.createdFrom);
  }

  protected createdToDate(): Date | null {
    return this.createdTo === undefined ? null : new Date(this.createdTo);
  }
}
