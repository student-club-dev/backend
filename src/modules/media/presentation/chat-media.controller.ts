import { rm } from 'fs/promises';
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
import { isChatKind, isOpaqueKind, MediaKind, MediaQuality } from '../domain/enums/media-kind.enum';
import { ChatMediaStorage } from '../infrastructure/chat-media.storage';
import { AttachmentDto } from './dto/attachment.dto';
import { applyDownloadHeaders } from './download-headers';
import { StorageSpaceGuard } from './storage-space.guard';
import { CHAT_UPLOAD_KIND_HELP, parseKind, parseQuality } from './upload-params';

/**
 * Chat attachments. Separate from `POST /v1/media/upload`, which serves listing images: different
 * rules, and — crucially — different privacy. Nothing uploaded here is reachable without a token and
 * conversation membership.
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
  @UseGuards(ThrottlerGuard, StorageSpaceGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  // No `limits.fileSize`: parity spec §2 removed the size ceiling, and the module writes uploads
  // straight to disk so a large one costs disk rather than heap. `StorageSpaceGuard` runs before
  // this interceptor and refuses the request when there is nowhere to put the bytes.
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload an attachment, profile photo or story',
    description:
      'multipart/form-data. One pipeline for everything a student uploads.\n\n' +
      '**No size limit, and no duration limit except one.** A `STORY_VIDEO` over 60 s is refused ' +
      'with `STORY_VIDEO_TOO_LONG`; a `VIDEO_NOTE` is capped at 60 s and 12 MB because that is what ' +
      'the format is. Everything else is bounded only by your daily quota and by how full the ' +
      "server's disk is (`STORAGE_FULL`). For anything over ~10 MB prefer the resumable " +
      '`/v1/media/upload/*` endpoints — a one-shot upload that drops restarts from zero.\n\n' +
      '`kind` decides the processing:\n' +
      '- `IMAGE` — EXIF (including GPS) stripped, downscaled to 1920px, WebP, thumb, BlurHash\n' +
      '- `IMAGE_ORIGINAL` — full resolution, format kept, **only** EXIF removed. Still a ' +
      '`type: IMAGE` message; the difference is quality\n' +
      '- `FILE` — **any type at all**, stored byte for byte. Downloaded as ' +
      '`application/octet-stream` with `Content-Disposition: attachment`, always\n' +
      '- `GIF` — silent looping MP4\n' +
      '- `VIDEO` — H.264/AAC ⇒ `READY`, otherwise `PROCESSING` and a `media:ready` event later\n' +
      '- `VIDEO_NOTE` — round message; must be square (`MEDIA_NOT_SQUARE`) and carries no caption\n' +
      '- `VOICE` — duration and a 100-point waveform. m4a/AAC and OGG/Opus both accepted\n\n' +
      '`conversationId` is **required for the chat kinds** and is their permission check — you must ' +
      'be a member, still connected and not blocked. It is **ignored for `PROFILE_PHOTO`, ' +
      '`STORY_IMAGE` and `STORY_VIDEO`**, which have no conversation.\n\n' +
      'The returned `id` is the `mediaId` you then pass to `POST /v1/messages`, ' +
      '`POST /v1/profile/photos` or `POST /v1/stories`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file', 'kind'],
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: {
          type: 'string',
          enum: Object.values(MediaKind),
          description: CHAT_UPLOAD_KIND_HELP,
        },
        conversationId: {
          type: 'string',
          description: 'Required for the chat kinds; omit for PROFILE_PHOTO and STORY_*.',
        },
        quality: {
          type: 'string',
          enum: Object.values(MediaQuality),
          description:
            'Video only, default `AUTO`. `ORIGINAL` stores the file exactly as sent and never ' +
            'transcodes it; `HIGH` keeps 1080p when a transcode is needed.',
        },
      },
    },
  })
  @ApiOkEnvelope(AttachmentDto)
  @ApiForbiddenEnvelope('Not a member, not connected any more, or blocked (`NOT_CONNECTED`).')
  @ApiValidationEnvelope(
    'Unknown `kind` or `quality`, missing file, an undecodable image or clip ' +
      '(`FILE_TYPE_NOT_ALLOWED`), a story video over 60 s (`STORY_VIDEO_TOO_LONG`), a round video ' +
      'that is not square (`MEDIA_NOT_SQUARE`), or an image over 16384px a side ' +
      '(`MEDIA_TOO_LARGE_DIMENSIONS`).',
  )
  @ApiErrorEnvelope(413, ERROR_CODE.FILE_TOO_LARGE, 'A `VIDEO_NOTE` over 12 MB. No other kind.')
  @ApiErrorEnvelope(429, ERROR_CODE.UPLOAD_RATE_LIMIT, '60 uploads a minute, or 20 GB a day.')
  @ApiErrorEnvelope(503, ERROR_CODE.STORAGE_FULL, 'The media volume is nearly full. Retry later.')
  async chatUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body('kind') kind: string,
    @Body('conversationId') conversationId: string,
    @Body('quality') quality: string | undefined,
    @UploadedFile() file?: UploadedChatFile,
  ): Promise<AttachmentDto> {
    try {
      const parsedKind = parseKind(kind);
      const scoped = typeof conversationId === 'string' && conversationId.length > 0;
      if (isChatKind(parsedKind) && !scoped) {
        throw AppException.validation({ conversationId: 'Suhbat id sini yuboring' });
      }
      // Dropped rather than passed through for a profile photo or a story: a stray conversation id
      // would otherwise make the asset readable to that conversation's members.
      const asset = await this.media.upload(user, {
        kind: parsedKind,
        conversationId: isChatKind(parsedKind) && scoped ? conversationId : null,
        quality: parseQuality(quality),
        file,
      });
      return AttachmentDto.fromDomain(asset, this.apiBase);
    } catch (error) {
      // multer has already written the upload by the time this method runs. `upload()` removes it
      // itself, but the field checks above can reject *before* that call — and with no size limit
      // any more, the file left behind could be arbitrarily large.
      if (file !== undefined) {
        await rm(file.path, { force: true }).catch(() => undefined);
      }
      throw error;
    }
  }

  @Get(':id/raw')
  @ApiOperation({
    summary: 'Download a chat attachment',
    description:
      'Streams the bytes after checking that you are a member of the conversation it belongs to. ' +
      'Chat media is never on a public path — a leaked link is useless without a token.\n\n' +
      'A `FILE` always comes back as `application/octet-stream` with ' +
      '`Content-Disposition: attachment`, whatever it actually contains. Its bytes are identical to ' +
      'what was uploaded: `sha256` in equals `sha256` out.',
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

    applyDownloadHeaders(response, {
      // A thumbnail is one we generated and always safe to render inline, even when the asset it
      // belongs to is an opaque document.
      opaque: !wantsThumb && isOpaqueKind(asset.kind),
      // Image thumbs are WebP but video and GIF posters are JPEG — claiming one type for both would
      // mislabel every video thumbnail. The stored key's extension is the source of truth.
      contentType: wantsThumb ? thumbContentType(key) : asset.mimeType,
      fileName: wantsThumb ? null : asset.fileName,
    });
    this.storage.read(key).pipe(response);
  }
}

function thumbContentType(key: string): string {
  return key.endsWith('.jpg') || key.endsWith('.jpeg') ? 'image/jpeg' : 'image/webp';
}
