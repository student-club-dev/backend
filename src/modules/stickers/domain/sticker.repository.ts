/** Injection token for the sticker catalogue port (bound to the Prisma impl in the module). */
export const STICKER_REPOSITORY = Symbol('STICKER_REPOSITORY');

/** One sticker: a static 512×512 WebP on a transparent background. */
export interface Sticker {
  id: string;
  packId: string;
  emoji: string;
  url: string;
  width: number;
  height: number;
}

/** A pack with its stickers. The client caches the whole catalogue and refetches on a version bump. */
export interface StickerPack {
  id: string;
  key: string;
  name: string;
  coverUrl: string;
  isDefault: boolean;
  stickers: Sticker[];
}

/** The whole catalogue plus the number that tells a cached client whether to refetch. */
export interface StickerCatalogue {
  packs: StickerPack[];
  version: number;
}

export interface StickerRepository {
  /** Every pack with its stickers, ordered for display. ~200 KB — one request is enough. */
  catalogue(): Promise<StickerCatalogue>;

  /** A sticker by id, or `null` — the send-time check behind `STICKER_NOT_FOUND`. */
  findById(id: string): Promise<Sticker | null>;
}
