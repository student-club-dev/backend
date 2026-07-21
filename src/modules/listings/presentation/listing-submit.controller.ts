import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BusinessAccountGuard } from '../../business/presentation/guards/business-account.guard';
import { ListingsService } from '../application/listings.service';
import { ListingDto } from './dto/listing.dto';

/**
 * Owner-side listing submission. Not nested under `/business/:id` — ownership is resolved from the
 * listing's own `businessId`. JWT-guarded and restricted to BUSINESS accounts (a student token →
 * 403). Re-validates the publish gates (LISTINGS.md §10) and transitions DRAFT → PENDING_REVIEW.
 * Served under the `/v1` prefix.
 */
@ApiTags('Listings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccountGuard)
@Controller('listings')
export class ListingSubmitController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post(':listingId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a listing for review (owner only)',
    description:
      'DRAFT → PENDING_REVIEW. Re-validates every publish gate independently: the business is APPROVED, it has an active branch (or is online-only), at least 1 image, finalPrice < originalPrice (skipped for regular listings), validTo is in the future, the category is in the catalog for the business type, and attributes match the schema.',
  })
  @ApiParam({ name: 'listingId', description: 'Listing id' })
  @ApiOkResponse({ type: ListingDto })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
  ): Promise<ListingDto> {
    const listing = await this.listingsService.submit(user, listingId);
    return ListingDto.fromDomain(listing);
  }
}
