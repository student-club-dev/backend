import { ApiProperty } from '@nestjs/swagger';
import { MediaProvider } from '../../../media/domain/enums/media-kind.enum';
import { GifItem, GifPage } from '../../domain/gif-source';

/** One search hit. Send it back verbatim as `SendMessageDto.gif` to post it. */
export class GifDto {
  @ApiProperty({ description: 'Provider id — pass to `POST /v1/gifs/{id}/share`.' })
  id!: string;

  @ApiProperty({ description: 'Silent looping MP4. Play it muted and on repeat.' })
  url!: string;

  @ApiProperty()
  thumbUrl!: string;

  @ApiProperty({ type: 'integer', format: 'int32' })
  width!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  height!: number;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  durationMs!: number | null;

  static fromDomain(item: GifItem): GifDto {
    const dto = new GifDto();
    dto.id = item.id;
    dto.url = item.url;
    dto.thumbUrl = item.thumbUrl;
    dto.width = item.width;
    dto.height = item.height;
    dto.durationMs = item.durationMs;
    return dto;
  }
}

/** A page of search hits. */
export class GifSearchResponseDto {
  @ApiProperty({ type: [GifDto] })
  items!: GifDto[];

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

  static fromDomain(page: GifPage): GifSearchResponseDto {
    const dto = new GifSearchResponseDto();
    dto.items = page.items.map(GifDto.fromDomain);
    dto.next = page.next;
    dto.provider = page.provider;
    return dto;
  }
}
