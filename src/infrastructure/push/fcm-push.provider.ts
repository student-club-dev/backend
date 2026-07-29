import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT } from 'google-auth-library';
import type { Env } from '../../config/env';
import { PushNotification, PushProvider } from './push-provider';

/** FCM answers a rejected token with one of these; both mean "stop sending here". */
const DEAD_TOKEN_ERRORS = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH']);

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
 * Firebase Cloud Messaging (HTTP v1) push provider.
 *
 * FCM delivers to Android **and** iOS — Firebase forwards to APNs itself once the APNs key is
 * uploaded to the Firebase project. That is one integration instead of two, and it is why there is
 * no separate APNs adapter here.
 *
 * The exception is VoIP: an incoming-call push must reach a locked iPhone through PushKit, which
 * FCM cannot send. That needs a direct APNs client with `apns-push-type: voip`, and it lands with
 * the calls feature rather than here.
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
  async send(tokens: string[], notification: PushNotification): Promise<string[]> {
    if (tokens.length === 0) {
      return [];
    }
    let accessToken: string;
    try {
      accessToken = await this.authorize();
    } catch (error) {
      // No credentials, or Google refused them. Never throws to the caller — a push that cannot be
      // sent must not fail the message that triggered it.
      this.logger.error(`FCM authorisation failed: ${(error as Error).message}`);
      return [];
    }

    const results = await Promise.all(
      tokens.map((token) => this.sendOne(accessToken, token, notification)),
    );
    return results.filter((token): token is string => token !== null);
  }

  /** Returns the token when the provider says it is permanently dead, `null` otherwise. */
  private async sendOne(
    accessToken: string,
    token: string,
    notification: PushNotification,
  ): Promise<string | null> {
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
          body: JSON.stringify({ message: buildMessage(token, notification) }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      // A network blip is transient — keep the token, it is probably still good.
      this.logger.warn(`FCM request failed: ${(error as Error).message}`);
      return null;
    }

    if (response.ok) {
      return null;
    }

    const body = (await response.json().catch(() => ({}))) as FcmErrorResponse;
    const code =
      body.error?.details?.find((detail) => detail.errorCode !== undefined)?.errorCode ??
      body.error?.status;

    if (code !== undefined && DEAD_TOKEN_ERRORS.has(code)) {
      // The app was uninstalled or the token was reissued. Report it so the caller can delete it.
      return token;
    }
    // Never log the token itself — it addresses a specific person's device.
    this.logger.warn(`FCM rejected a send: ${response.status} ${code ?? 'unknown'}`);
    return null;
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
 * Android gets `priority: high` so the app is woken rather than batched into a maintenance window;
 * iOS gets `sound: default` so a chat message actually makes a noise.
 */
function buildMessage(token: string, notification: PushNotification): Record<string, unknown> {
  return {
    token,
    notification: { title: notification.title, body: notification.body },
    data: notification.data ?? {},
    android: { priority: 'high', notification: { sound: 'default' } },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default' } },
    },
  };
}
