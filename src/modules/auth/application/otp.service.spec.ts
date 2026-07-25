import { createHash } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { Env } from '../../../config/env';
import type { RedisService } from '../../../infrastructure/cache/redis.service';
import { AccountRepository } from '../domain/account.repository';
import { OtpDeliveryChannel } from '../domain/otp/otp-delivery-channel';
import { OtpService } from './otp.service';

const PHONE = '+998901234567';
const OTP_KEY = 'otp:student:phone_verify:+998901234567';
const COOLDOWN_KEY = 'otp:cooldown:student:phone_verify:+998901234567';
const RESEND_KEY = 'otp:resend:student:phone_verify:+998901234567';
const RESET_OTP_KEY = 'otp:student:password_reset:+998901234567';
const RESET_COOLDOWN_KEY = 'otp:cooldown:student:password_reset:+998901234567';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    NODE_ENV: 'test',
    OTP_TTL_SECONDS: 300,
    OTP_MAX_ATTEMPTS: 5,
    OTP_RESEND_COOLDOWN_SECONDS: 60,
    OTP_MAX_RESEND: 5,
    OTP_DEV_CODE: '111111',
    ...overrides,
  };
  return { get: (key: string): unknown => values[key] } as unknown as ConfigService<Env, true>;
}

function makeRedis(overrides: Partial<Record<keyof RedisService, unknown>> = {}): RedisService {
  return {
    set: jest.fn().mockResolvedValue('OK'),
    exists: jest.fn().mockResolvedValue(false),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(undefined),
    hset: jest.fn().mockResolvedValue(undefined),
    hgetall: jest.fn().mockResolvedValue({}),
    hincrby: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as RedisService;
}

function makeChannel(): OtpDeliveryChannel {
  return { deliver: jest.fn().mockResolvedValue(undefined) };
}

function makeAccounts(overrides: Partial<AccountRepository> = {}): AccountRepository {
  return {
    findByEmail: jest.fn().mockResolvedValue(null),
    findByPhone: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    createFromOAuth: jest.fn(),
    markPhoneVerified: jest.fn().mockResolvedValue(undefined),
    setPassword: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeService(
  redis: RedisService,
  channel: OtpDeliveryChannel = makeChannel(),
  accounts: AccountRepository = makeAccounts(),
  config: ConfigService<Env, true> = makeConfig(),
): OtpService {
  return new OtpService(AccountType.STUDENT, accounts, channel, redis, config);
}

describe('OtpService', () => {
  describe('request', () => {
    it('stores the hashed code (attempts=0, TTL), delivers the code, sets the cooldown, returns the result', async () => {
      const redis = makeRedis();
      const channel = makeChannel();
      const result = await makeService(redis, channel).request(PHONE, 'phone_verify');

      expect(result).toEqual({ sent: true, expiresInSeconds: 300, resendCooldownSeconds: 60 });
      expect(redis.hset).toHaveBeenCalledWith(OTP_KEY, { hash: sha256('111111'), attempts: 0 });
      expect(redis.expire).toHaveBeenCalledWith(OTP_KEY, 300);
      expect(channel.deliver).toHaveBeenCalledWith(PHONE, '111111');
      expect(redis.set).toHaveBeenCalledWith(COOLDOWN_KEY, '1', 60);
    });

    it('normalises a 9-digit national number to E.164', async () => {
      const redis = makeRedis();
      const channel = makeChannel();
      await makeService(redis, channel).request('901234567', 'phone_verify');

      expect(channel.deliver).toHaveBeenCalledWith(PHONE, expect.any(String));
      expect(redis.hset).toHaveBeenCalledWith(OTP_KEY, expect.any(Object));
    });

    it('throws OTP_COOLDOWN and does not deliver while within the resend cooldown', async () => {
      const redis = makeRedis({ exists: jest.fn().mockResolvedValue(true) });
      const channel = makeChannel();

      await expect(
        makeService(redis, channel).request(PHONE, 'phone_verify'),
      ).rejects.toMatchObject({
        code: ERROR_CODE.OTP_COOLDOWN,
        status: 429,
      });
      expect(redis.incr).not.toHaveBeenCalled();
      expect(channel.deliver).not.toHaveBeenCalled();
    });

    it('throws OTP_RESEND_LIMIT once the resend count exceeds OTP_MAX_RESEND', async () => {
      const redis = makeRedis({ incr: jest.fn().mockResolvedValue(6) });
      const channel = makeChannel();

      await expect(
        makeService(redis, channel).request(PHONE, 'phone_verify'),
      ).rejects.toMatchObject({
        code: ERROR_CODE.OTP_RESEND_LIMIT,
        status: 429,
      });
      expect(channel.deliver).not.toHaveBeenCalled();
    });

    it('sets the resend-window TTL on the first resend of the window', async () => {
      const redis = makeRedis({ incr: jest.fn().mockResolvedValue(1) });
      await makeService(redis).request(PHONE, 'phone_verify');

      expect(redis.expire).toHaveBeenCalledWith(RESEND_KEY, 3_600);
    });

    it('honours OTP_DEV_CODE outside production', async () => {
      const redis = makeRedis();
      const channel = makeChannel();
      await makeService(
        redis,
        channel,
        makeAccounts(),
        makeConfig({ OTP_DEV_CODE: '222222' }),
      ).request(PHONE, 'phone_verify');

      expect(channel.deliver).toHaveBeenCalledWith(PHONE, '222222');
      expect(redis.hset).toHaveBeenCalledWith(OTP_KEY, { hash: sha256('222222'), attempts: 0 });
    });

    it('defaults to the fixed 111111 dev code when OTP_DEV_CODE is unset outside production', async () => {
      const channel = makeChannel();
      await makeService(
        makeRedis(),
        channel,
        makeAccounts(),
        makeConfig({ OTP_DEV_CODE: undefined }),
      ).request(PHONE, 'phone_verify');

      expect(channel.deliver).toHaveBeenCalledWith(PHONE, '111111');
    });

    it('generates a secure random 6-digit code in production', async () => {
      const redis = makeRedis();
      const channel = makeChannel();
      await makeService(
        redis,
        channel,
        makeAccounts(),
        makeConfig({ NODE_ENV: 'production' }),
      ).request(PHONE, 'phone_verify');

      const code = (channel.deliver as jest.Mock).mock.calls[0][1] as string;
      expect(code).toMatch(/^\d{6}$/);
      expect(redis.hset).toHaveBeenCalledWith(OTP_KEY, { hash: sha256(code), attempts: 0 });
    });

    it('namespaces the Redis keys by purpose (password_reset ≠ phone_verify)', async () => {
      const redis = makeRedis();
      await makeService(redis).request(PHONE, 'password_reset');

      expect(redis.hset).toHaveBeenCalledWith(RESET_OTP_KEY, {
        hash: sha256('111111'),
        attempts: 0,
      });
      expect(redis.set).toHaveBeenCalledWith(RESET_COOLDOWN_KEY, '1', 60);
      // The phone_verify keys are untouched.
      expect(redis.hset).not.toHaveBeenCalledWith(OTP_KEY, expect.any(Object));
    });
  });

  describe('verify', () => {
    it('succeeds: deletes the key (one-time) and marks the phone verified', async () => {
      const redis = makeRedis({
        hgetall: jest.fn().mockResolvedValue({ hash: sha256('111111'), attempts: '0' }),
      });
      const accounts = makeAccounts();

      await expect(
        makeService(redis, makeChannel(), accounts).verify('acc-1', PHONE, '111111'),
      ).resolves.toBeUndefined();
      expect(redis.del).toHaveBeenCalledWith(OTP_KEY);
      expect(accounts.markPhoneVerified).toHaveBeenCalledWith('acc-1', PHONE);
    });

    it('throws OTP_EXPIRED when no code is stored', async () => {
      const redis = makeRedis({ hgetall: jest.fn().mockResolvedValue({}) });
      const accounts = makeAccounts();

      await expect(
        makeService(redis, makeChannel(), accounts).verify('acc-1', PHONE, '111111'),
      ).rejects.toMatchObject({ code: ERROR_CODE.OTP_EXPIRED, status: 410 });
      expect(accounts.markPhoneVerified).not.toHaveBeenCalled();
    });

    it('throws OTP_INVALID and increments attempts on a mismatch', async () => {
      const redis = makeRedis({
        hgetall: jest.fn().mockResolvedValue({ hash: sha256('999999'), attempts: '0' }),
      });
      const accounts = makeAccounts();

      await expect(
        makeService(redis, makeChannel(), accounts).verify('acc-1', PHONE, '111111'),
      ).rejects.toMatchObject({ code: ERROR_CODE.OTP_INVALID, status: 422 });
      expect(redis.hincrby).toHaveBeenCalledWith(OTP_KEY, 'attempts', 1);
      expect(redis.del).not.toHaveBeenCalled();
      expect(accounts.markPhoneVerified).not.toHaveBeenCalled();
    });

    it('throws OTP_TOO_MANY_ATTEMPTS when attempts have reached the max', async () => {
      const redis = makeRedis({
        hgetall: jest.fn().mockResolvedValue({ hash: sha256('111111'), attempts: '5' }),
      });

      await expect(makeService(redis).verify('acc-1', PHONE, '111111')).rejects.toMatchObject({
        code: ERROR_CODE.OTP_TOO_MANY_ATTEMPTS,
        status: 429,
      });
      expect(redis.hincrby).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe('verifyPasswordReset', () => {
    it('consumes the password_reset code, returns the normalised phone, and never marks the phone verified', async () => {
      const redis = makeRedis({
        hgetall: jest.fn().mockResolvedValue({ hash: sha256('111111'), attempts: '0' }),
      });
      const accounts = makeAccounts();

      const result = await makeService(redis, makeChannel(), accounts).verifyPasswordReset(
        PHONE,
        '111111',
      );

      expect(result).toBe(PHONE);
      expect(redis.del).toHaveBeenCalledWith(RESET_OTP_KEY);
      expect(accounts.markPhoneVerified).not.toHaveBeenCalled();
    });

    it('throws OTP_INVALID on a wrong password_reset code', async () => {
      const redis = makeRedis({
        hgetall: jest.fn().mockResolvedValue({ hash: sha256('999999'), attempts: '0' }),
      });

      await expect(makeService(redis).verifyPasswordReset(PHONE, '111111')).rejects.toMatchObject({
        code: ERROR_CODE.OTP_INVALID,
        status: 422,
      });
      expect(redis.hincrby).toHaveBeenCalledWith(RESET_OTP_KEY, 'attempts', 1);
    });

    it('throws OTP_EXPIRED when no password_reset code is stored', async () => {
      const redis = makeRedis({ hgetall: jest.fn().mockResolvedValue({}) });

      await expect(makeService(redis).verifyPasswordReset(PHONE, '111111')).rejects.toMatchObject({
        code: ERROR_CODE.OTP_EXPIRED,
        status: 410,
      });
    });
  });
});
