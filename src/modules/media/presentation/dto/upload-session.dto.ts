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
      'Exact size of the whole file. Checked against what actually arrives before `complete` ' +
      'runs, and used to reserve your daily quota up front.',
  })
  @Type(() => Number)
  @IsInt({ message: 'Fayl hajmini yuboring' })
  @IsPositive({ message: 'Fayl hajmini yuboring' })
  totalBytes!: number;
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
