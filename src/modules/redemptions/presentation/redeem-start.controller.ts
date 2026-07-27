import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiCreatedEnvelope,
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { RedemptionsService } from '../application/redemptions.service';
import { StartRedemptionResponseDto } from './dto/start-redemption.dto';

/**
 * Student-side redemption start — issues a single-use code the app shows as a QR (or text) for the
 * cashier to verify/confirm. Students only. Served under `/v1`. (Not in the OpenAPI spec — the app
 * needs a way to obtain the code; deliberate deviation, like auth.)
 */
@ApiTags('Discounts (student feed)')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@ApiParam({ name: 'listingId', description: 'Listing id' })
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('listings')
export class RedeemStartController {
  constructor(private readonly redemptions: RedemptionsService) {}

  @Post(':listingId/redeem/start')
  @ApiOperation({
    summary: 'Start a redemption — issue a single-use code',
    description:
      'The listing must be ACTIVE and within the redemption limits. Reuses an unexpired PENDING code.',
  })
  @ApiCreatedEnvelope(StartRedemptionResponseDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.LISTING_NOT_ACTIVE,
    'The listing is not ACTIVE.',
    'E’lon faol emas',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.REDEMPTION_LIMIT_REACHED,
    'The per-user or total limit is reached.',
    'Chegirma limiti tugagan',
  )
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
  ): Promise<StartRedemptionResponseDto> {
    return StartRedemptionResponseDto.fromResult(await this.redemptions.start(user, listingId));
  }
}
