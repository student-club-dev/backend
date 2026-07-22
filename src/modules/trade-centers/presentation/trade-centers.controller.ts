import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { TradeCentersService } from '../application/trade-centers.service';
import { TradeCenterDetailDto } from './dto/trade-center-detail.dto';
import { TradeCenterDto } from './dto/trade-center.dto';

/**
 * Trade-center reference data (savdo markazlari). Read-only and JWT-guarded; the frontend builds
 * the branch dynamic form from the field definitions. Served under the `/v1` prefix.
 */
@ApiTags('Trade Centers')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(JwtAuthGuard)
@Controller('trade-centers')
export class TradeCentersController {
  constructor(private readonly tradeCentersService: TradeCentersService) {}

  @Get()
  @ApiOperation({
    summary: 'List trade centers',
    description: 'ACTIVE centers only, ordered by sortOrder then name.',
  })
  @ApiOkEnvelope([TradeCenterDto])
  async list(): Promise<TradeCenterDto[]> {
    const centers = await this.tradeCentersService.list();
    return centers.map(TradeCenterDto.fromDomain);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a trade center with its fields',
    description: 'One ACTIVE center and its dynamic fields (ordered by sortOrder).',
  })
  @ApiParam({ name: 'id', description: 'Trade center id', example: 'tc_abusaxiy' })
  @ApiOkEnvelope(TradeCenterDetailDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.TRADE_CENTER_NOT_FOUND,
    'No trade center with this id, or it is not ACTIVE.',
    'Savdo markazi topilmadi',
  )
  async get(@Param('id') id: string): Promise<TradeCenterDetailDto> {
    const center = await this.tradeCentersService.get(id);
    return TradeCenterDetailDto.fromDomain(center);
  }
}
