import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiCreatedEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BusinessAccountGuard } from '../../business/presentation/guards/business-account.guard';
import { ListingsService } from '../application/listings.service';
import { CreateListingRequestDto } from './dto/create-listing-request.dto';
import { ListingDto } from './dto/listing.dto';

/**
 * Owner-side listing creation, nested under a business. JWT-guarded and restricted to BUSINESS
 * accounts (a student token → 403); the caller must own the business. Create persists the whole
 * aggregate as DRAFT. Served under the `/v1` prefix. Submit and the rest arrive in a later phase.
 */
@ApiTags('Listings')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope(
  'The caller is not a BUSINESS account, or the business belongs to another owner.',
)
@UseGuards(JwtAuthGuard, BusinessAccountGuard)
@ApiParam({ name: 'businessId', description: 'Business id' })
@Controller('business/:businessId/listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a listing (owner only)',
    description:
      'Created as DRAFT. `finalPrice` is computed server-side; `status`, `usedCount` and `viewsCount` are server-owned.',
  })
  @ApiCreatedEnvelope(ListingDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_NOT_FOUND,
    'No business with this id.',
    'Biznes topilmadi',
  )
  @ApiValidationEnvelope(
    'Invalid body — field validation, category not in the catalog for the business type ' +
      '(`INVALID_CATEGORY_FOR_TYPE`), discount above 90% (`DISCOUNT_TOO_HIGH`), finalPrice not ' +
      'below originalPrice (`FINAL_PRICE_INVALID`), or attributes not matching the catalog schema ' +
      '(`ATTRIBUTES_SCHEMA_MISMATCH`).',
  )
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreateListingRequestDto,
  ): Promise<ListingDto> {
    const listing = await this.listingsService.create(user, businessId, dto.toInput());
    return ListingDto.fromDomain(listing);
  }
}
