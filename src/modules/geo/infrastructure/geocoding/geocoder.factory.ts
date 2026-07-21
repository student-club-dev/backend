import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { GeocoderPort } from '../../domain/geocoder.port';

/**
 * Selects the active geocoding provider from config. Fail-fast: DevGeocoderAdapter makes no external
 * call and returns no results, so it must never run in production — booting with GEOCODER_PROVIDER=dev
 * + NODE_ENV=production throws. Enabling real geocoding is env-only: set GEOCODER_PROVIDER=yandex
 * (which needs YANDEX_GEOCODER_API_KEY). Mirrors createSmsProvider.
 */
export function createGeocoder(
  provider: Env['GEOCODER_PROVIDER'],
  nodeEnv: Env['NODE_ENV'],
  dev: GeocoderPort,
  yandex: GeocoderPort,
): GeocoderPort {
  if (provider === 'dev' && nodeEnv === 'production') {
    throw new AppException(
      ERROR_CODE.INTERNAL_ERROR,
      500,
      'DevGeocoderAdapter production muhitida ishlatib bo‘lmaydi — GEOCODER_PROVIDER=yandex qiling',
    );
  }
  return provider === 'yandex' ? yandex : dev;
}
