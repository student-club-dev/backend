import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';
import { ChatMediaService } from '../application/chat-media.service';
import type { UploadedChatFile } from '../application/chat-media.io';
import { MediaKind } from '../domain/enums/media-kind.enum';
import { MAX_UPLOAD_BYTES } from '../domain/media-limits';
import { ChatMediaStorage } from '../infrastructure/chat-media.storage';
import { AttachmentDto } from './dto/attachment.dto';

/**
 * Chat attachments (chat media spec §1). Separate from `POST /v1/media/upload`, which serves listing
 * images: different limits, and — crucially — different privacy. Nothing uploaded here is reachable
 * without a token and conversation membership.
 */
@ApiTags('Chat')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('media')
export class ChatMediaController {
  private readonly apiBase: string;

  constructor(
    private readonly media: ChatMediaService,
    private readonly storage: ChatMediaStorage,
    config: ConfigService<Env, true>,
  ) {
    this.apiBase = `/${config.get('API_PREFIX', { infer: true })}`;
  }

  @Post('chat-upload')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({
    summary: 'Upload a chat attachment',
    description:
      'multipart/form-data. `conversationId` is required and is the permission check — you must be ' +
      "a member, still connected and not blocked. The type is decided by the file's magic bytes, " +
      'never by `Content-Type` or the filename. Images are stripped of EXIF (including GPS), GIFs ' +
      'are converted to silent looping MP4, voice notes get a 48-point waveform.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file', 'kind', 'conversationId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: {
          type: 'string',
          enum: Object.values(MediaKind),
          description: 'IMAGE 12 MB · GIF 20 MB · VIDEO 64 MB · VOICE 16 MB · FILE 48 MB',
        },
        conversationId: { type: 'string' },
      },
    },
  })
  @ApiOkEnvelope(AttachmentDto)
  @ApiForbiddenEnvelope('Not a member, not connected any more, or blocked (`NOT_CONNECTED`).')
  @ApiValidationEnvelope(
    'Unknown `kind`, missing file, a type outside the allowlist (`FILE_TYPE_NOT_ALLOWED`), too ' +
      'long (`MEDIA_TOO_LONG`) or too many pixels (`MEDIA_TOO_LARGE_DIMENSIONS`).',
  )
  @ApiErrorEnvelope(413, ERROR_CODE.FILE_TOO_LARGE, 'Larger than the limit for this `kind`.')
  @ApiErrorEnvelope(429, ERROR_CODE.UPLOAD_RATE_LIMIT, '20 uploads a minute, or 500 MB a day.')
  async chatUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body('kind') kind: string,
    @Body('conversationId') conversationId: string,
    @UploadedFile() file?: UploadedChatFile,
  ): Promise<AttachmentDto> {
    if (!isMediaKind(kind)) {
      throw AppException.validation({ kind: 'IMAGE, GIF, VIDEO, VOICE yoki FILE bo‘lishi kerak' });
    }
    if (typeof conversationId !== 'string' || conversationId.length === 0) {
      throw AppException.validation({ conversationId: 'Suhbat id sini yuboring' });
    }
    const asset = await this.media.upload(user, { kind, conversationId, file });
    return AttachmentDto.fromDomain(asset, this.apiBase);
  }

  @Get(':id/raw')
  @ApiOperation({
    summary: 'Download a chat attachment',
    description:
      'Streams the bytes after checking that you are a member of the conversation it belongs to. ' +
      'Chat media is never on a public path — a leaked link is useless without a token.',
  })
  @ApiQuery({ name: 'variant', required: false, enum: ['full', 'thumb'] })
  @ApiNotFoundEnvelope(
    ERROR_CODE.MEDIA_NOT_FOUND,
    'No such attachment, or not in a conversation you belong to.',
    'Fayl topilmadi',
  )
  async raw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('variant') variant: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const asset = await this.media.findForMember(id, user.id);
    const wantsThumb = variant === 'thumb';
    const key = wantsThumb ? asset.thumbStorageKey : asset.storageKey;
    if (key === null) {
      throw AppException.notFound(ERROR_CODE.MEDIA_NOT_FOUND, 'Fayl topilmadi');
    }

    // Image thumbs are WebP but video and GIF posters are JPEG — claiming one type for both would
    // mislabel every video thumbnail. The stored key's extension is the source of truth.
    response.setHeader('Content-Type', wantsThumb ? thumbContentType(key) : asset.mimeType);
    // Immutable: an asset's bytes never change, so the client may cache them forever. Private:
    // it must never land in a shared cache, since the authorisation is per-user.
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    if (asset.fileName !== null && !wantsThumb) {
      // `attachment`: never let a stored document render inline in a browser.
      response.setHeader('Content-Disposition', contentDisposition(asset.fileName));
    }
    this.storage.read(key).pipe(response);
  }
}

/**
 * RFC 6266 `Content-Disposition` for a filename that may not be ASCII.
 *
 * Header values are latin-1: handing Node a Cyrillic name — or even the `ʻ` of Uzbek Latin —
 * throws `ERR_INVALID_CHAR` and turns the download into a 500. So the quoted form carries an ASCII
 * fallback and `filename*` carries the real name, percent-encoded as UTF-8.
 */
function contentDisposition(fileName: string): string {
  // eslint-disable-next-line no-control-regex
  const ascii = fileName.replace(/[^ -~]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function thumbContentType(key: string): string {
  return key.endsWith('.jpg') || key.endsWith('.jpeg') ? 'image/jpeg' : 'image/webp';
}

function isMediaKind(value: string): value is MediaKind {
  return (Object.values(MediaKind) as string[]).includes(value);
}
