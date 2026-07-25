import { createHash, randomInt } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { Env } from '../../../config/env';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { ACCOUNT_REPOSITORY, ACCOUNT_TYPE, AccountRepository } from '../domain/account.repository';
import { OTP_DELIVERY_CHANNEL, OtpDeliveryChannel } from '../domain/otp/otp-delivery-channel';
import { OtpPurpose, OtpRequestResult } from './otp.io';

/** Fixed dev code used in non-production when OTP_DEV_CODE is not set (see docs/architecture/otp-sms-eskiz.md). */
const DEFAULT_DEV_CODE = '111111';

/** Rolling window for the per-phone resend counter — enforces the D8 "~5/hour" SMS-budget cap. */
const RESEND_WINDOW_SECONDS = 3_600;

/**
 * OTP core (D1 phone-verification gate, D8 abuse limits). Redis-backed and wired per account type:
 * the module binds ACCOUNT_TYPE + the matching account repository, so one class serves both students
 * and business owners. Depends on the SmsProvider interface only — never on a concrete provider.
 *
 * Redis keys (namespaced by account type AND purpose — phone_verify / password_reset are independent):
 *   otp:<type>:<purpose>:<e164>          hash { hash, attempts }, TTL = OTP_TTL_SECONDS  — the active code
 *   otp:cooldown:<type>:<purpose>:<e164> string, TTL = OTP_RESEND_COOLDOWN_SECONDS         — resend cooldown
 *   otp:resend:<type>:<purpose>:<e164>   counter, TTL = RESEND_WINDOW_SECONDS              — hourly resend cap
 */
@Injectable()
export class OtpService {
  constructor(
    @Inject(ACCOUNT_TYPE) private readonly accountType: AccountType,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(OTP_DELIVERY_CHANNEL) private readonly channel: OtpDeliveryChannel,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Generates, stores (hashed) and sends a one-time code to `phoneNumber` for `purpose`, enforcing the D8 limits. */
  async request(phoneNumber: string, purpose: OtpPurpose): Promise<OtpRequestResult> {
    const e164 = this.normalizePhone(phoneNumber);
    await this.assertNotInCooldown(e164, purpose);
    await this.assertResendAllowed(e164, purpose);

    const code = this.generateCode();
    const ttl = this.config.get('OTP_TTL_SECONDS', { infer: true });
    const cooldown = this.config.get('OTP_RESEND_COOLDOWN_SECONDS', { infer: true });

    const key = this.otpKey(e164, purpose);
    await this.redis.hset(key, { hash: this.hashCode(code), attempts: 0 });
    await this.redis.expire(key, ttl);

    await this.channel.deliver(e164, code);

    // Start the cooldown only after the SMS is accepted, so a failed send does not block a retry.
    await this.redis.set(this.cooldownKey(e164, purpose), '1', cooldown);

    return { sent: true, expiresInSeconds: ttl, resendCooldownSeconds: cooldown };
  }

  /**
   * Phone-verification (D1): verifies the `phone_verify` code for `phoneNumber`; on success
   * consumes the code (one-time) and marks the account's phone as verified.
   */
  async verify(accountId: string, phoneNumber: string, code: string): Promise<void> {
    const e164 = this.normalizePhone(phoneNumber);
    await this.consumeCode(e164, code, 'phone_verify');
    await this.accounts.markPhoneVerified(accountId, e164);
  }

  /**
   * Password-reset (D5): verifies the `password_reset` code for `phoneNumber` and consumes it
   * (one-time). No phone-verified side effect. Returns the normalised phone for the caller to
   * resolve the account. Throws the usual OTP_* errors on failure.
   */
  async verifyPasswordReset(phoneNumber: string, code: string): Promise<string> {
    const e164 = this.normalizePhone(phoneNumber);
    await this.consumeCode(e164, code, 'password_reset');
    return e164;
  }

  /** Verifies `code` against the stored `purpose` code for `e164` and consumes it on success. */
  private async consumeCode(e164: string, code: string, purpose: OtpPurpose): Promise<void> {
    const key = this.otpKey(e164, purpose);

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
  }

  private async assertNotInCooldown(e164: string, purpose: OtpPurpose): Promise<void> {
    if (await this.redis.exists(this.cooldownKey(e164, purpose))) {
      throw new AppException(
        ERROR_CODE.OTP_COOLDOWN,
        429,
        'Iltimos, biroz kutib qaytadan urinib ko‘ring',
      );
    }
  }

  private async assertResendAllowed(e164: string, purpose: OtpPurpose): Promise<void> {
    const key = this.resendKey(e164, purpose);
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

  private otpKey(e164: string, purpose: OtpPurpose): string {
    return `otp:${this.accountType}:${purpose}:${e164}`;
  }

  private cooldownKey(e164: string, purpose: OtpPurpose): string {
    return `otp:cooldown:${this.accountType}:${purpose}:${e164}`;
  }

  private resendKey(e164: string, purpose: OtpPurpose): string {
    return `otp:resend:${this.accountType}:${purpose}:${e164}`;
  }
}
