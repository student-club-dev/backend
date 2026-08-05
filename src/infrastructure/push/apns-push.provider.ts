import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { APNS_TRANSPORT, ApnsTransport } from './apns-transport';
import {
  ApnsEnvironment,
  PushNotification,
  PushOutcome,
  PushProvider,
  PushTarget,
  emptyPushOutcome,
} from './push-provider';

/** How Apple's answer should be acted on. Everything not listed keeps the token. */
export type ApnsVerdict =
  | 'DELIVERED'
  /** The token is valid but belongs to the other host — worth one retry there. */
  | 'WRONG_ENV'
  /** The app is gone from this device. Delete the row. */
  | 'DEAD'
  /** Our configuration is wrong, not the device. Loud log, token untouched. */
  | 'CONFIG_ERROR'
  /** The provider JWT aged out. Re-sign and repeat. */
  | 'EXPIRED_TOKEN'
  /** Apple is throttling or having a bad day. Back off and repeat. */
  | 'RETRY'
  /** Anything unrecognised: keep the token, a device must not be lost to an unknown answer. */
  | 'KEPT';

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 200;
const EXPIRATION_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * An APNs device token is 32 bytes hex-encoded. Registration enforces this, but rows predating that
 * check can hold anything — and the token is interpolated into the request path, so it is validated
 * again here rather than trusted from the database.
 */
const APNS_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Direct APNs push provider — Apple's own service over HTTP/2, no Firebase in between.
 *
 * The iOS app has no Firebase SDK and sends its raw APNs device token to `POST /v1/devices`. FCM
 * cannot address such a token: it accepted the send and dropped the notification, which is why push
 * worked on Android and never arrived on iPhone. This talks to Apple directly instead.
 *
 * It also buys a diagnosis FCM could not give: Apple names the failure (`410 Unregistered`,
 * `400 BadDeviceToken`, `400 BadTopic`), so a dead token and a misconfiguration stop looking alike.
 *
 * Delivery rules per `PUSH_APNS_BACKEND.md` §5. The one that matters: `410` and a token rejected by
 * BOTH hosts are the ONLY reasons to delete a device. Anything else — a timeout, a 500, a throttle
 * — keeps it, because a user silently losing every future notification to one bad minute is a far
 * more expensive failure than one push that never arrives.
 */
@Injectable()
export class ApnsPushProvider implements PushProvider {
  private readonly logger = new Logger(ApnsPushProvider.name);
  private readonly topic: string;
  private readonly defaultEnv: ApnsEnvironment;
  private readonly configured: boolean;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(APNS_TRANSPORT) private readonly transport: ApnsTransport,
  ) {
    this.topic = config.get('APNS_TOPIC', { infer: true }) ?? '';
    this.defaultEnv =
      config.get('APNS_ENV', { infer: true }) === 'sandbox' ? 'SANDBOX' : 'PRODUCTION';
    this.configured = isApnsConfigured(config);
  }

  /** Targets are iOS-only — `PlatformRoutingPushProvider` splits them by platform before we see them. */
  async send(targets: PushTarget[], notification: PushNotification): Promise<PushOutcome> {
    if (targets.length === 0) {
      return emptyPushOutcome();
    }
    if (!this.configured) {
      this.logger.error(
        `APNs is not configured — ${targets.length} iOS notification(s) dropped. ` +
          'Set APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID and APNS_TOPIC.',
      );
      return emptyPushOutcome();
    }

    const outcome = emptyPushOutcome();

    // A row registered before the format check — an FCM token stored under `platform=IOS`, say —
    // can never be delivered to by anyone, so it is reported dead without troubling Apple. Unlike
    // an outage this is a certainty, which is what makes deleting it safe.
    const deliverable = targets.filter((target) => {
      if (APNS_TOKEN_PATTERN.test(target.token)) {
        return true;
      }
      this.logger.warn(`apns deviceId=${target.id} dropped: token is not an APNs token`);
      outcome.dead.push(target.token);
      return false;
    });

    const results = await Promise.all(
      deliverable.map((target) => this.sendToDevice(target, notification)),
    );
    for (const [index, result] of results.entries()) {
      const token = deliverable[index].token;
      if (result.verdict === 'DEAD') {
        outcome.dead.push(token);
      } else if (result.verdict === 'DELIVERED') {
        outcome.delivered.push({ token, apnsEnv: result.apnsEnv });
      }
    }
    return outcome;
  }

  /**
   * One device, with the environment probe: a token whose host we do not know yet (or guessed
   * wrong) answers `400 BadDeviceToken` on the wrong host and succeeds on the other. Only when
   * BOTH reject it that way is it really gone.
   */
  private async sendToDevice(
    target: PushTarget,
    notification: PushNotification,
  ): Promise<{ verdict: 'DELIVERED'; apnsEnv: ApnsEnvironment } | { verdict: 'DEAD' | 'KEPT' }> {
    const primary = target.apnsEnv ?? this.defaultEnv;
    const first = await this.attempt(target, notification, primary);
    if (first !== 'WRONG_ENV') {
      return first === 'DELIVERED'
        ? { verdict: 'DELIVERED', apnsEnv: primary }
        : { verdict: first };
    }

    const fallback: ApnsEnvironment = primary === 'PRODUCTION' ? 'SANDBOX' : 'PRODUCTION';
    const second = await this.attempt(target, notification, fallback);
    if (second === 'DELIVERED') {
      return { verdict: 'DELIVERED', apnsEnv: fallback };
    }
    // Rejected by both hosts as an unknown token — that is the second of the two `BadDeviceToken`s
    // the spec requires before deleting. A 5xx here proves nothing, so the row survives.
    return { verdict: second === 'WRONG_ENV' || second === 'DEAD' ? 'DEAD' : 'KEPT' };
  }

  /** One host, with the transient retries. Returns the verdict the caller has to act on. */
  private async attempt(
    target: PushTarget,
    notification: PushNotification,
    env: ApnsEnvironment,
  ): Promise<'DELIVERED' | 'WRONG_ENV' | 'DEAD' | 'KEPT'> {
    const request = {
      deviceToken: target.token,
      env,
      headers: buildApnsHeaders(this.topic, Date.now()),
      body: JSON.stringify(buildApnsPayload(notification)),
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now();
      let verdict: ApnsVerdict;
      try {
        const response = await this.transport.post(request);
        verdict = classifyApnsResponse(response.status, response.reason);
        this.log(target, env, response.status, response.reason, Date.now() - startedAt);
      } catch (error) {
        // Transport failure — no answer from Apple, so nothing is known about the token.
        verdict = 'RETRY';
        this.log(target, env, 0, (error as Error).message, Date.now() - startedAt);
      }

      switch (verdict) {
        case 'DELIVERED':
        case 'WRONG_ENV':
        case 'DEAD':
        case 'KEPT':
          return verdict;
        case 'CONFIG_ERROR':
          this.logger.error(
            `APNs rejected our configuration (${env}) — check APNS_TOPIC / APNS_KEY_ID / ` +
              'APNS_TEAM_ID. No iOS push will be delivered until this is fixed.',
          );
          return 'KEPT';
        case 'EXPIRED_TOKEN':
          this.transport.expireToken();
          break;
        case 'RETRY':
          await delay(BACKOFF_BASE_MS * 2 ** (attempt - 1));
          break;
      }
    }
    return 'KEPT';
  }

  /** Per-send trace (§6). The device token itself is never logged — `id` identifies the row. */
  private log(
    target: PushTarget,
    env: ApnsEnvironment,
    status: number,
    reason: string | null,
    durationMs: number,
  ): void {
    const line = `apns deviceId=${target.id} env=${env} status=${status} reason=${reason ?? '-'} durationMs=${durationMs}`;
    if (status === 200) {
      this.logger.log(line);
    } else {
      this.logger.warn(line);
    }
  }
}

