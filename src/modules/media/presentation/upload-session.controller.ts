import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
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
import { UploadSessionService } from '../application/upload-session.service';
import { isChatKind } from '../domain/enums/media-kind.enum';
import { AttachmentDto } from './dto/attachment.dto';
import { CompleteUploadDto, InitUploadDto, UploadProgressDto } from './dto/upload-session.dto';
import { StorageSpaceGuard } from './storage-space.guard';

/**
 * Resumable uploads (parity spec §7).
 *
 * Use these for anything over roughly 10 MB. `POST /v1/media/chat-upload` is still there and is
 * still faster for a small file — one request beats four — but a one-shot upload that drops starts
 * again from zero, which on mobile data means a large one may never finish.
 *
 * They are also how a video is sent *while it is being encoded*, which is most of the difference
 * between a send that feels instant and one that does not: bound the session by the source size at
 * `init`, push each part as the muxer writes it, and report the real size at `complete`. Nothing
 * has to wait for the encoder to close the file first.
 */
@ApiTags('Chat')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('media/upload')
export class UploadSessionController {
  private readonly apiBase: string;

  constructor(
    private readonly uploads: UploadSessionService,
    config: ConfigService<Env, true>,
  ) {
    this.apiBase = `/${config.get('API_PREFIX', { infer: true })}`;
  }

  @Post('init')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard, StorageSpaceGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Open a resumable upload',
    description:
      'Reserves quota and returns the part size to cut the file into. Everything that can refuse ' +
      'the upload cheaply happens here rather than at the end — permission, quota and disk space — ' +
      'so a rejection costs one request instead of a gigabyte.\n\n' +
      'No `mediaId` exists yet. Send the parts, then `complete`.',
  })
  @ApiOkEnvelope(UploadProgressDto)
  @ApiForbiddenEnvelope('Not a member, not connected any more, or blocked (`NOT_CONNECTED`).')
  @ApiValidationEnvelope('Unknown `kind` or `quality`, or a missing/invalid `totalBytes`.')
  @ApiErrorEnvelope(429, ERROR_CODE.UPLOAD_RATE_LIMIT, 'The daily byte quota is spent.')
  @ApiErrorEnvelope(503, ERROR_CODE.STORAGE_FULL, 'The media volume is nearly full. Retry later.')
  async init(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: InitUploadDto,
  ): Promise<UploadProgressDto> {
    const scoped = typeof body.conversationId === 'string' && body.conversationId.length > 0;
    if (isChatKind(body.kind) && !scoped) {
      throw AppException.validation({ conversationId: 'Suhbat id sini yuboring' });
    }
    const progress = await this.uploads.init(user, {
      kind: body.kind,
      // Dropped for the kinds with no conversation, exactly as on a one-shot upload: a stray id
      // would otherwise make a story readable to that conversation's members.
      conversationId: isChatKind(body.kind) && scoped ? (body.conversationId as string) : null,
      quality: body.quality,
      fileName: body.fileName,
      totalBytes: body.totalBytes,
    });
    return UploadProgressDto.from(progress);
  }

  @Put(':uploadId/part/:index')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send one part',
    description:
      'The raw bytes of part `index` as the request body — **not** multipart.\n\n' +
      'Parts may be sent **in any order and in parallel**, and re-sending one is harmless: the same ' +
      'index simply overwrites itself. That is what makes this safe to retry blindly after a ' +
      'dropped connection. Every part is `chunkSize` bytes except the last.\n\n' +
      '`Content-Range` is accepted and ignored — `index` in the path is what decides where the ' +
      'bytes go.',
  })
  @ApiParam({ name: 'index', type: 'integer', description: 'Zero-based part number.' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({ required: true, schema: { type: 'string', format: 'binary' } })
  @ApiOkEnvelope(UploadProgressDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.UPLOAD_SESSION_NOT_FOUND,
    'No such session, not yours, or expired.',
    'Yuklash sessiyasi topilmadi',
  )
  @ApiValidationEnvelope('`index` is outside the range implied by `totalBytes` and `chunkSize`.')
  @ApiErrorEnvelope(503, ERROR_CODE.STORAGE_FULL, 'The media volume filled up mid-upload.')
  async part(
    @CurrentUser() user: AuthenticatedUser,
    @Param('uploadId') uploadId: string,
    @Param('index', ParseIntPipe) index: number,
    @Req() request: Request,
  ): Promise<UploadProgressDto> {
    // The raw request stream, piped straight to disk. Nothing parses or buffers the body: the whole
    // point of this endpoint is data too large to hold in memory.
    const progress = await this.uploads.writePart(user, uploadId, index, request);
    return UploadProgressDto.from(progress);
  }

  @Get(':uploadId')
  @ApiOperation({
    summary: 'What has arrived so far',
    description:
      'Call this after an interruption. Send whatever indexes are missing from `received` and then ' +
      '`complete` — there is no need to start over.',
  })
  @ApiOkEnvelope(UploadProgressDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.UPLOAD_SESSION_NOT_FOUND,
    'No such session, not yours, or expired.',
    'Yuklash sessiyasi topilmadi',
  )
  async status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('uploadId') uploadId: string,
  ): Promise<UploadProgressDto> {
    return UploadProgressDto.from(await this.uploads.status(user, uploadId));
  }

  @Post(':uploadId/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Finish the upload',
    description:
      'Joins the parts and processes them exactly as `POST /v1/media/chat-upload` would — same ' +
      'type detection, same EXIF stripping, same transcoding. Returns the same `AttachmentDto`, and ' +
      'its `id` is the `mediaId` to send with a message.\n\n' +
      'Send `totalBytes` here when the figure given to `init` was an estimate — which is what lets ' +
      'you upload a video **while it is still encoding**: bound the session by the source size, ' +
      'push parts as the muxer writes them, and report the real size once it closes. Omit the body ' +
      'entirely if `init` already had the exact number.\n\n' +
      'A video may come back `PROCESSING`; wait for `media:ready` as usual. An H.264/AAC file — ' +
      'which is what every client encoder produces — is not re-encoded and comes back `READY` ' +
      'immediately. The session and its parts are removed once this succeeds.',
  })
  @ApiBody({ required: false, type: CompleteUploadDto })
  @ApiOkEnvelope(AttachmentDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.UPLOAD_SESSION_NOT_FOUND,
    'No such session, not yours, or expired.',
    'Yuklash sessiyasi topilmadi',
  )
  @ApiValidationEnvelope(
    'A part is missing (`UPLOAD_INCOMPLETE`), the assembled size does not match the one declared ' +
      'or exceeds the bound set at `init` (`UPLOAD_SIZE_MISMATCH`), or the finished file fails the ' +
      'checks for its `kind`.',
  )
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('uploadId') uploadId: string,
    @Body() body: CompleteUploadDto,
  ): Promise<AttachmentDto> {
    const asset = await this.uploads.complete(user, uploadId, body?.totalBytes);
    return AttachmentDto.fromDomain(asset, this.apiBase);
  }

  @Delete(':uploadId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Abandon an upload',
    description:
      'Removes the session and every part stored for it. Optional — an untouched session expires ' +
      'on its own — but it frees the disk immediately when the user cancels a send.',
  })
  @ApiOkEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.UPLOAD_SESSION_NOT_FOUND,
    'No such session, not yours, or expired.',
    'Yuklash sessiyasi topilmadi',
  )
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('uploadId') uploadId: string,
  ): Promise<void> {
    await this.uploads.cancel(user, uploadId);
  }
}
