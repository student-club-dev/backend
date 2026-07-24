import { ApiProperty } from '@nestjs/swagger';
import { ListingPage } from '../../domain/listing.repository';
import { ListingDto } from './listing.dto';

/**
 * ListingPageDto — a page of listings (matches elon-uz.json's `ListingPageDto` and the CLAUDE.md
 * pagination envelope: `items`, `page`, `size`, `total`, `hasNext`). `page`/`size` echo the request.
 */
export class ListingPageDto {
  @ApiProperty({ type: [ListingDto] })
  items!: ListingDto[];

  @ApiProperty({ format: 'int32', example: 1 })
  page!: number;

  @ApiProperty({ format: 'int32', example: 20 })
  size!: number;

  @ApiProperty({ format: 'int64', example: 42 })
  total!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  static fromPage(page: ListingPage, pageNumber: number, size: number): ListingPageDto {
    const dto = new ListingPageDto();
    dto.items = page.items.map(ListingDto.fromDomain);
    dto.page = pageNumber;
    dto.size = size;
    dto.total = page.total;
    dto.hasNext = pageNumber * size < page.total;
    return dto;
  }
}
