import { ApiProperty } from '@nestjs/swagger';
import { MediaAsset, MediaVariant } from '../../domain/entities/media-asset.entity';
import { MediaKind, MediaProvider, MediaStatus } from '../../domain/enums/media-kind.enum';

/**
 * A chat attachment on the wire.
 *
 * One shape for both sources: our own uploads resolve `url`/`thumbUrl` to the authorised proxy,
 * provider GIFs resolve them to the provider CDN. The client renders them identically — which is
 * the whole reason both live in one table.
 */
export class AttachmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: MediaKind, enumName: 'MediaKindDto' })
  kind!: MediaKind;

  @ApiProperty({
    enum: MediaStatus,
    enumName: 'MediaStatusDto',
    description:
      '`PROCESSING` only ever appears on video that is still transcoding. Show the `thumbUrl` and ' +
      'wait for the `media:ready` event, which carries the finished attachment.',
  })
  status!: MediaStatus;

  @ApiProperty({
    description: 'Full-size media. Requires the same bearer token as any other call.',
  })
  url!: string;

  @ApiProperty({ type: String, nullable: true })
  thumbUrl!: string | null;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty({ type: 'integer', format: 'int32' })
  sizeBytes!: number;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  width!: number | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  height!: number | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  durationMs!: number | null;

  @ApiProperty({
    type: 'array',
    items: { type: 'integer' },
    description:
      'Voice notes only: 100 amplitude points in 0..100, computed server-side. Empty for every ' +
      'other kind — the client cannot derive it from an already-compressed file.\n\n' +
      'Draw whatever length arrives rather than assuming 100: notes recorded before this was ' +
      'raised still carry the original 48 points, and they are not rewritten.',
  })
  waveform!: number[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Speech-to-text for a voice note. **Always null today** — reserved so that turning ' +
      'transcription on later needs no client change.',
  })
  transcript!: string | null;

  @ApiProperty({
    type: 'array',
    nullable: true,
    items: {
      type: 'object',
      properties: {
        height: { type: 'integer' },
        bitrate: { type: 'integer' },
        url: { type: 'string' },
      },
    },
    description:
      'Alternative renditions of a video, for picking one by bandwidth. **Always null today** — ' +
      'reserved. Play `url` until this is populated.',
  })
  variants!: MediaVariant[] | null;

  @ApiProperty({ type: String, nullable: true, description: 'Original name, FILE only.' })
  fileName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'BlurHash placeholder.' })
  blurHash!: string | null;

  @ApiProperty({ description: 'Play muted and looping when true (GIF and converted GIF-as-MP4).' })
  isAnimated!: boolean;

  @ApiProperty({
    enum: MediaProvider,
    enumName: 'MediaProviderDto',
    nullable: true,
    description: 'Set when the GIF came from provider search rather than an upload.',
  })
  provider!: MediaProvider | null;

  @ApiProperty({ type: String, nullable: true })
  externalId!: string | null;

  /** `apiBase` is the `/v1` prefix the proxy lives under, e.g. `https://api.studentclub.uz/v1`. */
  static fromDomain(asset: MediaAsset, apiBase: string): AttachmentDto {
    const dto = new AttachmentDto();
    dto.id = asset.id;
    dto.kind = asset.kind;
    dto.status = asset.status;
    dto.url = asset.externalUrl ?? `${apiBase}/media/${asset.id}/raw`;
    dto.thumbUrl =
      asset.externalThumbUrl ??
      (asset.thumbStorageKey === null ? null : `${apiBase}/media/${asset.id}/raw?variant=thumb`);
    dto.mimeType = asset.mimeType;
    dto.sizeBytes = asset.sizeBytes;
    dto.width = asset.width;
    dto.height = asset.height;
    dto.durationMs = asset.durationMs;
    dto.waveform = asset.waveform;
    dto.transcript = asset.transcript;
    dto.variants = asset.variants;
    dto.fileName = asset.fileName;
    dto.blurHash = asset.blurHash;
    dto.isAnimated = asset.isAnimated;
    dto.provider = asset.provider;
    dto.externalId = asset.externalId;
    return dto;
  }
}
