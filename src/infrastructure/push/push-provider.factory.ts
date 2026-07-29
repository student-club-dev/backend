import { ERROR_CODE } from '../../common/errors/error-code';
import { AppException } from '../../common/exceptions/app.exception';
import type { Env } from '../../config/env';
import { PushProvider } from './push-provider';

/**
 * Selects the active push provider from config. Fail-fast, mirroring the SMS provider: the dev
 * implementation only writes a log line, so booting production with `PUSH_PROVIDER=dev` would mean
 * every offline notification is silently dropped and nobody would notice until users complained
 * about missed messages. Enabling real push is env-only: set `PUSH_PROVIDER=fcm`.
 */
export function createPushProvider(
  provider: Env['PUSH_PROVIDER'],
  nodeEnv: Env['NODE_ENV'],
  dev: PushProvider,
  fcm: PushProvider,
): PushProvider {
  if (provider === 'dev' && nodeEnv === 'production') {
    throw new AppException(
      ERROR_CODE.INTERNAL_ERROR,
      500,
      'DevPushProvider production muhitida ishlatib bo‘lmaydi — PUSH_PROVIDER=fcm qiling',
    );
  }
  return provider === 'fcm' ? fcm : dev;
}
