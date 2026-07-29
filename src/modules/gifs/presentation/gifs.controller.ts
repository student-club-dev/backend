import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { GIF_PROVIDER, GifProviderAdapter } from '../domain/gif-provider.port';
import { GifSearchQueryDto, GifShareDto } from './dto/gif-query.dto';
import { GifSearchResponseDto } from './dto/gif.dto';

/**
 * GIF search, proxied (chat media spec §4.6). The provider API key stays on the server — shipping it
 * in the app would put it one decompile away from anyone.
 */
@ApiTags('Chat')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('gifs')
export class GifsController {
  constructor(@Inject(GIF_PROVIDER) private readonly gifs: GifProviderAdapter) {}

  @Get('search')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Search GIFs (or the featured list when `q` is empty)',
    description:
      'Results carry the **MP4** rendition, not the `.gif` — the same animation is roughly 20× the ' +
      'bytes as a GIF. Play them muted and looping. Show the attribution badge the `provider` field ' +
      'names — "Powered by KLIPY" today — their terms require it.',
  })
  @ApiOkEnvelope(GifSearchResponseDto)
  @ApiErrorEnvelope(
    429,
    ERROR_CODE.GIF_PROVIDER_RATE_LIMITED,
    'The provider’s quota is spent — retry shortly. Distinct from our own 60/min per-user limit.',
  )
  @ApiErrorEnvelope(502, ERROR_CODE.GIF_PROVIDER_ERROR, 'The provider did not answer.')
  @ApiErrorEnvelope(
    503,
    ERROR_CODE.GIF_PROVIDER_ERROR,
    'No provider API key is configured on this deployment (`GIF_PROVIDER`).',
  )
  async search(@Query() query: GifSearchQueryDto): Promise<GifSearchResponseDto> {
    const page = await this.gifs.search(
      query.q ?? '',
      query.limit ?? 30,
      query.pos ?? null,
      query.locale ?? 'uz_UZ',
    );
    return GifSearchResponseDto.fromDomain(page);
  }

  @Post(':id/share')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Tell the provider a result was shared',
    description:
      'Required by some providers terms and what makes their ranking improve. A no-op for providers ' +
      'without such an endpoint. Best-effort — this never fails your send.',
  })
  @ApiParam({ name: 'id', description: 'The `id` of the chosen search result' })
  @ApiOkEnvelope(undefined, 'Recorded; `result` is null.')
  async share(@Param('id') id: string, @Body() dto: GifShareDto): Promise<void> {
    await this.gifs.registerShare(id, dto.q ?? null);
  }
}
