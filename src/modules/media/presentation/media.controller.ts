import {
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import type { UploadedImage } from '../application/media.io';
import { MAX_IMAGE_SIZE_BYTES, MediaService } from '../application/media.service';
import { MediaUploadResponseDto } from './dto/media-upload-response.dto';

/**
 * Stateless image upload (§6). JWT-guarded and rate-limited to 100/hour. The file is validated by
 * magic bytes (not the declared mimetype) and stored via the swappable STORAGE port; the returned
 * `url` is later persisted by business/listing/profile. Served under the `/v1` prefix.
 */
@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @HttpCode(200)
  @Throttle({ default: { limit: 100, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }))
  @ApiOperation({
    summary: 'Upload an image (logo, cover, listing photo)',
    description: 'multipart/form-data. JPEG/PNG/WebP, max 5 MB. Returns the public URL.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file', 'purpose'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG/PNG/WebP, max 5 MB)',
        },
        purpose: {
          type: 'string',
          description: 'Image purpose: LOGO | COVER | LISTING',
          example: 'LISTING',
        },
      },
    },
  })
  @ApiOkResponse({ type: MediaUploadResponseDto })
  @ApiResponse({ status: 413, description: 'FILE_TOO_LARGE' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED — 100 per hour' })
  async upload(
    @Body('purpose') purpose: string,
    @UploadedFile() file?: UploadedImage,
  ): Promise<MediaUploadResponseDto> {
    const result = await this.mediaService.upload(purpose, file);
    return MediaUploadResponseDto.from(result);
  }
}
