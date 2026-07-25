# Telegram Gateway OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver OTP codes through Telegram Gateway as a selectable delivery channel, without changing OTP generation/verification.

**Architecture:** Introduce an `OtpDeliveryChannel` port (`deliver(phone, code)`) with three implementations — Dev (logs), Telegram Gateway (HTTP), SMS (wraps the existing `SmsProvider`) — chosen by `OTP_CHANNEL` via a factory that fails fast on `dev`+production. `OtpService` keeps generating the code and verifying it in Redis; it only swaps its single delivery call. `buildOtpMessage` moves from `OtpService` into the SMS channel.

**Tech Stack:** NestJS, TypeScript (strict), Zod config, Jest. Native `fetch` for the Gateway HTTP call.

---

### Task 1: Config — add OTP_CHANNEL + Telegram Gateway env vars

**Files:**
- Modify: `src/config/env.ts` (SMS block, near `ESKIZ_*`)
- Modify: `.env.example` (SMS OTP block)

- [ ] **Step 1: Add the Zod fields** in `src/config/env.ts`, right after the `ESKIZ_*` lines:

```ts
  // OTP delivery channel: `dev` logs the code (never in prod), `telegram` sends via Telegram
  // Gateway, `sms` sends via the SMS provider. Env-only switch, mirrors SMS_PROVIDER.
  OTP_CHANNEL: z.enum(['dev', 'telegram', 'sms']).default('dev'),
  TELEGRAM_GATEWAY_TOKEN: z.string().optional(),
  TELEGRAM_GATEWAY_BASE_URL: z.string().url().default('https://gatewayapi.telegram.org'),
```

- [ ] **Step 2: Document them** in `.env.example`, after the `ESKIZ_BASE_URL` line:

```dotenv
# OTP delivery channel: `dev` logs the code (local only); `telegram` sends via Telegram Gateway;
# `sms` sends via SMS_PROVIDER. `dev` + NODE_ENV=production refuses to boot (mirrors SMS_PROVIDER).
OTP_CHANNEL=dev
TELEGRAM_GATEWAY_TOKEN=
TELEGRAM_GATEWAY_BASE_URL=https://gatewayapi.telegram.org
```

- [ ] **Step 3: Verify it compiles/parses**

Run: `npm run build`
Expected: PASS (no type errors).

- [ ] **Step 4: Commit**

```bash
git add src/config/env.ts .env.example
git commit -m "feat(otp): add OTP_CHANNEL + Telegram Gateway config"
```

---

### Task 2: Define the OtpDeliveryChannel port

**Files:**
- Create: `src/modules/auth/domain/otp/otp-delivery-channel.ts`

- [ ] **Step 1: Write the port** (no test — a bare interface + token):

```ts
/** Injection token for the active OTP delivery channel (bound by OtpDeliveryModule per OTP_CHANNEL). */
export const OTP_DELIVERY_CHANNEL = Symbol('OTP_DELIVERY_CHANNEL');

/**
 * Port for delivering a one-time code. OtpService depends on this interface only; the concrete
 * channel (Dev / Telegram / SMS) is selected by config, so switching is env-only — zero code change.
 */
export interface OtpDeliveryChannel {
  deliver(phoneNumber: string, code: string): Promise<void>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/modules/auth/domain/otp/otp-delivery-channel.ts
git commit -m "feat(otp): add OtpDeliveryChannel port"
```

---

### Task 3: TelegramGatewayChannel (TDD)

**Files:**
- Create: `src/modules/auth/infrastructure/otp/telegram-gateway.channel.ts`
- Test: `src/modules/auth/infrastructure/otp/telegram-gateway.channel.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../config/env';
import { AppException } from '../../../../common/exceptions/app.exception';
import { TelegramGatewayChannel } from './telegram-gateway.channel';

function makeConfig(over: Record<string, unknown> = {}): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    TELEGRAM_GATEWAY_TOKEN: 'tok',
    TELEGRAM_GATEWAY_BASE_URL: 'https://gw.test',
    OTP_TTL_SECONDS: 300,
    ...over,
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService<Env, true>;
}

describe('TelegramGatewayChannel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('POSTs phone_number, code and ttl to the Gateway and resolves on ok:true', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }));

    await new TelegramGatewayChannel(makeConfig()).deliver('+998901234567', '123456');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gw.test/sendVerificationMessage');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      phone_number: '+998901234567',
      code: '123456',
      ttl: 300,
    });
  });

  it('throws AppException when the Gateway returns ok:false', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'x' }), { status: 400 }));

    await expect(
      new TelegramGatewayChannel(makeConfig()).deliver('+998901234567', '123456'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('throws when the token is not configured', async () => {
    await expect(
      new TelegramGatewayChannel(makeConfig({ TELEGRAM_GATEWAY_TOKEN: undefined })).deliver(
        '+998901234567',
        '123456',
      ),
    ).rejects.toBeInstanceOf(AppException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/auth/infrastructure/otp/telegram-gateway.channel.spec.ts`
