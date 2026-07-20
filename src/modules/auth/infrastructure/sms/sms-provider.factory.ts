import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { SmsProvider } from '../../domain/sms/sms-provider';

/**
 * Selects the active SMS provider from config. Fail-fast: DevSmsProvider never sends a real SMS and
 * logs the code, so it must never run in production — booting with SMS_PROVIDER=dev + NODE_ENV=production
 * throws. Enabling real SMS is env-only: set SMS_PROVIDER=eskiz.
 */
export function createSmsProvider(
  provider: Env['SMS_PROVIDER'],
  nodeEnv: Env['NODE_ENV'],
  dev: SmsProvider,
  eskiz: SmsProvider,
): SmsProvider {
  if (provider === 'dev' && nodeEnv === 'production') {
    throw new AppException(
      ERROR_CODE.INTERNAL_ERROR,
      500,
      'DevSmsProvider production muhitida ishlatib bo‘lmaydi — SMS_PROVIDER=eskiz qiling',
    );
  }
  return provider === 'eskiz' ? eskiz : dev;
}
