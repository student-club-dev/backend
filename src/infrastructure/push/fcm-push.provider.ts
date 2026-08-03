import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT } from 'google-auth-library';
import type { Env } from '../../config/env';
import {
  PushNotification,
  PushOutcome,
  PushProvider,
  PushTarget,
  emptyPushOutcome,
} from './push-provider';

/**
 * FCM's ordinary way of saying "this device is gone": the app was uninstalled, or the token was
 * reissued. Routine and expected — no alarm.
 */
const DEAD_TOKEN_ERRORS = new Set(['UNREGISTERED', 'INVALID_ARGUMENT']);

/**
 * Not a dead device at all: the token belongs to a **different Firebase project** than the one we
 * send from. The token can never be delivered to by us, so the row still goes — but this is a
 * configuration mismatch between the app's `google-services.json` and our service account, and it
 * used to be handled exactly like an uninstall: silently, with no log line anywhere.
 *
 * That is the worst possible shape for this failure. `POST /v1/devices` answers 200, the send
 * reports success, the row quietly disappears, and every Android user is left without push while
 * nothing anywhere looks wrong. It is reported at ERROR level for that reason.
 */
const SENDER_ID_MISMATCH = 'SENDER_ID_MISMATCH';

interface FcmErrorResponse {
  error?: {
    status?: string;
    message?: string;
    details?: { '@type'?: string; errorCode?: string }[];
  };
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Firebase Cloud Messaging (HTTP v1) push provider — **Android and web only**.
 *
 * iOS is delivered by `ApnsPushProvider` instead: the iOS app has no Firebase SDK and registers its
 * raw APNs token, which FCM cannot address. `PlatformRoutingPushProvider` decides which of the two
 * a device goes to; nothing about the Android path changed.
 *
 * Credentials come from a Firebase **service account**. `google-auth-library` (already a dependency,
 * for verifying Google sign-in) mints and refreshes the OAuth token; nothing here caches secrets.
 */
@Injectable()
export class FcmPushProvider implements PushProvider {
  private readonly logger = new Logger(FcmPushProvider.name);
  private readonly projectId: string;
  private readonly client: JWT;

  constructor(config: ConfigService<Env, true>) {
    this.projectId = config.get('FCM_PROJECT_ID', { infer: true }) ?? '';
    this.client = new JWT({
      email: config.get('FCM_CLIENT_EMAIL', { infer: true }),
      // Service-account keys are stored with literal `\n`; the PEM parser needs real newlines.
      key: (config.get('FCM_PRIVATE_KEY', { infer: true }) ?? '').replace(/\\n/g, '\n'),
      scopes: [SCOPE],
    });
  }

  /**
   * Sends to every token in parallel. FCM v1 has no multicast endpoint — one request per token is
   * the API, and a student has a handful of devices, so the fan-out is small and bounded.
   */
  async send(targets: PushTarget[], notification: PushNotification): Promise<PushOutcome> {
    if (targets.length === 0) {
      return emptyPushOutcome();
    }
    let accessToken: string;
    try {
      accessToken = await this.authorize();
    } catch (error) {
      // No credentials, or Google refused them. Never throws to the caller — a push that cannot be
      // sent must not fail the message that triggered it.
      this.logger.error(`FCM authorisation failed: ${(error as Error).message}`);
      return emptyPushOutcome();
    }

    const outcome = emptyPushOutcome();
    const results = await Promise.all(
      targets.map((target) => this.sendOne(accessToken, target, notification)),
    );
    for (const [index, verdict] of results.entries()) {
      const token = targets[index].token;
      if (verdict === 'DEAD') {
        outcome.dead.push(token);
      } else if (verdict === 'DELIVERED') {
        // FCM has no environments, so there is nothing to learn beyond "this token still works".
        outcome.delivered.push({ token, apnsEnv: null });
      }
    }
    return outcome;
  }

  /** What FCM's answer means for this token: it arrived, the token is gone, or neither is known. */
  private async sendOne(
    accessToken: string,
    target: PushTarget,
    notification: PushNotification,
  ): Promise<'DELIVERED' | 'DEAD' | 'KEPT'> {
    const startedAt = Date.now();
    let response: globalThis.Response;
    try {
      response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: buildMessage(target.token, notification) }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      // A network blip is transient — keep the token, it is probably still good.
      this.log(target, 0, (error as Error).message, Date.now() - startedAt);
      return 'KEPT';
    }

    const body = response.ok ? {} : ((await response.json().catch(() => ({}))) as FcmErrorResponse);
    const code =
      body.error?.details?.find((detail) => detail.errorCode !== undefined)?.errorCode ??
      body.error?.status;
    this.log(target, response.status, code ?? null, Date.now() - startedAt);

    if (response.ok) {
      return 'DELIVERED';
    }

    if (code === SENDER_ID_MISMATCH) {
      this.logger.error(
        `FCM: this device's token belongs to a different Firebase project than ${this.projectId}. ` +
          "The Android app's google-services.json must come from that same project — until it " +
          'does, NO Android device will receive a notification and the registration will keep ' +
          'looking successful. The device row was removed.',
      );
      return 'DEAD';
    }
    if (code !== undefined && DEAD_TOKEN_ERRORS.has(code)) {
      // The app was uninstalled or the token was reissued. Routine — the trace line above is enough.
      return 'DEAD';
    }
    return 'KEPT';
  }

  /**
   * Per-send trace, matching the APNs provider's line so both platforms can be read the same way.
   * The token itself is never logged — it addresses a specific person's device; `id` names the row.
   */
  private log(target: PushTarget, status: number, code: string | null, durationMs: number): void {
    const line = `fcm deviceId=${target.id} platform=${target.platform} status=${status} code=${code ?? '-'} durationMs=${durationMs}`;
    if (status === 200) {
      this.logger.log(line);
    } else {
      this.logger.warn(line);
    }
  }

  private async authorize(): Promise<string> {
    const { token } = await this.client.getAccessToken();
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('no access token returned');
    }
    return token;
  }
}

/**
 * Builds the v1 message.
 *
 * `data` values must be strings — FCM rejects anything else, and a number silently stringified
 * elsewhere would be a difference between platforms.
 *
 * Android gets `priority: high` so the app is woken rather than batched into a maintenance window.
 * There is no `apns` block: iPhones no longer travel this path at all, and leaving one here would
 * suggest they still do. `badge` is dropped for the same reason — it is an iOS concept.
 */
function buildMessage(token: string, notification: PushNotification): Record<string, unknown> {
  return {
    token,
    notification: { title: notification.title, body: notification.body },
    data: notification.data ?? {},
    android: { priority: 'high', notification: { sound: 'default' } },
  };
}
