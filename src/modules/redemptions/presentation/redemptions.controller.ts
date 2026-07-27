import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BusinessAccountGuard } from '../../business/presentation/guards/business-account.guard';
import { RedemptionsService } from '../application/redemptions.service';
import { RedemptionDto, RedemptionPageDto } from './dto/redemption.dto';
import {
  ConfirmRedemptionRequestDto,
  VerifyRedemptionRequestDto,
} from './dto/redemption-requests.dto';
import { RedemptionsQueryDto } from './dto/redemptions-query.dto';
import { VerifyRedemptionResponseDto } from './dto/verify-redemption.dto';

/**
 * Cashier / owner side of redemption (DISCOUNTS_BUSINESS_API §5.6): verify a code, confirm it, and
 * read the history. The cashier is the business owner; the listing's business must belong to the
 * caller. Served under `/v1`.
 */
@ApiTags('Redemptions')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope(
  'The caller is not a BUSINESS account, or the listing belongs to another owner.',
)
@ApiParam({ name: 'listingId', description: 'Listing id' })
@UseGuards(JwtAuthGuard, BusinessAccountGuard)
@Controller('listings')
export class RedemptionsController {
  constructor(private readonly redemptions: RedemptionsService) {}

  @Post(':listingId/redeem/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify a QR/promo code (cashier)',
    description: 'Soft check — always 200 with `isValid` and, on failure, `invalidReason`.',
  })
  @ApiOkEnvelope(VerifyRedemptionResponseDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  @ApiValidationEnvelope()
  async verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Body() dto: VerifyRedemptionRequestDto,
  ): Promise<VerifyRedemptionResponseDto> {
    return VerifyRedemptionResponseDto.fromResult(
      await this.redemptions.verify(user, listingId, dto.code),
    );
  }

  @Post(':listingId/redeem/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark a discount as redeemed (cashier)',
    description:
      'PENDING → CONFIRMED, increments `usedCount`. A second confirm → ALREADY_REDEEMED.',
  })
  @ApiOkEnvelope(RedemptionDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.REDEMPTION_INVALID_CODE,
    'Unknown or expired code.',
    'Kod noto‘g‘ri',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.ALREADY_REDEEMED,
    'Already redeemed.',
    'Kod allaqachon ishlatilgan',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.REDEMPTION_LIMIT_REACHED,
    'Per-user or total limit reached.',
    'Chegirma limiti tugagan',
  )
  @ApiValidationEnvelope('Invalid body, or a branch not belonging to this business.')
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Body() dto: ConfirmRedemptionRequestDto,
  ): Promise<RedemptionDto> {
    return RedemptionDto.fromView(await this.redemptions.confirm(user, listingId, dto.toInput()));
  }

  @Get(':listingId/redemptions')
  @ApiOperation({ summary: 'Who redeemed the discount and when' })
  @ApiOkEnvelope(RedemptionPageDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Query() query: RedemptionsQueryDto,
  ): Promise<RedemptionPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const result = await this.redemptions.listByListing(user, listingId, page, size);
    return RedemptionPageDto.fromPage(result, page, size);
  }
}
