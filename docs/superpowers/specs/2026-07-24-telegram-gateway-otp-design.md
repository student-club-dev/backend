# Telegram Gateway OTP delivery — Design

**Date:** 2026-07-24
**Status:** Approved (brainstorming)
**Author:** ElonUz backend

## Context & goal

OTP codes are currently generated in `OtpService`, stored hashed in Redis, and delivered
through the `SmsProvider` port (`dev` logs, `eskiz` sends SMS). Eskiz custom-text SMS is
**blocked**: Eskiz only serves legal entities (YaTT/MChJ) — as an individual account it
allows only 3 fixed test texts, so our OTP text is rejected (verified: HTTP 400). Telegram
Gateway (`gatewayapi.telegram.org`) sends verification codes **by phone number**, requires
**no legal entity** (Telegram account + Fragment/TON funding), costs ~$0.01/code, and
refunds undelivered codes.

**Goal:** deliver OTP codes via Telegram Gateway as the active channel, without changing the
existing OTP logic (generation, Redis storage/verify, limits). SMS (Eskiz) stays in the code
as a future channel, selectable later once a contract exists.

## Decision: verification model A — Telegram is a pure delivery channel

We keep generating the 6-digit code and verifying it in `OtpService` via Redis (TTL,
attempts, cooldown, password-reset reuse, dev-mode `111111` all unchanged). Telegram Gateway
only **delivers** the code (we pass our own `code` to `sendVerificationMessage`). We do NOT
use Telegram's built-in `checkVerificationStatus`. Rationale: minimal change, consistent
behaviour across channels, no coupling to Telegram's verification, future SMS fallback works
with the identical code.

## Architecture

Introduce a delivery abstraction, because Telegram takes a **code**, not arbitrary text:

```
OtpDeliveryChannel { deliver(phoneNumber: string, code: string): Promise<void> }
```

Implementations (each knows how to deliver a code its own way):

- **DevDeliveryChannel** — logs the code (local only; never in production).
- **SmsDeliveryChannel** — builds `buildOtpMessage(code)` and sends via the existing
  `EskizSmsProvider`. `buildOtpMessage` moves here (it is SMS-specific). Not active now.
- **TelegramGatewayChannel** — calls Gateway `POST /sendVerificationMessage`
  (`phone_number` E.164, `code`, `ttl`); on a non-OK response throws an `AppException`.

A factory selects the channel from `OTP_CHANNEL` (`dev | telegram | sms`), mirroring the
existing SMS factory: `dev` + `NODE_ENV=production` fails fast at boot.

`OtpService` changes one call: `this.channel.deliver(e164, code)` (was
`this.sms.send(e164, buildOtpMessage(code))`). All other OTP logic is untouched.

## Configuration (`.env`)

- `OTP_CHANNEL=dev | telegram | sms` — default `dev`; `dev` + production → fail-fast.
- `TELEGRAM_GATEWAY_TOKEN=<secret>` — Gateway access token (env only, never committed).
- `TELEGRAM_GATEWAY_BASE_URL=https://gatewayapi.telegram.org` — default.

## Error handling & coverage (Telegram-only phase)

- Telegram can only deliver to numbers registered on Telegram. If delivery fails (no Telegram
  account, or an API error), `deliver` throws → the OTP request returns **502** with an Uzbek
  message ("Kod yuborib bo'lmadi, keyinroq urinib ko'ring"). The code is already in Redis, but
  in the Telegram-only phase the user cannot proceed by another route — this is the accepted
  behaviour for now.
- Undelivered codes are refunded automatically by Telegram (Gateway side) — no logic needed.
- `checkSendAbility` (pre-check whether a number can receive) is **not used** now; we handle
  the send result. It becomes useful when SMS fallback is added.

## Dev mode (unchanged)

`NODE_ENV != production` → code is the fixed `111111` (or `OTP_DEV_CODE`); the dev channel
logs it. Real Telegram send happens only when `OTP_CHANNEL=telegram` (like `eskiz` today).

## Out of scope (later)

- **SMS fallback / channel choice by user** — after an Eskiz (YaTT) contract exists, offer the
  user Telegram or SMS. The `SmsDeliveryChannel` is built now so this is a config/UX change,
  not new plumbing.
- `checkSendAbility` pre-flight.

## Testing

- Unit: `TelegramGatewayChannel` with a mocked `fetch` — success (2xx), API error (non-2xx →
  `AppException`), correct request shape (`phone_number` E.164, `code`, `ttl`).
- Unit: channel factory selection (`dev`/`telegram`/`sms`) and `dev`+production fail-fast.
- `OtpService` existing tests stay green (they assert `channel.deliver(phone, code)` now).
- Real end-to-end delivery test requires the Gateway token + Fragment balance.

## Prerequisite (external, not code)

Telegram Gateway **access token** + **Fragment (TON) funding**. Code and unit tests can be
completed without them; real delivery verification waits on the token — mirrors how Eskiz
credentials gated real SMS.

## Files touched (indicative)

- New: `domain/otp/otp-delivery-channel.ts` (port), `infrastructure/otp/dev-delivery.channel.ts`,
  `infrastructure/otp/sms-delivery.channel.ts`, `infrastructure/otp/telegram-gateway.channel.ts`,
  `infrastructure/otp/otp-delivery.factory.ts`.
- Changed: `application/otp.service.ts` (call `deliver`), module wiring (bind the channel token),
  `config/env.ts` (+`OTP_CHANNEL`, `TELEGRAM_GATEWAY_*`), `.env.example`.
- `buildOtpMessage` relocates from `otp.service.ts` into `SmsDeliveryChannel`.