Expected: FAIL ("Cannot find module './telegram-gateway.channel'").

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/modules/auth/infrastructure/otp/telegram-gateway.channel.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/infrastructure/otp/telegram-gateway.channel.ts src/modules/auth/infrastructure/otp/telegram-gateway.channel.spec.ts
git commit -m "feat(otp): add TelegramGatewayChannel"
```

---

### Task 4: DevDeliveryChannel + SmsDeliveryChannel (move buildOtpMessage)

**Files:**
- Create: `src/modules/auth/infrastructure/otp/dev-delivery.channel.ts`
- Create: `src/modules/auth/infrastructure/otp/sms-delivery.channel.ts`

- [ ] **Step 1: Write DevDeliveryChannel** (logs the code — local only):

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OtpDeliveryChannel } from '../../domain/otp/otp-delivery-channel';

/** Local-only channel: logs the code instead of delivering it. Never selected in production. */
@Injectable()
export class DevDeliveryChannel implements OtpDeliveryChannel {
  private readonly logger = new Logger(DevDeliveryChannel.name);

  deliver(phoneNumber: string, code: string): Promise<void> {
    this.logger.warn(`[DEV OTP] ${phoneNumber} -> ${code}`);
    return Promise.resolve();
  }
}
```

- [ ] **Step 2: Write SmsDeliveryChannel** — this is the NEW home of `buildOtpMessage`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { SMS_PROVIDER, SmsProvider } from '../../domain/sms/sms-provider';
import { OtpDeliveryChannel } from '../../domain/otp/otp-delivery-channel';

/** OTP SMS text — the single source of truth (moved here from OtpService). */
export const buildOtpMessage = (code: string): string =>
  `Hurmatli foydalanuvchi sizning kodingiz - ${code}`;

/** Delivers the code as an SMS via the configured SmsProvider. Active when OTP_CHANNEL=sms. */
@Injectable()
export class SmsDeliveryChannel implements OtpDeliveryChannel {
  constructor(@Inject(SMS_PROVIDER) private readonly sms: SmsProvider) {}

