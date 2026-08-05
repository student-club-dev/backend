import { ApiProperty } from '@nestjs/swagger';
import { StudentListingDto } from '../../../student-listings/presentation/dto/student-listing.dto';
import { AdminStudentListingPage } from '../../domain/admin-student-listing-read.repository';

/**
 * `GET /v1/admin/student-listings` payload — the platform's standard page shape
 * (`items`/`page`/`size`/`total`/`hasNext`), not a bespoke one.
 */
export class AdminStudentListingPageDto {
  @ApiProperty({ type: [StudentListingDto] })
  items!: StudentListingDto[];

  @ApiProperty({ type: 'integer', format: 'int32' })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  total!: number;

  @ApiProperty({ type: Boolean })
  hasNext!: boolean;

  static from(
    result: AdminStudentListingPage,
    page: number,
    size: number,
  ): AdminStudentListingPageDto {
    const dto = new AdminStudentListingPageDto();
    // The viewer id is the admin, who owns none of these — passing an empty string keeps every
    // viewer-relative flag off, which is the honest answer for a moderation view.
    dto.items = result.items.map((listing) => StudentListingDto.fromEntity(listing, ''));
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
