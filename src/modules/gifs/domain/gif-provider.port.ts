import { GifPage } from './gif-source';

/** Injection token for the active GIF provider adapter. */
export const GIF_PROVIDER = Symbol('GIF_PROVIDER');

/**
 * A GIF catalogue we proxy.
 *
 * The port exists because the provider is not ours to rely on: Tenor stopped accepting new API
 * clients in January 2026, which turned "just use Tenor" into a dead end overnight. Swapping to
 * another catalogue must be an adapter plus a config value, never a change to
 * `GET /v1/gifs/search`'s contract — the mobile client is generated from that.
 */
export interface GifProviderAdapter {
  /** Whether this deployment can actually serve search (i.e. a key is configured). */
  isConfigured(): boolean;

  /** Search, or the featured list when `query` is empty. */
  search(query: string, limit: number, pos: string | null, locale: string): Promise<GifPage>;

  /**
   * Tell the provider a result was shared. Required by their terms where applicable, and
   * best-effort everywhere: a failure must never fail the user's send.
   */
  registerShare(id: string, query: string | null): Promise<void>;
}
