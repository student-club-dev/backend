/** Injection token for the push provider (bound to the dev impl now; FCM/APNs plug in later). */
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

/** A push notification payload. `data` carries silent key/values the app routes on (e.g. a deep link). */
export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Provider-agnostic push port (chat.md C8). Implementations deliver to device tokens. Best-effort —
 * `send` must never throw to the caller (a dead token or a provider outage is not the sender's fault).
 */
export interface PushProvider {
  send(tokens: string[], notification: PushNotification): Promise<void>;
}
