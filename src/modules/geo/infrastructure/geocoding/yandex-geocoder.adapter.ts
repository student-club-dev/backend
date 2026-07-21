import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { GeocoderMatch, GeocoderPort, GeocoderReverseResult } from '../../domain/geocoder.port';

/** Minimal shape of the Yandex Geocoder 1.x JSON we read (everything optional — it is external). */
interface YandexGeoObject {
  metaDataProperty?: { GeocoderMetaData?: { text?: string; precision?: string } };
  Point?: { pos?: string };
}
interface YandexFeatureMember {
  GeoObject?: YandexGeoObject;
}
interface YandexResponse {
  response?: { GeoObjectCollection?: { featureMember?: YandexFeatureMember[] } };
}

/** Yandex `precision` → approximate 0..1 confidence (Yandex gives no numeric score). */
const PRECISION_CONFIDENCE: Record<string, number> = {
  exact: 1,
  number: 0.9,
  near: 0.8,
  range: 0.7,
  street: 0.6,
  other: 0.4,
};

/** How many forward-geocode candidates to request. */
const FORWARD_RESULTS = 5;

/**
 * Production Yandex Geocoder client. Proxies the paid HTTP API (the api key stays server-side) and
 * returns pure provider data — region/district resolution and bounds live in GeocodingService. Any
 * transport/parse failure maps to GEOCODER_UNAVAILABLE (503) so the client can retry; it is never
 * swallowed. Not activated unless GEOCODER_PROVIDER=yandex.
 */
@Injectable()
export class YandexGeocoderAdapter implements GeocoderPort {
  private readonly logger = new Logger(YandexGeocoderAdapter.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async geocode(query: string): Promise<GeocoderMatch[]> {
    const members = await this.request({ geocode: query, results: String(FORWARD_RESULTS) });
    return members
      .map((member) => this.toMatch(member))
      .filter((match): match is GeocoderMatch => match !== null);
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocoderReverseResult> {
    // Yandex expects "longitude,latitude" order.
    const members = await this.request({ geocode: `${lng},${lat}`, results: '1' });
    const text = members[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData?.text;
    return { address: text ?? null };
  }

  /** Issues a Yandex Geocoder request and returns its featureMember array (empty on no matches). */
  private async request(params: Record<string, string>): Promise<YandexFeatureMember[]> {
    const url = this.buildUrl(params);
    let response: Response;
    try {
      response = await fetch(url, { method: 'GET' });
    } catch (error) {
      this.logger.error(`Yandex geocoder request failed: ${String(error)}`);
      throw this.unavailable();
    }
    if (!response.ok) {
      this.logger.error(`Yandex geocoder returned ${response.status}`);
      throw this.unavailable();
    }
    const payload = (await response.json()) as YandexResponse;
    return payload.response?.GeoObjectCollection?.featureMember ?? [];
  }

  /** Maps one Yandex featureMember to a GeocoderMatch, or null if it has no usable point. */
  private toMatch(member: YandexFeatureMember): GeocoderMatch | null {
    const geoObject = member.GeoObject;
    const pos = geoObject?.Point?.pos;
    if (pos === undefined) {
      return null;
    }
    // "longitude latitude" (space-separated).
    const [lngRaw, latRaw] = pos.split(' ');
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return null;
    }
    const meta = geoObject?.metaDataProperty?.GeocoderMetaData;
    const confidence =
      meta?.precision !== undefined ? (PRECISION_CONFIDENCE[meta.precision] ?? null) : null;
    return { lat, lng, formattedAddress: meta?.text ?? '', confidence };
  }

  private buildUrl(params: Record<string, string>): string {
    const apiKey = this.config.get('YANDEX_GEOCODER_API_KEY', { infer: true });
    if (apiKey === undefined || apiKey === '') {
      this.logger.error('YANDEX_GEOCODER_API_KEY is not configured');
      throw this.unavailable();
    }
    const query = new URLSearchParams({ apikey: apiKey, format: 'json', ...params });
    return `${this.config.get('YANDEX_GEOCODER_BASE_URL', { infer: true })}/?${query.toString()}`;
  }

  private unavailable(): AppException {
    return new AppException(
      ERROR_CODE.GEOCODER_UNAVAILABLE,
      503,
      'Geokodlash xizmati vaqtincha ishlamayapti, keyinroq urinib ko‘ring',
    );
  }
}
