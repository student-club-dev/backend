import { ApiProperty } from '@nestjs/swagger';
import { Sticker, StickerCatalogue, StickerPack } from '../../domain/sticker.repository';

/** One sticker on the wire. */
export class StickerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  packId!: string;

  @ApiProperty({ example: '😄', description: 'The emoji this sticker stands in for.' })
  emoji!: string;

  @ApiProperty({ description: 'Static WebP, transparent background.' })
  url!: string;

  @ApiProperty({ type: 'integer', format: 'int32', example: 512 })
  width!: number;

  @ApiProperty({ type: 'integer', format: 'int32', example: 512 })
  height!: number;

  static fromDomain(sticker: Sticker): StickerDto {
    const dto = new StickerDto();
    dto.id = sticker.id;
    dto.packId = sticker.packId;
    dto.emoji = sticker.emoji;
    dto.url = sticker.url;
    dto.width = sticker.width;
    dto.height = sticker.height;
    return dto;
  }
}

/** A pack with its stickers inlined — the client never fetches a pack separately. */
export class StickerPackDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'student_life', description: 'Stable key; survives reseeding.' })
  key!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  coverUrl!: string;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ type: [StickerDto] })
  stickers!: StickerDto[];

  static fromDomain(pack: StickerPack): StickerPackDto {
    const dto = new StickerPackDto();
    dto.id = pack.id;
    dto.key = pack.key;
    dto.name = pack.name;
    dto.coverUrl = pack.coverUrl;
    dto.isDefault = pack.isDefault;
    dto.stickers = pack.stickers.map(StickerDto.fromDomain);
    return dto;
  }
}

/** The whole catalogue. Cache it and refetch only when `version` changes. */
export class StickerPacksDto {
  @ApiProperty({ type: [StickerPackDto] })
  packs!: StickerPackDto[];

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description:
      'Bumped whenever any pack changes. Also sent as the `ETag`, so a conditional request gets ' +
      '304 and no body at all.',
  })
  version!: number;

  static fromDomain(catalogue: StickerCatalogue): StickerPacksDto {
    const dto = new StickerPacksDto();
    dto.packs = catalogue.packs.map(StickerPackDto.fromDomain);
    dto.version = catalogue.version;
    return dto;
  }
}
