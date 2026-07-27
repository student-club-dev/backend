import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { OtpDeliveryChannel } from '../../domain/otp/otp-delivery-channel';

/**
 * Selects the active OTP delivery channel from config. Fail-fast: DevDeliveryChannel logs the code
 * and must never run in production, so OTP_CHANNEL=dev + NODE_ENV=production throws at boot.
 */
export function createOtpDeliveryChannel(
  channel: Env['OTP_CHANNEL'],
  nodeEnv: Env['NODE_ENV'],
  dev: OtpDeliveryChannel,
  telegram: OtpDeliveryChannel,
  sms: OtpDeliveryChannel,
): OtpDeliveryChannel {
  if (channel === 'dev' && nodeEnv === 'production') {
    throw new AppException(
      ERROR_CODE.INTERNAL_ERROR,
      500,
      'DevDeliveryChannel production muhitida ishlatib bo‘lmaydi — OTP_CHANNEL=telegram qiling',
    );
  }
  if (channel === 'telegram') return telegram;
  if (channel === 'sms') return sms;
  return dev;
}
