import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { ListingStatsDto } from '../../listings/presentation/dto/listing-stats.dto';
import { UpdateListingRequestDto } from '../../listings/presentation/dto/update-listing-request.dto';
import { AdminListingsWriteService } from '../application/admin-listings-write.service';
import { AdminListingsService } from '../application/admin-listings.service';
import { AdminListingListQueryDto } from './dto/admin-listing-list-query.dto';
import { AdminListingDto, AdminListingPageDto } from './dto/admin-listing.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

/**
 * Admin cross-business listing reads (Faza 1) — the panel's "see every listing" view, ownership
 * bypassed (every status included). Accessible to both ADMIN and MODERATOR, so guarded by
 * AdminJwtGuard only (no `@Roles` restriction). Served under `/v1`.
 */
@ApiTags('Admin — Listings')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(AdminJwtGuard)
@Controller('admin/listings')
export class AdminListingsController {
  constructor(
    private readonly adminListingsService: AdminListingsService,
    private readonly adminListingsWriteService: AdminListingsWriteService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all listings (filter + pagination)',
    description:
      '`q` matches title / description (case-insensitive contains). `status` is repeatable; the ' +
      'admin sees every status (DRAFT / PENDING_REVIEW / REJECTED / ARCHIVED included).',
  })
  @ApiOkEnvelope(AdminListingPageDto)
  @ApiValidationEnvelope()
  async list(@Query() query: AdminListingListQueryDto): Promise<AdminListingPageDto> {
    const filter = query.toFilter();
    const page = await this.adminListingsService.list(filter);
    return AdminListingPageDto.fromPage(page, filter.page, filter.size);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one listing by id (full record + business name, any status)' })
  @ApiParam({ name: 'id', description: 'Listing id' })
  @ApiOkEnvelope(AdminListingDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  async getById(@Param('id') id: string): Promise<AdminListingDto> {
    const listing = await this.adminListingsService.getById(id);
    return AdminListingDto.fromDomain(listing);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get one listing’s analytics (owner stats, ownership bypassed)' })
  @ApiParam({ name: 'id', description: 'Listing id' })
  @ApiOkEnvelope(ListingStatsDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  async stats(@Param('id') id: string): Promise<ListingStatsDto> {
    const result = await this.adminListingsService.stats(id);
    return ListingStatsDto.fromResult(result);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Edit any listing (ADMIN or MODERATOR)',
    description:
      'Owner-scoping bypassed; full-replace with the same validation as the owner update — ' +
      '`finalPrice` is recomputed and the catalog / attribute / discount rules are re-checked.',
  })
  @ApiParam({ name: 'id', description: 'Listing id' })
  @ApiOkEnvelope(AdminListingDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateListingRequestDto,
  ): Promise<AdminListingDto> {
    const listing = await this.adminListingsWriteService.update(id, body.toInput());
    return AdminListingDto.fromDomain(listing);
  }
}
