import { NotificationTarget } from '../entities/notification.entity';
import { NotificationType } from '../enums/notification-type.enum';

/**
 * The two grouping keys for one tray row (push catalogue §4.1). They are different mechanisms and
 * both are needed: Android's `collapse_key` **replaces**, iOS's `thread-id` **stacks**.
 */
export interface NotificationGrouping {
  collapseKey: string;
  threadId: string;
}

/**
 * One notification, fully resolved — the only thing `NotificationDispatcher` accepts.
 *
 * Everything variable has already been decided by the time an event reaches the dispatcher: the
 * text, the destination, the grouping, whether it may wake someone at midnight. The dispatcher owns
 * delivery policy and nothing else, which is what stops per-event rules from being reinvented at
 * every call site — the failure mode the catalogue exists to prevent (§1.1: a push the phone showed
 * but the list cannot account for).
 *
 * Build these with the factories in `notification-catalog.ts`, never by hand.
 */
export interface NotificationEvent {
  /** The student who receives it. */
  recipientId: string;

  /** Row type — icon and colour, and the `data.kind` the push carries (§2). */
  type: NotificationType;

  title: string;
  body: string | null;

  /** Where a tap goes, or null for an informational row. */
  target: NotificationTarget | null;

  grouping: NotificationGrouping;

  /**
   * ⚠️ Chat and calls only (§2). Today's app reads **only** this field when a push is tapped
   * (Android `MainActivity` → `PushRoute`, iOS `IosPushBridge`); it does not read
   * `targetType`/`targetId` yet. Dropping it would break push routing on every deployed build.
   */
  conversationId?: string;

  /**
   * Extra `data` keys this event's clients already read — chat's `senderName`, `senderAvatarUrl`,
   * `messageType`, `albumId`. Merged **under** the envelope in §2, so nothing here can overwrite
   * `kind`, `notificationId` or the target pair.
   *
   * Values are strings only, and a key with nothing to say must be left out rather than sent empty:
   * FCM rejects a non-string value, and a client that tests for a key's presence would render the
   * literal `"null"` as a name.
   */
  extraData?: Record<string, string>;

  /**
   * Exempt from quiet hours (§5.3) — live conversation between people, where delay destroys the
   * point. Chat, calls and connection requests only; a listing reminder can wait for morning.
   */
  urgent: boolean;

  /**
   * Whether a push accompanies the row at all. False for system announcements unless an admin
   * explicitly asks (§3.4): a marketing push is how a user comes to switch notifications off
   * entirely, taking their chat notifications with them.
   */
  push: boolean;
}

/**
 * The §4.1 grouping table, in one place.
 *
 * Five consecutive messages from one conversation must leave one row in the tray, not five — and
 * the reason each family shares a key is that the user only ever needs the newest one to know they
 * should open the app.
 */
export const GROUPING = {
  chat: (conversationId: string): NotificationGrouping => ({
    collapseKey: `chat:${conversationId}`,
    threadId: conversationId,
  }),
  call: (conversationId: string): NotificationGrouping => ({
    collapseKey: 'call',
    threadId: `call:${conversationId}`,
  }),
  connection: (): NotificationGrouping => ({
    collapseKey: 'connection',
    threadId: 'connection',
  }),
  /** The owner's own listings — moderation results and expiry warnings. */
  myListings: (): NotificationGrouping => ({
    collapseKey: 'my-listings',
    threadId: 'my-listings',
  }),
  /** Recommendations: matching jobs, expiring discounts. */
  feed: (): NotificationGrouping => ({ collapseKey: 'feed', threadId: 'feed' }),
  system: (): NotificationGrouping => ({ collapseKey: 'system', threadId: 'system' }),
} as const;
