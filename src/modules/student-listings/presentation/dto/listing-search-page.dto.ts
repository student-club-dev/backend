import { ApiProperty } from '@nestjs/swagger';
import type { SearchResult } from '../../application/student-listing-search.service';
import { StudentListingDto } from './student-listing.dto';

/**
 * §7.2.2 — the feed response, in whichever paging mode the request used.
 *
 * `page` and `total` are filled only in page-number mode. In cursor mode both are null: the
 * infinite scroll drives off `hasNext`, and on a growing table that `COUNT(*)` would be the most
 * expensive part of an otherwise cheap query.
 */
export class ListingSearchPageDto {
  @ApiProperty({ type: [StudentListingDto] }) items!: StudentListingDto[];
  @ApiProperty({ type: 'integer' }) size!: number;
  @ApiProperty({ type: Boolean }) hasNext!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Kursorli rejimda keyingi sahifa uchun; oxirgi sahifada yoki sahifa raqamli rejimda null',
  })
  nextCursor!: string | null;

  @ApiProperty({ type: 'integer', nullable: true, description: 'Sahifa raqamli rejimda' })
  page!: number | null;

  @ApiProperty({ type: 'integer', nullable: true, description: 'Sahifa raqamli rejimda' })
  total!: number | null;

  static from(result: SearchResult, viewerId: string): ListingSearchPageDto {
    const dto = new ListingSearchPageDto();
    dto.items = result.items.map((item) => {
      const listing = StudentListingDto.fromEntity(item.listing, viewerId);
      // Only the feed knows this: it is computed by the ranking query, not stored on the listing.
      listing.distanceMeters = item.distanceMeters;
      return listing;
    });
    dto.size = result.size;
    dto.hasNext = result.hasNext;
    dto.nextCursor = result.nextCursor;
    dto.page = result.page;
    dto.total = result.total;
    return dto;
  }
}
