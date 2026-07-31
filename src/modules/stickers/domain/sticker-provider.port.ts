import { StickerPage } from './sticker-source';

/** Injection token for the active sticker provider adapter. */
export const STICKER_PROVIDER = Symbol('STICKER_PROVIDER');

/**
 * A third-party sticker catalogue we proxy.
 *
 * Separate from the seeded `StickerRepository`: that one is our own catalogue, this one is millions
 * of character stickers we neither host nor own. Same seam as `GifProviderAdapter`, and for the same
 * reason — swapping catalogues must stay an adapter plus a binding, never a change to
 * `GET /v1/stickers/search`, which the mobile client is generated from.
 */
export interface StickerProviderAdapter {
  /** Whether this deployment can actually serve search (i.e. a key is configured). */
  isConfigured(): boolean;

  /** Search, or the trending list when `query` is empty. */
  search(query: string, limit: number, pos: string | null, locale: string): Promise<StickerPage>;

  /** Tell the provider a result was shared. Best-effort — never fails the user's send. */
  registerShare(id: string, query: string | null): Promise<void>;
}
