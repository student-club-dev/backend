import { Injectable } from '@nestjs/common';
import type { MediaAsset as PrismaMediaAsset } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { MediaAsset, NewMediaAsset } from '../domain/entities/media-asset.entity';
import { MediaKind, MediaProvider, MediaStatus } from '../domain/enums/media-kind.enum';
import { MediaAssetRepository } from '../domain/media-asset.repository';

/** Prisma implementation of the chat-media repository port. Prisma is used ONLY here. */
@Injectable()
export class MediaAssetPrismaRepository implements MediaAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(asset: NewMediaAsset): Promise<MediaAsset> {
    const row = await this.prisma.mediaAsset.create({ data: asset });
    return toDomain(row);
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

  async findOrphans(before: Date, limit: number): Promise<MediaAsset[]> {
    const rows = await this.prisma.mediaAsset.findMany({
      where: { messageId: null, createdAt: { lt: before } },
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
    fileName: row.fileName,
    blurHash: row.blurHash,
    messageId: row.messageId,
    createdAt: row.createdAt,
  };
}
