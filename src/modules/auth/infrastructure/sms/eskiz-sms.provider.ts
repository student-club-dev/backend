import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { SmsProvider } from '../../domain/sms/sms-provider';

interface EskizLoginResponse {
  data?: { token?: string };
}

/**
 * Production Eskiz (notify.eskiz.uz) SMS client. Logs in with email+password for a bearer token,
 * caches it, and refreshes once on a 401 before retrying. Sends via /api/message/sms/send. Never
 * logs the message text (it carries the OTP code). Not activated unless SMS_PROVIDER=eskiz.
 */
@Injectable()
export class EskizSmsProvider implements SmsProvider {
  private readonly logger = new Logger(EskizSmsProvider.name);
  private token: string | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(phoneNumber: string, text: string): Promise<void> {
    const response = await this.postSms(await this.authToken(), phoneNumber, text);
    // A cached token that Eskiz has expired → refresh once and retry.
    if (response.status === 401) {
      this.token = null;
      const retry = await this.postSms(await this.authToken(), phoneNumber, text);
      this.ensureAccepted(retry, phoneNumber);
      return;
    }
    this.ensureAccepted(response, phoneNumber);
  }

  private async authToken(): Promise<string> {
    if (this.token !== null) {
      return this.token;
    }
    this.token = await this.login();
    return this.token;
  }

  private async login(): Promise<string> {
    const email = this.config.get('ESKIZ_EMAIL', { infer: true });
    const password = this.config.get('ESKIZ_PASSWORD', { infer: true });
    if (!email || !password) {
      throw new AppException(
        ERROR_CODE.INTERNAL_ERROR,
        500,
        'Eskiz hisob ma’lumotlari sozlanmagan',
      );
    }

    const body = new FormData();
    body.append('email', email);
    body.append('password', password);

    const response = await fetch(`${this.baseUrl()}/api/auth/login`, { method: 'POST', body });
    if (!response.ok) {
      this.logger.error(`Eskiz login failed (${response.status})`);
      throw this.smsUnavailable();
    }

    const payload = (await response.json()) as EskizLoginResponse;
    const token = payload.data?.token;
    if (!token) {
      this.logger.error('Eskiz login response had no token');
      throw this.smsUnavailable();
    }
    return token;
  }

  private postSms(token: string, phoneNumber: string, text: string): Promise<Response> {
    const body = new FormData();
    body.append('mobile_phone', phoneNumber.replace(/^\+/, ''));
    body.append('message', text);
    body.append('from', this.config.get('ESKIZ_FROM', { infer: true }));

    return fetch(`${this.baseUrl()}/api/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
  }

  private ensureAccepted(response: Response, phoneNumber: string): void {
    if (!response.ok) {
      this.logger.error(`Eskiz send failed (${response.status}) for ${this.mask(phoneNumber)}`);
      throw this.smsUnavailable();
    }
    this.logger.log(`Eskiz accepted SMS for ${this.mask(phoneNumber)}`);
  }

  private baseUrl(): string {
    return this.config.get('ESKIZ_BASE_URL', { infer: true });
  }

  private mask(phoneNumber: string): string {
    return phoneNumber.length <= 6 ? '***' : `${phoneNumber.slice(0, 4)}***${phoneNumber.slice(-2)}`;
  }

  private smsUnavailable(): AppException {
    return new AppException(
      ERROR_CODE.INTERNAL_ERROR,
      502,
      'SMS yuborib bo‘lmadi, keyinroq urinib ko‘ring',
    );
  }
}
