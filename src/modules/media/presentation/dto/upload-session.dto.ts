import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { MediaKind, MediaQuality } from '../../domain/enums/media-kind.enum';
import type { UploadProgress } from '../../application/upload-session.service';

/** `POST /v1/media/upload/init` (parity spec §7). */
export class InitUploadDto {
  @ApiProperty({ enum: MediaKind, enumName: 'MediaKindDto' })
  @IsEnum(MediaKind, { message: 'Yuklash turi noto‘g‘ri' })
  kind!: MediaKind;

  @ApiPropertyOptional({
    description: 'Required for the chat kinds; omit for PROFILE_PHOTO and STORY_*.',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ enum: MediaQuality, enumName: 'MediaQualityDto' })
  @IsOptional()
  @IsEnum(MediaQuality, { message: 'Sifat darajasi noto‘g‘ri' })
  quality?: MediaQuality;

  @ApiPropertyOptional({ description: 'Original name, kept for FILE. Sanitised server-side.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiProperty({
    type: 'integer',
    format: 'int64',
    description:
      'An **upper bound** on the finished file, used to reserve your daily quota and to bound the ' +
      'part index. It does not have to be exact.\n\n' +
      'If you know the size, send it. If you are still encoding, send something you are certain ' +
      'not to exceed — the source file’s size — and send the real figure to `complete`. Going over ' +
      'this bound is the one thing `complete` will refuse.',
  })
  @Type(() => Number)
  @IsInt({ message: 'Fayl hajmini yuboring' })
  @IsPositive({ message: 'Fayl hajmini yuboring' })
  totalBytes!: number;
}

/** Body of `POST /v1/media/upload/{uploadId}/complete`. Optional — an empty body is valid. */
export class CompleteUploadDto {
  @ApiPropertyOptional({
    type: 'integer',
    format: 'int64',
    description:
      'The finished file’s real size. Send this when `init` was given an estimate — it is what the ' +
      'assembled parts are checked against. Omit it and the figure from `init` is used instead, ' +
      'which is what a client that knew the size all along should do.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Fayl hajmini yuboring' })
  @IsPositive({ message: 'Fayl hajmini yuboring' })
  totalBytes?: number;
}

/** The state of an upload — returned by `init`, every `PUT part`, and `GET`. */
export class UploadProgressDto {
  @ApiProperty()
  uploadId!: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'integer' },
    description:
      'Part indexes stored so far, ascending. After an interruption, send the ones not listed ' +
      'here — in any order, in parallel, and repeats are harmless.',
  })
  received!: number[];

  @ApiProperty({
    type: 'integer',
    description: 'Bytes per part. Only the last part may be shorter.',
  })
  chunkSize!: number;

  @ApiProperty({ type: 'integer', format: 'int64' })
  totalBytes!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'ISO-8601. At least 24 hours out — a send interrupted on the metro survives it.',
  })
  expiresAt!: string;

  static from(progress: UploadProgress): UploadProgressDto {
    const dto = new UploadProgressDto();
    dto.uploadId = progress.uploadId;
    dto.received = progress.received;
    dto.chunkSize = progress.chunkSize;
    dto.totalBytes = progress.totalBytes;
    dto.expiresAt = progress.expiresAt.toISOString();
    return dto;
  }
}
