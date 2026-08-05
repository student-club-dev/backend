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

  /** Deletes rows created before `before`, for the retention sweep. Returns how many went. */
  deleteOlderThan(before: Date): Promise<number>;
}
