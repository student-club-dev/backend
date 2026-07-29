/** Injection token for the push provider (dev logger, or FCM when credentials are configured). */
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

/** A push notification payload. `data` carries silent key/values the app routes on (e.g. a deep link). */
export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Provider-agnostic push port (chat.md C8). Implementations deliver to device tokens.
 *
 * Best-effort — `send` must never throw: a dead token or a provider outage is not the sender's
 * fault, and a failed notification must not fail the message that triggered it.
 *
 * It returns the tokens the provider rejected as permanently invalid (uninstalled app, token
 * reissued). The caller deletes them; without that they accumulate forever and every later send
 * pays for them again.
 */
export interface PushProvider {
  send(tokens: string[], notification: PushNotification): Promise<string[]>;
}
