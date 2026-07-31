import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { Env } from '../../../config/env';
import { MediaProvider } from '../../media/domain/enums/media-kind.enum';
import { StickerProviderAdapter } from '../domain/sticker-provider.port';
import { isAllowedStickerUrl, StickerItem, StickerPage } from '../domain/sticker-source';

/** One encoded rendition. */
interface KlipyFile {
  url?: string;
  width?: number;
  height?: number;
}

/** KLIPY nests by size first (`hd`/`md`/`sm`/`xs`), then by format (`webp`, `gif`, `mp4`, …). */
type KlipySizes = Partial<Record<'hd' | 'md' | 'sm' | 'xs', Partial<Record<string, KlipyFile>>>>;

interface KlipyItem {
  id?: number | string;
  slug?: string;
  title?: string;
  file?: KlipySizes;
  type?: string;
}

interface KlipyResponse {
  result?: boolean;
  data?: {
    data?: KlipyItem[];
    has_next?: boolean;
  };
}

const REQUEST_TIMEOUT_MS = 5_000;

/** KLIPY caps `per_page` at 50 and refuses anything under 8. */
const MIN_PER_PAGE = 8;
const MAX_PER_PAGE = 50;

/**
 * KLIPY's sticker catalogue — the same account, key and base URL as GIF search, a different path
 * (`/stickers/…` instead of `/gifs/…`). No second contract was needed.
 *
 * Exists because our own seeded catalogue is emoji-shaped: the app ships 1625 Fluent Emoji 3D
 * stickers, which covers reactions but not the character stickers (the Telegram cats) people
 * actually go looking for. Only search can supply those.
 *
 * The API key travels **in the path**, so it must never appear in a log line or an error message,
 * and the URL is never echoed anywhere.
 */
@Injectable()
export class KlipyStickerAdapter implements StickerProviderAdapter {
  private readonly logger = new Logger(KlipyStickerAdapter.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get('KLIPY_API_KEY', { infer: true });
    this.baseUrl = config.get('KLIPY_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  isConfigured(): boolean {
    return this.apiKey !== undefined && this.apiKey.length > 0;
  }

  async search(
    query: string,
    limit: number,
    pos: string | null,
    locale: string,
  ): Promise<StickerPage> {
    const key = this.requireKey();
    const page = toPage(pos);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(MIN_PER_PAGE, limit));

    const url = new URL(
      `${this.baseUrl}/${key}/stickers/${query.length === 0 ? 'trending' : 'search'}`,
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
    const items = (body.data?.data ?? []).flatMap(toStickerItem).slice(0, limit);

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
        ERROR_CODE.STICKER_PROVIDER_ERROR,
        503,
        'Stiker qidiruvi hozircha mavjud emas',
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
      this.logger.warn(`KLIPY sticker request failed: ${(error as Error).message}`);
      throw new AppException(
        ERROR_CODE.STICKER_PROVIDER_ERROR,
        502,
        'Stiker xizmati javob bermadi',
      );
    }
    if (response.status === 429) {
      // The provider answered and said the quota is spent — a 502 here would send whoever is
      // debugging looking for a network problem that is not there. A test key allows 100 calls an
      // hour across GIF *and* sticker search, so this is the expected outcome during development.
      this.logger.warn(
        'KLIPY quota exhausted (429) on sticker search — upgrade the key or wait for the window',
      );
      throw new AppException(
        ERROR_CODE.STICKER_PROVIDER_RATE_LIMITED,
        429,
        "Stiker qidiruvi vaqtincha band, birozdan keyin urinib ko'ring",
      );
    }
    if (!response.ok) {
      this.logger.warn(`KLIPY answered ${response.status} on sticker search`);
      throw new AppException(
        ERROR_CODE.STICKER_PROVIDER_ERROR,
        502,
        'Stiker xizmati javob bermadi',
      );
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
 * Picks the renditions to show, **alpha-preserving formats only**.
 *
 * WebP first, GIF as the fallback; MP4 is deliberately never considered even when it is the only
 * rendition KLIPY offers. A sticker whose transparency is gone is worse than a missing sticker: it
 * lands in the conversation as a white rectangle and looks like a bug in our app, not a gap in
 * theirs. Dropping the item instead keeps the picker honest.
 *
 * `md` before `hd` for the sticker itself — these render at roughly 120 dp in a bubble, so the
 * larger encode buys nothing a phone can show and costs mobile data on a scrolling grid.
 */
function toStickerItem(item: KlipyItem): StickerItem[] {
  const file = item.file ?? {};
  const main =
    pick(file, ['md', 'hd', 'sm', 'xs'], 'webp') ?? pick(file, ['md', 'hd', 'sm', 'xs'], 'gif');
  const thumb =
    pick(file, ['xs', 'sm', 'md', 'hd'], 'webp') ?? pick(file, ['xs', 'sm', 'md', 'hd'], 'gif');

  const id = item.id ?? item.slug;
  if (id === undefined || main?.url === undefined) {
    return [];
  }
  // A missing thumbnail is not worth dropping the sticker over — 512×512 WebP is small enough to
  // serve as its own preview.
  const thumbUrl = thumb?.url ?? main.url;

  // Fails closed: an unrecognised host means a provider or config change, and the item is dropped
  // rather than handed to the client, so the result is an empty grid instead of a foreign link.
  if (!isAllowedStickerUrl(main.url) || !isAllowedStickerUrl(thumbUrl)) {
    return [];
  }
  return [
    {
      id: String(id),
      url: main.url,
      thumbUrl,
      width: main.width ?? 0,
      height: main.height ?? 0,
      // KLIPY's sticker catalogue is animated WebP throughout; a still one simply does not move.
      isAnimated: true,
    },
  ];
}
