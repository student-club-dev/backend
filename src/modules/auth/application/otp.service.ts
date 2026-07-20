import { createHash, randomInt } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { Env } from '../../../config/env';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { ACCOUNT_REPOSITORY, ACCOUNT_TYPE, AccountRepository } from '../domain/account.repository';
import { SMS_PROVIDER, SmsProvider } from '../domain/sms/sms-provider';
import { OtpRequestResult } from './otp.io';

/** Fixed dev code used in non-production when OTP_DEV_CODE is not set (see docs/architecture/otp-sms-eskiz.md). */
const DEFAULT_DEV_CODE = '111111';

/** Rolling window for the per-phone resend counter — enforces the D8 "~5/hour" SMS-budget cap. */
const RESEND_WINDOW_SECONDS = 3_600;

/**
 * OTP core (D1 phone-verification gate, D8 abuse limits). Redis-backed and wired per account type:
 * the module binds ACCOUNT_TYPE + the matching account repository, so one class serves both students
 * and business owners. Depends on the SmsProvider interface only — never on a concrete provider.
 *
 * Redis keys (all namespaced by account type):
 *   otp:<type>:<e164>          hash { hash, attempts }, TTL = OTP_TTL_SECONDS   — the active code
 *   otp:cooldown:<type>:<e164> string, TTL = OTP_RESEND_COOLDOWN_SECONDS        — resend cooldown
 *   otp:resend:<type>:<e164>   counter, TTL = RESEND_WINDOW_SECONDS             — hourly resend cap
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(ACCOUNT_TYPE) private readonly accountType: AccountType,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Generates, stores (hashed) and sends a one-time code to `phoneNumber`, enforcing the D8 limits. */
  async request(phoneNumber: string): Promise<OtpRequestResult> {
    const e164 = this.normalizePhone(phoneNumber);
    await this.assertNotInCooldown(e164);
    await this.assertResendAllowed(e164);

    const code = this.generateCode();
    const ttl = this.config.get('OTP_TTL_SECONDS', { infer: true });
    const cooldown = this.config.get('OTP_RESEND_COOLDOWN_SECONDS', { infer: true });

    const key = this.otpKey(e164);
    await this.redis.hset(key, { hash: this.hashCode(code), attempts: 0 });
    await this.redis.expire(key, ttl);

    await this.sms.send(e164, this.buildMessage(code));

    // Start the cooldown only after the SMS is accepted, so a failed send does not block a retry.
    await this.redis.set(this.cooldownKey(e164), '1', cooldown);

    return { sent: true, expiresInSeconds: ttl, resendCooldownSeconds: cooldown };
  }

  /** Verifies `code` for `phoneNumber`; on success consumes the code (one-time) and marks the phone verified. */
  async verify(accountId: string, phoneNumber: string, code: string): Promise<void> {
    const e164 = this.normalizePhone(phoneNumber);
    const key = this.otpKey(e164);

    const stored = await this.redis.hgetall(key);
    if (Object.keys(stored).length === 0) {
      throw new AppException(
        ERROR_CODE.OTP_EXPIRED,
        410,
        'Kod eskirgan yoki topilmadi, qaytadan so‘rang',
      );
    }

    const attempts = Number(stored.attempts ?? '0');
    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
    if (attempts >= maxAttempts) {
      throw new AppException(
        ERROR_CODE.OTP_TOO_MANY_ATTEMPTS,
        429,
        'Urinishlar soni oshib ketdi, yangi kod so‘rang',
      );
    }

    if (stored.hash !== this.hashCode(code)) {
      await this.redis.hincrby(key, 'attempts', 1);
      throw new AppException(ERROR_CODE.OTP_INVALID, 422, 'Kod noto‘g‘ri');
    }

    await this.redis.del(key);
    await this.accounts.markPhoneVerified(accountId, e164);
  }

  private async assertNotInCooldown(e164: string): Promise<void> {
    if (await this.redis.exists(this.cooldownKey(e164))) {
      throw new AppException(
        ERROR_CODE.OTP_COOLDOWN,
        429,
        'Iltimos, biroz kutib qaytadan urinib ko‘ring',
      );
    }
  }

  private async assertResendAllowed(e164: string): Promise<void> {
    const key = this.resendKey(e164);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, RESEND_WINDOW_SECONDS);
    }
    if (count > this.config.get('OTP_MAX_RESEND', { infer: true })) {
      throw new AppException(
        ERROR_CODE.OTP_RESEND_LIMIT,
        429,
        'SMS yuborish chegarasi oshib ketdi, keyinroq urinib ko‘ring',
      );
    }
  }

  /** Non-prod: a fixed dev code (OTP_DEV_CODE or 111111) for testing. Prod: a secure random 6-digit. */
  private generateCode(): string {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'production') {
      return this.config.get('OTP_DEV_CODE', { infer: true }) ?? DEFAULT_DEV_CODE;
    }
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private buildMessage(code: string): string {
    return `ElonUz tasdiqlash kodi: ${code}`;
  }

  /** Normalises common UZ inputs (+998…, 998…, 9-digit national) to E.164 (+998XXXXXXXXX). */
  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('998')) {
      return `+${digits}`;
    }
    if (digits.length === 9) {
      return `+998${digits}`;
    }
    throw AppException.validation({ phoneNumber: 'Telefon raqami noto‘g‘ri' });
  }

  private otpKey(e164: string): string {
    return `otp:${this.accountType}:${e164}`;
  }

  private cooldownKey(e164: string): string {
    return `otp:cooldown:${this.accountType}:${e164}`;
  }

  private resendKey(e164: string): string {
    return `otp:resend:${this.accountType}:${e164}`;
  }
}
