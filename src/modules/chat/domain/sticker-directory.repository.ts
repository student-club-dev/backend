/** Injection token for the sticker lookup chat uses to validate a `stickerId`. */
export const STICKER_DIRECTORY = Symbol('STICKER_DIRECTORY');

/** The slice of a sticker a message needs to render it. */
export interface MessageSticker {
  id: string;
  packId: string;
  emoji: string;
  url: string;
  width: number;
  height: number;
}

/**
 * A narrow read of the sticker catalogue. Deliberately not an import of the stickers module: chat
 * only ever asks "does this id exist, and what does it look like".
 */
export interface StickerDirectoryRepository {
  findById(stickerId: string): Promise<MessageSticker | null>;
}
