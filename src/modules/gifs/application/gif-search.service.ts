import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { Env } from '../../../config/env';
import { MediaProvider } from '../../media/domain/enums/media-kind.enum';
import { GifItem, GifPage, isAllowedGifUrl } from '../domain/gif-source';

/** What we ask Tenor for and what we keep. Anything not listed here never reaches the client. */
interface TenorMediaFormat {
  url?: string;
  dims?: number[];
  duration?: number;
}

interface TenorResult {
  id?: string;
  media_formats?: Record<string, TenorMediaFormat>;
}

interface TenorResponse {
  results?: TenorResult[];
  next?: string;
}

const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Proxy for provider GIF search (chat media spec §4.6).
 *
 * The whole reason this is a server endpoint rather than a direct call from the app is the API key:
 * anything shipped in the binary comes straight back out of a decompile. The key is read from the
 * environment and never appears in a response.
 */
@Injectable()
export class GifSearchService {
  private readonly logger = new Logger(GifSearchService.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get('TENOR_API_KEY', { infer: true });
    this.baseUrl = config.get('TENOR_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  /** Search, or the featured list when `query` is empty. */
  async search(query: string, limit: number, pos: string | null, locale: string): Promise<GifPage> {
    const key = this.requireKey();
    const path = query.length === 0 ? 'featured' : 'search';
    const url = new URL(`${this.baseUrl}/${path}`);
    url.searchParams.set('key', key);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('locale', locale);
    // Ask only for the formats we actually serve, so the response stays small.
    url.searchParams.set('media_filter', 'mp4,tinymp4,tinygif,nanogif');
    url.searchParams.set('contentfilter', 'medium');
    if (query.length > 0) {
      url.searchParams.set('q', query);
    }
    if (pos !== null) {
      url.searchParams.set('pos', pos);
    }

    const body = await this.fetchJson<TenorResponse>(url);
    return {
      items: (body.results ?? []).flatMap(toGifItem),
      next: typeof body.next === 'string' && body.next.length > 0 ? body.next : null,
      provider: MediaProvider.TENOR,
    };
  }

  /**
   * Tells Tenor a result was actually shared. Required by their terms, and it is what makes their
   * ranking improve over time. Best-effort: a failure here must never fail the user's send.
   */
  async registerShare(id: string, query: string | null): Promise<void> {
    const key = this.requireKey();
    const url = new URL(`${this.baseUrl}/registershare`);
    url.searchParams.set('key', key);
    url.searchParams.set('id', id);
    if (query !== null && query.length > 0) {
      url.searchParams.set('q', query);
    }
    try {
      await this.fetchJson(url);
    } catch (error) {
      this.logger.warn(`Tenor registershare failed for ${id}: ${(error as Error).message}`);
    }
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
    const abort = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response: globalThis.Response;
    try {
      response = await fetch(url, { signal: abort });
    } catch (error) {
      // Never surface the URL — it carries the API key in a query parameter.
      this.logger.warn(`Tenor request failed: ${(error as Error).message}`);
      throw new AppException(ERROR_CODE.GIF_PROVIDER_ERROR, 502, 'GIF xizmati javob bermadi');
    }
    if (!response.ok) {
      this.logger.warn(`Tenor answered ${response.status}`);
      throw new AppException(ERROR_CODE.GIF_PROVIDER_ERROR, 502, 'GIF xizmati javob bermadi');
    }
    return (await response.json()) as T;
  }
}

/**
 * Picks the MP4 rendition and drops anything whose URL is not on the provider CDN — the same
 * allowlist a client-supplied `gif` object has to pass, applied here so a compromised or changed
 * upstream cannot inject a foreign host either.
 */
function toGifItem(result: TenorResult): GifItem[] {
  const formats = result.media_formats ?? {};
  const chosen = formats.mp4 ?? formats.tinymp4;
  const thumb = formats.tinygif ?? formats.nanogif;
  if (result.id === undefined || chosen?.url === undefined || thumb?.url === undefined) {
    return [];
  }
  if (!isAllowedGifUrl(chosen.url) || !isAllowedGifUrl(thumb.url)) {
    return [];
  }
  const [width, height] = chosen.dims ?? [];
  return [
    {
      id: result.id,
      url: chosen.url,
      thumbUrl: thumb.url,
      width: width ?? 0,
      height: height ?? 0,
      durationMs: chosen.duration === undefined ? null : Math.round(chosen.duration * 1000),
    },
  ];
}
