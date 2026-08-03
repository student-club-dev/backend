import { Injectable } from '@nestjs/common';
import { Prisma, type MediaAsset as PrismaMediaAsset } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { MediaAsset, MediaVariant, NewMediaAsset } from '../domain/entities/media-asset.entity';
import {
  MediaKind,
  MediaProvider,
  MediaQuality,
  MediaStatus,
} from '../domain/enums/media-kind.enum';
import { MediaAssetRepository } from '../domain/media-asset.repository';

/** The kinds the orphan sweep is allowed to touch — see `findOrphans`. */
const CHAT_KINDS: MediaKind[] = [
  MediaKind.IMAGE,
  MediaKind.IMAGE_ORIGINAL,
  MediaKind.GIF,
  MediaKind.VIDEO,
  MediaKind.VIDEO_NOTE,
  MediaKind.VOICE,
  MediaKind.FILE,
];

/** Prisma implementation of the chat-media repository port. Prisma is used ONLY here. */
@Injectable()
export class MediaAssetPrismaRepository implements MediaAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(asset: NewMediaAsset): Promise<MediaAsset> {
    // `variants` needs unpacking because a nullable Json column does not take a plain `null`:
    // Prisma makes you say which null you mean, and ours is "no column value" rather than the JSON
    // literal `null`.
    const { variants, ...rest } = asset;
    const row = await this.prisma.mediaAsset.create({
      data: {
        ...rest,
        variants:
          variants === null ? Prisma.DbNull : (variants as unknown as Prisma.InputJsonValue),
      },
    });
    return toDomain(row);
  }

  async findByIds(ids: string[]): Promise<MediaAsset[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.mediaAsset.findMany({ where: { id: { in: ids } } });
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<MediaAsset | null> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  async bytesUploadedSince(ownerId: string, since: Date): Promise<number> {
    const result = await this.prisma.mediaAsset.aggregate({
      where: { ownerId, createdAt: { gte: since } },
      _sum: { sizeBytes: true },
    });
    return result._sum.sizeBytes ?? 0;
  }

  async markProcessed(
    id: string,
    update: Partial<
      Pick<
        MediaAsset,
        'status' | 'storageKey' | 'mimeType' | 'sizeBytes' | 'width' | 'height' | 'durationMs'
      >
    >,
  ): Promise<MediaAsset> {
    const row = await this.prisma.mediaAsset.update({ where: { id }, data: update });
    return toDomain(row);
  }

  async attachToMessage(id: string, messageId: string): Promise<void> {
    await this.prisma.mediaAsset.update({ where: { id }, data: { messageId } });
  }

  /**
   * Unattached chat uploads older than `before`.
   *
   * Restricted to chat kinds, and that restriction is load-bearing: a profile photo or a story is
   * claimed by a `ProfilePhoto` / `Story` row rather than by a message, so its `messageId` is null
   * forever. Sweeping on `messageId: null` alone would delete every profile picture on the platform
   * a day after it was set. Story bytes are removed by the story cleanup cron instead, which knows
   * about `expiresAt`.
   */
  async findOrphans(before: Date, limit: number): Promise<MediaAsset[]> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: {
        messageId: null,
        createdAt: { lt: before },
        kind: { in: CHAT_KINDS },
      },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.mediaAsset.deleteMany({ where: { id: { in: ids } } });
  }
}

function toDomain(row: PrismaMediaAsset): MediaAsset {
  return {
    id: row.id,
    ownerId: row.ownerId,
    conversationId: row.conversationId,
    kind: MediaKind[row.kind],
    status: MediaStatus[row.status],
    quality: row.quality === null ? null : MediaQuality[row.quality],
    isAnimated: row.isAnimated,
    storageKey: row.storageKey,
    thumbStorageKey: row.thumbStorageKey,
    externalUrl: row.externalUrl,
    externalThumbUrl: row.externalThumbUrl,
    provider: row.provider === null ? null : MediaProvider[row.provider],
    externalId: row.externalId,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    waveform: row.waveform,
    transcript: row.transcript,
    // `Json?` is `Prisma.JsonValue`, which is `any`-adjacent by nature. Nothing writes the column
    // yet (parity spec §4.3), so the read is the narrow half of the contract: a stored array is
    // handed over as one, and anything else — including the null every row holds today — is null.
    variants: Array.isArray(row.variants) ? (row.variants as unknown as MediaVariant[]) : null,
    fileName: row.fileName,
    blurHash: row.blurHash,
    messageId: row.messageId,
    createdAt: row.createdAt,
  };
}
