/** Injection token for the push provider (dev logger, or the real FCM/APNs pair when configured). */
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

/**
 * The platforms a push can be routed to. Declared here rather than imported from the notifications
 * module: this is shared infrastructure and must not depend on a feature module. The values are the
 * same strings as `DevicePlatform`, so a device row is structurally assignable to a `PushTarget`.
 */
export type PushPlatform = 'IOS' | 'ANDROID' | 'WEB';

/** Which APNs host a device belongs to. Mirrors the Prisma `ApnsEnvironment` enum. */
export type ApnsEnvironment = 'PRODUCTION' | 'SANDBOX';

/**
 * One device to deliver to.
 *
 * `id` exists so logs can name a device without printing `token` — a push token addresses a
 * specific person's phone and never belongs in a log line.
 *
 * `apnsEnv` is null until a successful send establishes it (iOS only). Unknown means "try the
 * configured host, and the other one once if Apple says the token is not from this environment".
 */
export interface PushTarget {
  id: string;
  token: string;
  platform: PushPlatform;
  apnsEnv: ApnsEnvironment | null;
}

/**
 * A push notification payload.
 *
 * `data` carries silent key/values the app routes on (a deep link into a conversation). `badge` is
 * the recipient's total unread count — iOS does not compute the number on the app icon itself, so
 * whatever the server sends is what the user sees. Android ignores it.
 *
 * `collapseKey` and `threadId` are the two halves of "one event, one row in the tray" (push
 * catalogue §4.1), and they are deliberately *not* the same mechanism:
 *
 *  - `collapseKey` → Android `collapse_key`. FCM keeps only the newest message per key, so five
 *    messages from one conversation leave one tray row rather than five.
 *  - `threadId` → iOS `aps.thread-id`. Apple *groups* rather than replaces: the five stay, stacked
 *    under one heading. That is why there is no `apns-collapse-id` — replacing a chat notification
 *    would hide messages the user has not seen, which is not what grouping is for.
 *
 * Both are optional. A payload with neither behaves exactly as it did before they existed.
 */
export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  collapseKey?: string;
  threadId?: string;
}

/**
 * What a send round established about the devices it touched.
 *
 * `dead` — tokens the provider rejected as permanently invalid (uninstalled app, reissued token).
 * The caller deletes them; without that they accumulate forever and every later send pays for them
 * again. A transient failure (network, provider 5xx) must NEVER land here: one blip would otherwise
 * cost a live user their notifications, silently.
 *
 * `delivered` — tokens the provider accepted, each with the APNs environment that accepted it
 * (null for FCM). The caller stamps `lastSuccessAt` and learns the environment from it.
 */
export interface PushOutcome {
  dead: string[];
  delivered: { token: string; apnsEnv: ApnsEnvironment | null }[];
}

/** An outcome that touched nothing — the answer to an empty target list. */
export function emptyPushOutcome(): PushOutcome {
  return { dead: [], delivered: [] };
}

/**
 * Provider-agnostic push port (chat.md C8). Implementations deliver to device tokens.
 *
 * Best-effort — `send` must never throw: a dead token or a provider outage is not the sender's
 * fault, and a failed notification must not fail the message that triggered it.
 */
export interface PushProvider {
  send(targets: PushTarget[], notification: PushNotification): Promise<PushOutcome>;
}
