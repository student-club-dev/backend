import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { StudentListingPage } from '../../domain/student-listing.repository';
import { StudentListingDto } from './student-listing.dto';

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;

/**
 * Paging for `GET /mine` (§7.2.2). An oversized `size` is clamped rather than rejected — the app
 * asking for too much is not a client error worth failing a screen over.
 */
export class OwnListingsQueryDto {
  @ApiPropertyOptional({ default: PAGE_SIZE_DEFAULT, maximum: PAGE_SIZE_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_SIZE_MAX)
  size?: number;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

/**
 * Exactly the keys the contract names: `items`, `page`, `size`, `total`, `hasNext` — not
 * `pageSize`/`hasMore`. The counters say `integer` so the Kotlin client does not receive them as
 * `Double`.
 */
export class StudentListingPageDto {
  @ApiProperty({ type: [StudentListingDto] }) items!: StudentListingDto[];
  @ApiProperty({ type: 'integer' }) page!: number;
  @ApiProperty({ type: 'integer' }) size!: number;
  @ApiProperty({ type: 'integer' }) total!: number;
  @ApiProperty({ type: Boolean }) hasNext!: boolean;

  static from(
    result: StudentListingPage,
    page: number,
    size: number,
    viewerId: string,
  ): StudentListingPageDto {
    const dto = new StudentListingPageDto();
    dto.items = result.items.map((listing) => StudentListingDto.fromEntity(listing, viewerId));
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