/**
 * Whether all four APNs settings are present. Used by the provider to fail loudly instead of
 * silently, and by the module factory to say so once at boot rather than per notification.
 */
export function isApnsConfigured(config: ConfigService<Env, true>): boolean {
  const filled = (value: string | undefined): boolean => value !== undefined && value.length > 0;
  return (
    filled(config.get('APNS_KEY_P8', { infer: true })) &&
    filled(config.get('APNS_KEY_ID', { infer: true })) &&
    filled(config.get('APNS_TEAM_ID', { infer: true })) &&
    filled(config.get('APNS_TOPIC', { infer: true }))
  );
}

/**
 * Maps Apple's `status` + `reason` onto what we do about the token (§5).
 *
 * Pure and exported so every branch is testable without a socket to Apple — the branches decide
 * whether a real user keeps receiving notifications, and they are unreachable in an end-to-end test.
 */
export function classifyApnsResponse(status: number, reason: string | null): ApnsVerdict {
  if (status === 200) {
    return 'DELIVERED';
  }
  if (status === 410) {
    // Unregistered — the app was deleted from the device.
    return 'DEAD';
  }
  if (status === 400) {
    return reason === 'BadDeviceToken' ? 'WRONG_ENV' : 'CONFIG_ERROR';
  }
  if (status === 403) {
    return reason === 'ExpiredProviderToken' ? 'EXPIRED_TOKEN' : 'CONFIG_ERROR';
  }
  if (status === 429 || status >= 500) {
    return 'RETRY';
  }
  return 'KEPT';
}

/**
 * The request headers. `apns-collapse-id` is deliberately absent: it would replace a conversation's
 * previous notification with the newest one, and a chat is expected to show every message the way
 * Telegram does (§3.2).
 */
export function buildApnsHeaders(topic: string, now: number): Record<string, string> {
  return {
    'apns-topic': topic,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-expiration': String(Math.floor(now / 1000) + EXPIRATION_WINDOW_SECONDS),
  };
}

/**
 * The APNs body (§3).
 *
 * APNs has no `data` section: custom fields sit at the ROOT next to `aps`, which is where the app
 * reads them from (`userInfo["conversationId"]`). `thread-id` groups a notification into a stack;
 * without it every one piles up separately.
 *
 * The caller supplies `threadId` (push catalogue §4.1 gives a key per event family, not just per
 * conversation). `data.conversationId` remains the fallback so a caller that predates the field —
 * and any future one that only knows about conversations — still gets a chat grouped correctly.
 */
export function buildApnsPayload(notification: PushNotification): Record<string, unknown> {
  const data = notification.data ?? {};
  const aps: Record<string, unknown> = {
    alert: { title: notification.title, body: notification.body },
    sound: 'default',
    'mutable-content': 1,
  };
  if (notification.badge !== undefined) {
    aps.badge = notification.badge;
  }
  const threadId = notification.threadId ?? data.conversationId;
  if (threadId !== undefined) {
    aps['thread-id'] = threadId;
  }
  // `aps` last: a custom field can never overwrite the section Apple itself reads.
  return { ...data, aps };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
