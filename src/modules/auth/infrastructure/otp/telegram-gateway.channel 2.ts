import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { OtpDeliveryChannel } from '../../domain/otp/otp-delivery-channel';

interface GatewayResponse {
  ok?: boolean;
}

/**
 * Telegram Gateway (gatewayapi.telegram.org) OTP channel. Delivers OUR code by phone number via
 * /sendVerificationMessage. Never logs the code. Active only when OTP_CHANNEL=telegram.
 */
@Injectable()
export class TelegramGatewayChannel implements OtpDeliveryChannel {
  private readonly logger = new Logger(TelegramGatewayChannel.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async deliver(phoneNumber: string, code: string): Promise<void> {
    const token = this.config.get('TELEGRAM_GATEWAY_TOKEN', { infer: true });
    if (!token) {
      throw new AppException(ERROR_CODE.INTERNAL_ERROR, 500, 'Telegram Gateway token sozlanmagan');
    }
    const base = this.config.get('TELEGRAM_GATEWAY_BASE_URL', { infer: true });
    const ttl = this.config.get('OTP_TTL_SECONDS', { infer: true });

    let response: Response;
    try {
      response = await fetch(`${base}/sendVerificationMessage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber, code, ttl }),
      });
    } catch {
      throw this.unavailable();
    }

    const payload = (await response.json().catch(() => null)) as GatewayResponse | null;
    if (!response.ok || payload?.ok !== true) {
      this.logger.error(
        `Telegram Gateway send failed (${response.status}) for ${this.mask(phoneNumber)}`,
      );
      throw this.unavailable();
    }
    this.logger.log(`Telegram Gateway accepted code for ${this.mask(phoneNumber)}`);
  }

  private mask(p: string): string {
    return p.length <= 6 ? '***' : `${p.slice(0, 4)}***${p.slice(-2)}`;
  }

  private unavailable(): AppException {
    return new AppException(
      ERROR_CODE.INTERNAL_ERROR,
      502,
      'Kod yuborib bo‘lmadi, keyinroq urinib ko‘ring',
    );
  }
}
