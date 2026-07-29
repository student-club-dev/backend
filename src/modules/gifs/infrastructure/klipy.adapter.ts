import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { Env } from '../../../config/env';
import { MediaProvider } from '../../media/domain/enums/media-kind.enum';
import { GifProviderAdapter } from '../domain/gif-provider.port';
import { GifItem, GifPage, isAllowedGifUrl } from '../domain/gif-source';

/** One encoded rendition. */
interface KlipyFile {
  url?: string;
  width?: number;
  height?: number;
  size?: number;
}

/** KLIPY nests by size first (`hd`/`md`/`sm`/`xs`), then by format (`mp4`, `gif`, `webp`, …). */
type KlipySizes = Partial<Record<'hd' | 'md' | 'sm' | 'xs', Partial<Record<string, KlipyFile>>>>;

interface KlipyItem {
  id?: number | string;
  slug?: string;
  title?: string;
  file?: KlipySizes;
  /** A tiny base64 placeholder KLIPY ships for the loading state. */
  blur_preview?: string;
}

interface KlipyResponse {
  result?: boolean;
  data?: {
    data?: KlipyItem[];
    current_page?: number;
    per_page?: number;
    has_next?: boolean;
  };
}

const REQUEST_TIMEOUT_MS = 5_000;

/** KLIPY caps `per_page` at 50 and refuses anything under 8. */
const MIN_PER_PAGE = 8;
const MAX_PER_PAGE = 50;

/**
 * KLIPY adapter — the provider this deployment actually uses.
 *
 * Chosen because the alternatives stopped being viable: Tenor's API shut down on 30 June 2026, and
 * Giphy caps a free key at 100 calls/hour with a paid upgrade beyond it. KLIPY was built by former
 * Tenor engineers, its production tier is free and unlimited, and WhatsApp already runs on it.
 *
 * The API key travels **in the path**, not a header — so it must never appear in a log line or an
 * error message, and the URL is never echoed anywhere.
 *
 * Attribution ("Powered by KLIPY") is required by their terms and is the client's job; the
 * `provider` field in the response tells it which badge to show.
 */
@Injectable()
export class KlipyAdapter implements GifProviderAdapter {
  private readonly logger = new Logger(KlipyAdapter.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get('KLIPY_API_KEY', { infer: true });
    this.baseUrl = config.get('KLIPY_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  isConfigured(): boolean {
    return this.apiKey !== undefined && this.apiKey.length > 0;
  }

  async search(query: string, limit: number, pos: string | null, locale: string): Promise<GifPage> {
    const key = this.requireKey();
    const page = toPage(pos);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(MIN_PER_PAGE, limit));

    const url = new URL(
      `${this.baseUrl}/${key}/gifs/${query.length === 0 ? 'trending' : 'search'}`,
    );
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));
    // Student audience — keep the catalogue tame.
    url.searchParams.set('rating', 'pg-13');
    // KLIPY wants an ISO 3166 alpha-2 country, not the `uz_UZ` form our own API takes.
    url.searchParams.set('locale', localeToCountry(locale));
    if (query.length > 0) {
      url.searchParams.set('q', query);
    }

    const body = await this.fetchJson<KlipyResponse>(url);
    const items = (body.data?.data ?? []).flatMap(toGifItem).slice(0, limit);

    return {
      items,
      next: body.data?.has_next === true ? String(page + 1) : null,
      provider: MediaProvider.KLIPY,
    };
  }

  /** KLIPY has no share-registration endpoint; nothing to report, and that is not an error. */
  async registerShare(): Promise<void> {
    return Promise.resolve();
  }

  private requireKey(): string {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      throw new AppException(
        ERROR_CODE.GIF_PROVIDER_ERROR,
        503,
        'GIF qidiruvi hozircha mavjud emas',
      );
    }
    return this.apiKey;
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    let response: globalThis.Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      // The URL contains the API key — log the reason, never the target.
      this.logger.warn(`KLIPY request failed: ${(error as Error).message}`);
      throw new AppException(ERROR_CODE.GIF_PROVIDER_ERROR, 502, 'GIF xizmati javob bermadi');
    }
    if (response.status === 429) {
      // Not a failure — the provider answered, and said the quota is spent. Reporting this as a
      // generic 502 sends whoever is debugging looking for a network problem that is not there.
      // A test key allows 100 calls an hour, so this is the expected outcome during development.
      this.logger.warn('KLIPY quota exhausted (429) — upgrade the key or wait for the window');
      throw new AppException(
        ERROR_CODE.GIF_PROVIDER_RATE_LIMITED,
        429,
        "GIF qidiruvi vaqtincha band, birozdan keyin urinib ko'ring",
      );
    }
    if (!response.ok) {
      this.logger.warn(`KLIPY answered ${response.status}`);
      throw new AppException(ERROR_CODE.GIF_PROVIDER_ERROR, 502, 'GIF xizmati javob bermadi');
    }
    return (await response.json()) as T;
  }
}

/**
 * Our API hands the client an opaque `pos` cursor; KLIPY paginates by page number. Keeping the
 * translation here means the wire contract does not change when the provider does.
 */
function toPage(pos: string | null): number {
  const parsed = Number.parseInt(pos ?? '1', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/** `uz_UZ` → `UZ`; a bare `en` → `US` as a sane default. */
function localeToCountry(locale: string): string {
  const [language, country] = locale.split('_');
  return (country ?? language ?? 'us').toUpperCase();
}

/** The first rendition of `format` that exists, walking sizes from `order`. */
function pick(file: KlipySizes, order: readonly ('hd' | 'md' | 'sm' | 'xs')[], format: string) {
  for (const sizeName of order) {
    const candidate = file[sizeName]?.[format];
    if (candidate?.url !== undefined) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Picks the playable rendition and the still preview.
 *
 * `md` before `hd` for the clip: these autoplay in a scrolling grid on mobile data, where the
 * larger encode buys nothing a phone-sized bubble can show. `xs`/`sm` for the thumbnail, for the
 * same reason in the other direction.
 *
 * A missing rendition fails **closed** — the URL is `undefined`, the allowlist rejects it and the
 * item is dropped, so a provider change yields an empty result rather than a broken or foreign
 * link. `npm run gifs:probe` is what tells the two apart.
 */
function toGifItem(item: KlipyItem): GifItem[] {
  const file = item.file ?? {};
  const clip = pick(file, ['md', 'hd', 'sm', 'xs'], 'mp4');
  const still = pick(file, ['sm', 'xs', 'md', 'hd'], 'gif') ?? pick(file, ['sm', 'xs'], 'webp');

  const id = item.id ?? item.slug;
  if (id === undefined || clip?.url === undefined || still?.url === undefined) {
    return [];
  }
  if (!isAllowedGifUrl(clip.url) || !isAllowedGifUrl(still.url)) {
    return [];
  }
  return [
    {
      id: String(id),
      url: clip.url,
      thumbUrl: still.url,
      width: clip.width ?? 0,
      height: clip.height ?? 0,
      // KLIPY does not report duration on a rendition; the client loops regardless.
      durationMs: null,
    },
  ];
}
