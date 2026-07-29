import { MediaAsset, NewMediaAsset } from './entities/media-asset.entity';

/** Injection token for the chat-media repository port (bound to the Prisma impl in the module). */
export const MEDIA_ASSET_REPOSITORY = Symbol('MEDIA_ASSET_REPOSITORY');

export interface MediaAssetRepository {
  create(asset: NewMediaAsset): Promise<MediaAsset>;

  findById(id: string): Promise<MediaAsset | null>;

  /** Bytes this student uploaded since `since` — the daily quota (chat media spec §9). */
  bytesUploadedSince(ownerId: string, since: Date): Promise<number>;

  /** Marks a transcode finished (or failed), returning the updated row. */
  markProcessed(
    id: string,
    update: Partial<
      Pick<
        MediaAsset,
        'status' | 'storageKey' | 'mimeType' | 'sizeBytes' | 'width' | 'height' | 'durationMs'
      >
    >,
  ): Promise<MediaAsset>;

  /** Attaches an asset to the message it was sent with. */
  attachToMessage(id: string, messageId: string): Promise<void>;

  /**
   * Unattached assets older than `before` — a student who picked a photo and then changed their
   * mind. The caller deletes the bytes as well (chat media spec §1.4).
   */
  findOrphans(before: Date, limit: number): Promise<MediaAsset[]>;

  deleteMany(ids: string[]): Promise<void>;
}
