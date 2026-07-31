import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { STICKER_PROVIDER, StickerProviderAdapter } from '../domain/sticker-provider.port';
import { STICKER_REPOSITORY, StickerRepository } from '../domain/sticker.repository';
import {
  StickerSearchQueryDto,
  StickerSearchResponseDto,
  StickerShareDto,
} from './dto/sticker-search.dto';
import { StickerPacksDto } from './dto/sticker.dto';

/**
 * Stickers — our seeded catalogue (`/packs`) and the proxied provider catalogue (`/search`).
 *
 * Two sources, because they answer different needs: the catalogue is emoji-shaped and works offline
 * once cached, while search is where the character stickers people actually go looking for live.
 * Students only.
 */
@ApiTags('Chat')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('stickers')
export class StickersController {
  constructor(
    @Inject(STICKER_REPOSITORY) private readonly stickers: StickerRepository,
    @Inject(STICKER_PROVIDER) private readonly provider: StickerProviderAdapter,
  ) {}

  @Get('packs')
  @ApiOperation({
    summary: 'Every sticker pack, with its stickers',
    description:
      'The whole catalogue in one response (~200 KB) — cache it. Send the previous `ETag` back as ' +
      '`If-None-Match` and an unchanged catalogue answers `304` with no body.',
  })
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'A previously received `ETag`.',
  })
  @ApiOkEnvelope(StickerPacksDto)
  @ApiResponse({ status: 304, description: 'Catalogue unchanged; no body.' })
  async packs(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StickerPacksDto> {
    const catalogue = await this.stickers.catalogue();
    const etag = `W/"stickers-${catalogue.version}"`;
    response.setHeader('ETag', etag);

    if (ifNoneMatch === etag) {
      // Node strips the body from a 304 by itself, so the response interceptor can still wrap the
      // payload as usual — nothing is sent, and the envelope stays consistent for the 200 path.
      response.status(304);
    }
    return StickerPacksDto.fromDomain(catalogue);
  }

  @Get('search')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Search provider stickers (or the trending list when `q` is empty)',
    description:
      'Millions of transparent, animated stickers from the provider catalogue — the character ' +
      'stickers `GET /v1/stickers/packs` does not carry. Results are **WebP**, not MP4: MP4 has no ' +
      'alpha channel and would render the sticker as a white square. Post one by sending the whole ' +
      'item back as `SendMessageDto.sticker`; it has no `mediaId`, because provider terms forbid ' +
      're-hosting their files. Show the attribution badge the `provider` field names.',
  })
  @ApiOkEnvelope(StickerSearchResponseDto)
  @ApiErrorEnvelope(
    429,
    ERROR_CODE.STICKER_PROVIDER_RATE_LIMITED,
    'The provider’s quota is spent — retry shortly. Distinct from our own 60/min per-user limit.',
  )
  @ApiErrorEnvelope(502, ERROR_CODE.STICKER_PROVIDER_ERROR, 'The provider did not answer.')
  @ApiErrorEnvelope(
    503,
    ERROR_CODE.STICKER_PROVIDER_ERROR,
    'No provider API key is configured on this deployment (`KLIPY_API_KEY`). `GET /packs` is ' +
      'unaffected — the seeded catalogue keeps working.',
  )
  async search(@Query() query: StickerSearchQueryDto): Promise<StickerSearchResponseDto> {
    const page = await this.provider.search(
      query.q ?? '',
      query.limit ?? 30,
      query.pos ?? null,
      query.locale ?? 'uz_UZ',
    );
    return StickerSearchResponseDto.fromDomain(page);
  }

  @Post(':id/share')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Tell the provider a search result was shared',
    description:
      'What makes their ranking improve, and required by some providers’ terms. A no-op for ' +
      'providers without such an endpoint. Best-effort — this never fails your send. Only for ' +
      'search results; a sticker from `/packs` has nothing to report.',
  })
  @ApiParam({ name: 'id', description: 'The `id` of the chosen search result' })
  @ApiOkEnvelope(undefined, 'Recorded; `result` is null.')
  async share(@Param('id') id: string, @Body() dto: StickerShareDto): Promise<void> {
    await this.provider.registerShare(id, dto.q ?? null);
  }
}
