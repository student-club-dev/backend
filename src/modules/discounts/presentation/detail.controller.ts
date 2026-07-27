import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { OptionalJwtAuthGuard } from '../../../common/guards/optional-jwt-auth.guard';
import {
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { DetailService } from '../application/detail.service';
import { DetailRequestDto } from './dto/detail-request.dto';
import { ListingDetailDto } from './dto/listing-detail.dto';

/**
 * The student feed's detail screen. Auth is optional (D5): anyone may open a listing, a signed-in
 * student additionally gets `isFavorite`, the promo code and their remaining redemptions. An
 * invalid or expired token is still rejected rather than silently downgraded to anonymous.
 */
@ApiTags('Discounts (student feed)')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(OptionalJwtAuthGuard)
@Controller('discounts')
export class DetailController {
  constructor(private readonly detailService: DetailService) {}

  @Post('detail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'One listing in full',
    description:
      'Everything the feed card shows, plus the description, all images, all branches with their opening hours, the option groups and the redemption block. The listing id travels in the body (Q2). Opening a listing counts one view per student per hour; anonymous requests do not count.',
  })
  @ApiOkEnvelope(ListingDetailDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.LISTING_NOT_FOUND,
    'No visible listing with this id — it may be missing, not ACTIVE, outside its validity window, or belong to a business that is not APPROVED. The response never says which.',
    'E’lon topilmadi',
  )
  @ApiValidationEnvelope()
  async getDetail(
    @Body() body: DetailRequestDto,
    @Req() request: Request & { user?: AuthenticatedUser },
  ): Promise<ListingDetailDto> {
    const detail = await this.detailService.getDetail({
      listingId: body.listingId,
      geo: body.geo?.toDomain() ?? null,
      viewer: request.user ?? null,
    });
    return ListingDetailDto.fromDomain(detail);
  }
}
