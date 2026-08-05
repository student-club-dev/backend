import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  NotificationList,
  NotificationRepository,
} from '../domain/notification.repository';

/**
 * The in-app notifications list (spec §2–§3).
 *
 * Reads and marks only. Writing rows belongs to whatever raises the event, not here — the list and
 * the push it accompanies must come from one place (§1.3), and that place is the emitter, not the
 * screen that displays the result.
 *
 * Kept apart from `NotificationsService` (device tokens and push delivery) on purpose: that one
 * talks to APNs and FCM, this one only ever talks to our own database.
 */
@Injectable()
export class NotificationListService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository,
  ) {}

  list(studentId: string, limit: number): Promise<NotificationList> {
    return this.notifications.list(studentId, limit);
  }

  /**
   * Marks rows read. `all` and `ids` are mutually exclusive and the DTO has already rejected any
   * other combination, so this only has to pick the branch.
   *
   * Nothing is returned and nothing throws for an id we do not have: the client writes the mark
   * locally first and only then tells us (§3.1), so a failure here would have to be reconciled
   * against a screen that has already moved on. The next `GET` is the source of truth instead.
   */
  async markRead(studentId: string, ids: string[] | undefined, all: boolean): Promise<void> {
    if (all) {
      await this.notifications.markAllRead(studentId);
      return;
    }
    await this.notifications.markRead(studentId, ids ?? []);
  }

  /** Deletes everything older than `retentionDays`. Returns how many rows went. */
  purgeOlderThan(retentionDays: number, now: Date = new Date()): Promise<number> {
    const before = new Date(now.getTime() - retentionDays * MS_PER_DAY);
    return this.notifications.deleteOlderThan(before);
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
