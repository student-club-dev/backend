import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiErrorEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { StudentListingDto } from '../../student-listings/presentation/dto/student-listing.dto';
import { AdminStudentListingsService } from '../application/admin-student-listings.service';
import { AdminStudentListingQueryDto } from './dto/admin-student-listing-query.dto';
import { AdminStudentListingPageDto } from './dto/admin-student-listing-page.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

/**
 * Cross-owner administration of **student** listings (admin-panel 15-deletion.md §5.2).
 *
 * ⚠️ Student listings never pass through moderation — they publish the moment they are submitted
 * (`student-listings.service.ts`) — so there is no `approve` or `reject` here and there will not
 * be. Removing a listing is the only lever, which is why this surface existing at all matters more
 * than the rest of the deletion work: until it did, an inappropriate student listing could not be
 * taken down by anyone.
 *
 * ADMIN and MODERATOR both: this is everyday moderation, and it is soft — nothing is erased.
 */
@ApiTags('Admin — Student listings')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(AdminJwtGuard)
@Controller('admin/student-listings')
export class AdminStudentListingsController {
  constructor(private readonly service: AdminStudentListingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Talaba e’lonlari ro‘yxati',
    description:
      'Every owner’s listings, newest first. Unlike the student-facing search this shows **every** ' +
      'status — DRAFT and ARCHIVED included — because those are exactly the ones worth looking at ' +
      'when something has been reported.',
  })
  @ApiOkEnvelope(AdminStudentListingPageDto)
  @ApiValidationEnvelope()
  async list(@Query() query: AdminStudentListingQueryDto): Promise<AdminStudentListingPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const result = await this.service.list({
      q: query.q ?? null,
      kind: query.kind ?? null,
      statuses: query.status ?? [],
      ownerId: query.ownerId ?? null,
      includeDeleted: query.includeDeleted ?? false,
      page,
      size,
    });
    return AdminStudentListingPageDto.from(result, page, size);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Talaba e’loni — batafsil',
    description:
      'Whatever its status, **soft-deleted included** — an admin following a link from a report ' +
      'must still be able to open a listing whose owner deleted it in the meantime.',
  })
  @ApiParam({ name: 'id', description: 'Listing id' })
  @ApiOkEnvelope(StudentListingDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  async getById(@Param('id') id: string): Promise<StudentListingDto> {
    return StudentListingDto.fromEntity(await this.service.getById(id), '');
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Talaba e’lonini o‘chirish',
    description:
      'Soft-delete — the same `deletedAt` the owner’s own `DELETE /v1/student-listings/:id` ' +
      'writes, so the two produce one state rather than two that have to be kept in step. The row ' +
      'and its view counts stay. ADMIN and MODERATOR.',
  })
  @ApiParam({ name: 'id', description: 'Listing id' })
  @ApiOkEnvelope(StudentListingDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.INVALID_STATUS_TRANSITION,
    'The listing is already deleted.',
    'Bu e’lon allaqachon o‘chirilgan',
  )
  async remove(@Param('id') id: string): Promise<StudentListingDto> {
    return StudentListingDto.fromEntity(await this.service.remove(id), '');
  }
}
