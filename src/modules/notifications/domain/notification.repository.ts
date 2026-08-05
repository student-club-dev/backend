import { Notification, NotificationTarget } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';

/** Injection token for the notification repository port. */
export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

/** Everything a new notification row needs. `createdAt` and `readAt` are the database's business. */
export interface NewNotification {
  studentId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  target: NotificationTarget | null;
  /** When a quiet-hours-deferred push is owed (§5.3); null when none is. */
  pushDeferredUntil?: Date | null;
}

/** A student's list plus the count the bell icon shows. */
export interface NotificationList {
  items: Notification[];
  unreadCount: number;
}

/**
 * Notification storage.
 *
 * Every method is scoped to one student — there is no "find by id" that crosses accounts, so an id
 * guessed from someone else's push cannot be read or marked here. That is enforced by the query
 * shape rather than by a check a caller could skip.
 */
export interface NotificationRepository {
  /** Writes one row. */
  create(notification: NewNotification): Promise<Notification>;

  /**
   * The newest `limit` rows for a student, plus the unread count.
   *
   * The count is over the student's **whole** history, not the returned page (§2.2): it drives the
   * dot on the home screen, which must not change just because the list was truncated.
   */
  list(studentId: string, limit: number): Promise<NotificationList>;

  /**
   * Stamps `readAt` on the student's rows among `ids`. Already-read rows keep their original
   * timestamp, and ids belonging to nobody or to someone else are simply not matched — the caller
   * sends a batch and one stale id must not cost the rest their mark (§3.3).
   */
  markRead(studentId: string, ids: string[]): Promise<void>;

  /** Stamps `readAt` on every unread row the student has. */
  markAllRead(studentId: string): Promise<void>;

  /** Unread rows for a student — what the bell icon shows. Every type counts. */
  countUnread(studentId: string): Promise<number>;

  /**
   * Unread rows that are **not** about a chat message — the notifications half of the app-icon
   * badge (§4.2).
   *
   * §4.2's formula, `unread messages + unread notifications`, assumes the two sets are disjoint.
   * They are not: a chat push writes a `CHAT` row for a message the unread-message counter is
   * already counting, so adding them naively shows 2 for one message. Worse, the row is only
   * cleared by `POST /v1/notifications/read`, which a client with the notifications screen still
   * switched off never calls — so the badge would climb and never come back down.
   *
   * Excluding `CHAT` is what makes the addition mean what it says. Missed calls are `CHAT` too, and
   * they are also already counted as unread messages, so they fall out correctly for the same
   * reason.
   */
  countUnreadForBadge(studentId: string): Promise<number>;

  /**
   * Rows whose held-back push is now due (§5.3), oldest first. Capped so one flush cannot try to
   * send a night's backlog in a single tick.
   */
  findPushDue(now: Date, limit: number): Promise<Notification[]>;

  /**
   * Clears the deferral marker, whether or not the push itself succeeded.
   *
   * Deliberately not conditional on delivery: push is best-effort, and a row that stayed marked
   * after a failed send would be retried at every flush for as long as it existed.
   */
  clearPushDeferred(ids: string[]): Promise<void>;

  /** Deletes rows created before `before`, for the retention sweep. Returns how many went. */
  deleteOlderThan(before: Date): Promise<number>;
}
