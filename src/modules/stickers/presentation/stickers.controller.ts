import { Controller, Get, Headers, Inject, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiForbiddenEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { STICKER_REPOSITORY, StickerRepository } from '../domain/sticker.repository';
import { StickerPacksDto } from './dto/sticker.dto';

/** Sticker catalogue (chat media spec §4.2). Students only. */
@ApiTags('Chat')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('stickers')
export class StickersController {
  constructor(@Inject(STICKER_REPOSITORY) private readonly stickers: StickerRepository) {}

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
}
