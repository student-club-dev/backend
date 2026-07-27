import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiCreatedEnvelope,
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BusinessAccountGuard } from '../../business/presentation/guards/business-account.guard';
import { ListingsService } from '../application/listings.service';
import { ListingDto } from './dto/listing.dto';
import { ListingStatsDto } from './dto/listing-stats.dto';
import { UpdateListingRequestDto } from './dto/update-listing-request.dto';

/**
 * Owner-side operations on a single listing by id (`/listings/{listingId}`). JWT-guarded and
 * restricted to BUSINESS accounts (a student token → 403); the caller must own the listing's
 * business. Edit is a full replace; DELETE archives (soft-delete). An ARCHIVED listing is treated
 * as deleted (404). Served under the `/v1` prefix.
 */
@ApiTags('Listings')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope(
  'The caller is not a BUSINESS account, or the listing belongs to another owner.',
)
@ApiParam({ name: 'listingId', description: 'Listing id' })
@UseGuards(JwtAuthGuard, BusinessAccountGuard)
@Controller('listings')
export class ListingController {
  constructor(private readonly listingsService: ListingsService) {}

  @Put(':listingId')
  @ApiOperation({
    summary: 'Update a listing (owner only)',
    description:
      'Full replace. `finalPrice` is recomputed server-side; `status`, `currency`, `usedCount` and ' +
      '`viewsCount` are preserved. Re-validated exactly like create.',
  })
  @ApiOkEnvelope(ListingDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  @ApiValidationEnvelope(
    'Invalid body — the same rules as create (category, discount, finalPrice, attributes, options).',
  )
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Body() dto: UpdateListingRequestDto,
  ): Promise<ListingDto> {
    const listing = await this.listingsService.update(user, listingId, dto.toInput());
    return ListingDto.fromDomain(listing);
  }

  @Delete(':listingId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Archive a listing (owner only)',
    description:
      'Soft-delete: the listing becomes ARCHIVED and drops out of the list. `result` is null.',
  })
  @ApiOkEnvelope(undefined, 'Archived; `result` is null.')
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
  ): Promise<void> {
    await this.listingsService.archive(user, listingId);
  }

  @Post(':listingId/pause')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pause a listing (ACTIVE → PAUSED)' })
  @ApiOkEnvelope(ListingDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.INVALID_STATUS_TRANSITION,
    'The listing is not ACTIVE.',
    'E’lon holatini o‘zgartirib bo‘lmaydi',
  )
  async pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
  ): Promise<ListingDto> {
    const listing = await this.listingsService.pause(user, listingId);
    return ListingDto.fromDomain(listing);
  }

  @Post(':listingId/activate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Resume a listing (PAUSED → ACTIVE)',
    description: 'Goes to SCHEDULED instead when `validFrom` is still in the future.',
  })
  @ApiOkEnvelope(ListingDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.INVALID_STATUS_TRANSITION,
    'The listing is not PAUSED.',
    'E’lon holatini o‘zgartirib bo‘lmaydi',
  )
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
  ): Promise<ListingDto> {
    const listing = await this.listingsService.activate(user, listingId);
    return ListingDto.fromDomain(listing);
  }

  @Post(':listingId/withdraw')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Withdraw a listing from review (PENDING_REVIEW → DRAFT)',
    description: 'Returns the listing to a draft so the owner can edit and resubmit it.',
  })
  @ApiOkEnvelope(ListingDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.INVALID_STATUS_TRANSITION,
    'The listing is not PENDING_REVIEW.',
    'E’lon holatini o‘zgartirib bo‘lmaydi',
  )
  async withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
  ): Promise<ListingDto> {
    const listing = await this.listingsService.withdraw(user, listingId);
    return ListingDto.fromDomain(listing);
  }

  @Post(':listingId/duplicate')
  @ApiOperation({
    summary: 'Duplicate a listing',
    description:
      'Clones the content into a fresh DRAFT (`usedCount`/`viewsCount` reset). Used to re-publish an ' +
      'EXPIRED/SOLD_OUT offer.',
  })
  @ApiCreatedEnvelope(ListingDto, 'The new draft copy.')
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  async duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
  ): Promise<ListingDto> {
    const listing = await this.listingsService.duplicate(user, listingId);
    return ListingDto.fromDomain(listing);
  }

  @Get(':listingId/stats')
  @ApiOperation({ summary: 'Get listing statistics (owner only)' })
  @ApiOkEnvelope(ListingStatsDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  async stats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
  ): Promise<ListingStatsDto> {
    const result = await this.listingsService.stats(user, listingId);
    return ListingStatsDto.fromResult(result);
  }
}
