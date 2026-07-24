import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ListingStatus } from '../../domain/enums/listing-status.enum';
import { ListingPageQuery } from '../../domain/listing.repository';

const DEFAULT_PAGE = 1;
const DEFAULT_SIZE = 20;
const MAX_SIZE = 100;

/**
 * ListListingsQueryDto — the query for `GET /business/{businessId}/listings` (matches elon-uz.json).
 * All filters are optional; absent `page`/`size` default to 1/20. Without `status`, ARCHIVED
 * (soft-deleted) listings are excluded — the exclusion default lives in the repository.
 */
export class ListListingsQueryDto {
  @ApiPropertyOptional({ enum: ListingStatus, enumName: 'ListingStatusDto' })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional({ example: 'PIZZA' })
  @IsOptional()
  @IsString()
  categoryKey?: string;

  @ApiPropertyOptional({ minimum: 1, default: DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_SIZE, default: DEFAULT_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SIZE)
  size?: number;

  toQuery(): ListingPageQuery {
    return {
      status: this.status ?? null,
      categoryKey: this.categoryKey ?? null,
      page: this.page ?? DEFAULT_PAGE,
      size: this.size ?? DEFAULT_SIZE,
    };
  }
}
