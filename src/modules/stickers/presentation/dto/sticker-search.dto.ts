import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MediaProvider } from '../../../media/domain/enums/media-kind.enum';
import { StickerItem, StickerPage } from '../../domain/sticker-source';

/** Query for `GET /v1/stickers/search`. Deliberately identical to `GET /v1/gifs/search`. */
export class StickerSearchQueryDto {
  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    description: 'Search term. Omit or leave empty for the trending list.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 1, maximum: 50, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ type: String, description: 'The `next` cursor from a previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pos?: string;

  @ApiPropertyOptional({ enum: ['uz_UZ', 'ru_RU', 'en_US'], default: 'uz_UZ' })
  @IsOptional()
  @IsIn(['uz_UZ', 'ru_RU', 'en_US'])
  locale?: string;
}

/** Body of `POST /v1/stickers/:id/share`. */
export class StickerShareDto {
  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    description: 'The search term the result was chosen from, when there was one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** One provider sticker. Send it back verbatim as `SendMessageDto.sticker` to post it. */
export class ProviderStickerDto {
  @ApiProperty({ description: 'Provider id — pass to `POST /v1/stickers/{id}/share`.' })
  id!: string;

  @ApiProperty({
    description:
      'WebP with a transparent background (or an alpha-preserving GIF). Never MP4 — that format ' +
      'has no alpha channel, and the sticker would arrive as a white square.',
  })
  url!: string;

  @ApiProperty()
  thumbUrl!: string;

  @ApiProperty({ type: 'integer', format: 'int32' })
  width!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  height!: number;

  @ApiProperty({ description: 'Animated stickers loop forever; play them without a control.' })
  isAnimated!: boolean;

  static fromDomain(item: StickerItem): ProviderStickerDto {
    const dto = new ProviderStickerDto();
    dto.id = item.id;
    dto.url = item.url;
    dto.thumbUrl = item.thumbUrl;
    dto.width = item.width;
    dto.height = item.height;
    dto.isAnimated = item.isAnimated;
    return dto;
  }
}

/** A page of provider stickers. */
export class StickerSearchResponseDto {
  @ApiProperty({ type: [ProviderStickerDto] })
  items!: ProviderStickerDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Cursor for the next page; pass it back as `pos`. Null at the end.',
  })
  next!: string | null;

  @ApiProperty({
    enum: MediaProvider,
    enumName: 'MediaProviderDto',
    description: 'Whose catalogue answered — show the matching attribution.',
  })
  provider!: MediaProvider;

  static fromDomain(page: StickerPage): StickerSearchResponseDto {
    const dto = new StickerSearchResponseDto();
    dto.items = page.items.map(ProviderStickerDto.fromDomain);
    dto.next = page.next;
    dto.provider = page.provider;
    return dto;
  }
}