  async deliver(phoneNumber: string, code: string): Promise<void> {
    await this.sms.send(phoneNumber, buildOtpMessage(code));
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/auth/infrastructure/otp/dev-delivery.channel.ts src/modules/auth/infrastructure/otp/sms-delivery.channel.ts
git commit -m "feat(otp): add Dev + Sms delivery channels, relocate buildOtpMessage"
```

---

### Task 5: Channel factory (TDD)

**Files:**
- Create: `src/modules/auth/infrastructure/otp/otp-delivery.factory.ts`
- Test: `src/modules/auth/infrastructure/otp/otp-delivery.factory.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { AppException } from '../../../../common/exceptions/app.exception';
import { OtpDeliveryChannel } from '../../domain/otp/otp-delivery-channel';
import { createOtpDeliveryChannel } from './otp-delivery.factory';

const dev = { name: 'dev' } as unknown as OtpDeliveryChannel;
const tg = { name: 'tg' } as unknown as OtpDeliveryChannel;
const sms = { name: 'sms' } as unknown as OtpDeliveryChannel;

describe('createOtpDeliveryChannel', () => {
  it('selects telegram / sms / dev by OTP_CHANNEL', () => {
    expect(createOtpDeliveryChannel('telegram', 'development', dev, tg, sms)).toBe(tg);
    expect(createOtpDeliveryChannel('sms', 'development', dev, tg, sms)).toBe(sms);
    expect(createOtpDeliveryChannel('dev', 'development', dev, tg, sms)).toBe(dev);
  });

  it('throws when dev is selected in production (fail-fast)', () => {
    expect(() => createOtpDeliveryChannel('dev', 'production', dev, tg, sms)).toThrow(AppException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/auth/infrastructure/otp/otp-delivery.factory.spec.ts`
Expected: FAIL ("Cannot find module './otp-delivery.factory'").

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/modules/auth/infrastructure/otp/otp-delivery.factory.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/infrastructure/otp/otp-delivery.factory.ts src/modules/auth/infrastructure/otp/otp-delivery.factory.spec.ts
git commit -m "feat(otp): add OTP delivery channel factory"
```

---

### Task 6: OtpDeliveryModule (DI wiring)

**Files:**
- Create: `src/modules/auth/otp-delivery.module.ts`

- [ ] **Step 1: Write the module** — imports `SmsProviderModule` for `SMS_PROVIDER`, constructs all three channels, binds `OTP_DELIVERY_CHANNEL` via the factory:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { OTP_DELIVERY_CHANNEL, OtpDeliveryChannel } from './domain/otp/otp-delivery-channel';
import { DevDeliveryChannel } from './infrastructure/otp/dev-delivery.channel';
import { SmsDeliveryChannel } from './infrastructure/otp/sms-delivery.channel';
import { TelegramGatewayChannel } from './infrastructure/otp/telegram-gateway.channel';
import { createOtpDeliveryChannel } from './infrastructure/otp/otp-delivery.factory';
import { SmsProviderModule } from './sms-provider.module';

/**
 * Binds OTP_DELIVERY_CHANNEL to the concrete channel chosen by OTP_CHANNEL (dev | telegram | sms).
 * Imports SmsProviderModule so SmsDeliveryChannel can reuse the existing SMS_PROVIDER.
 */
@Module({
  imports: [SmsProviderModule],
  providers: [
    DevDeliveryChannel,
    TelegramGatewayChannel,
    SmsDeliveryChannel,
    {
      provide: OTP_DELIVERY_CHANNEL,
      inject: [ConfigService, DevDeliveryChannel, TelegramGatewayChannel, SmsDeliveryChannel],
      useFactory: (
        config: ConfigService<Env, true>,
        dev: DevDeliveryChannel,
        telegram: TelegramGatewayChannel,
        sms: SmsDeliveryChannel,
      ): OtpDeliveryChannel =>
        createOtpDeliveryChannel(
          config.get('OTP_CHANNEL', { infer: true }),
          config.get('NODE_ENV', { infer: true }),
          dev,
          telegram,
          sms,
        ),
    },
  ],
  exports: [OTP_DELIVERY_CHANNEL],
})
export class OtpDeliveryModule {}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/modules/auth/otp-delivery.module.ts
git commit -m "feat(otp): wire OtpDeliveryModule"
```

---

### Task 7: Point OtpService at the delivery channel

**Files:**
- Modify: `src/modules/auth/application/otp.service.ts`
- Modify: `src/modules/auth/application/otp.service.spec.ts`

- [ ] **Step 1: Update the OtpService spec** — the `sms` mock becomes a `channel` mock asserting `deliver(phone, code)`. Replace the SMS import/mock and the four assertions:

```ts
// import: replace the SmsProvider import with the channel port
import { OtpDeliveryChannel } from '../domain/otp/otp-delivery-channel';

// helper: replace makeSms() with
const makeChannel = () =>
  ({ deliver: jest.fn().mockResolvedValue(undefined) }) as unknown as
    { deliver: jest.Mock } & OtpDeliveryChannel;

// the request-path assertions become (code is the fixed dev code 111111):
expect(channel.deliver).toHaveBeenCalledWith(PHONE, '111111');
// ...and for the OTP_DEV_CODE=222222 case:
expect(channel.deliver).toHaveBeenCalledWith(PHONE, '222222');
// ...and the production random-code case reads the code from the deliver call:
const code = (channel.deliver as jest.Mock).mock.calls[0][1] as string;
expect(code).toMatch(/^\d{6}$/);
```

(Also update `makeService` to inject the channel mock in place of the SMS mock, and every `sms.send` reference to `channel.deliver` — `not.toHaveBeenCalled` cases included.)

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx jest src/modules/auth/application/otp.service.spec.ts`
Expected: FAIL (OtpService still injects SMS_PROVIDER / has buildOtpMessage).

- [ ] **Step 3: Update OtpService** — swap the dependency and the delivery call, delete `buildOtpMessage`:

```ts
// import: remove SMS_PROVIDER/SmsProvider; add:
import { OTP_DELIVERY_CHANNEL, OtpDeliveryChannel } from '../domain/otp/otp-delivery-channel';

// constructor: replace
//   @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
// with
    @Inject(OTP_DELIVERY_CHANNEL) private readonly channel: OtpDeliveryChannel,

// in request(): replace
//   await this.sms.send(e164, buildOtpMessage(code));
// with
    await this.channel.deliver(e164, code);

// delete the exported buildOtpMessage constant (now lives in SmsDeliveryChannel).
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `npx jest src/modules/auth/application/otp.service.spec.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/application/otp.service.ts src/modules/auth/application/otp.service.spec.ts
git commit -m "refactor(otp): deliver via OtpDeliveryChannel instead of SmsProvider"
```

---

### Task 8: Register the module and run the full suite

**Files:**
- Modify: the module that provides `OtpService` (auth module / OTP submodule) — replace `SmsProviderModule` import with `OtpDeliveryModule` in that module's `imports`. Find it with: `grep -rl "SmsProviderModule" src/modules/auth --include=*.module.ts`.

- [ ] **Step 1: Swap the import** in the module that wires `OtpService` — add `OtpDeliveryModule` to `imports` (and drop `SmsProviderModule` there if `OtpService` was its only consumer; `OtpDeliveryModule` re-imports it for the SMS channel).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS (no unresolved `OTP_DELIVERY_CHANNEL` provider).

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS (all suites green, including auth/otp).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(otp): register OtpDeliveryModule; Telegram Gateway channel wired"
```

---

## Manual verification (after the token exists)

1. Set `.env`: `OTP_CHANNEL=telegram`, `TELEGRAM_GATEWAY_TOKEN=<token>`, keep `NODE_ENV=production` for random codes (or `development` for `111111`).
2. Register a student, then `POST /v1/auth/student/otp/request` with your Telegram-registered number.
3. Confirm the code arrives in Telegram and `checkVerificationStatus`/logs show acceptance.

Real delivery needs the Gateway token + Fragment (TON) balance — code and unit tests do not.
