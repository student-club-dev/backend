import { MediaProvider } from '../../media/domain/enums/media-kind.enum';

/** Injection token for the sticker lookup chat uses to validate a `stickerId`. */
export const STICKER_DIRECTORY = Symbol('STICKER_DIRECTORY');

/**
 * The slice of a sticker a message needs to render it — one shape for both sources.
 *
 * A sticker reaches a message from our seeded catalogue (`stickerId`) or from provider search
 * (`sticker`), and the client must not have to tell them apart: the picker shows both in one grid,
 * and a bubble renders identically either way. So the fields only one source can fill are nullable
 * rather than being split into two variants.
 */
export interface MessageSticker {
  /** Catalogue cuid, or the provider's own id. */
  id: string;
  /** Which catalogue answered. `null` ⇒ ours — show no attribution badge. */
  provider: MediaProvider | null;
  /** Catalogue only; `null` for a provider sticker, which belongs to no pack of ours. */
  packId: string | null;
  /** Catalogue only — the emoji this sticker stands in for. `null` for a provider sticker. */
  emoji: string | null;
  /** WebP with a transparent background. Never MP4 — that format has no alpha channel. */
  url: string;
  /** Provider stickers ship a smaller preview; `null` for catalogue stickers, which are already small. */
  thumbUrl: string | null;
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
