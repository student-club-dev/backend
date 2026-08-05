import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PRESENCE_REPOSITORY,
  PresenceRepository,
} from '../../../infrastructure/presence/presence.repository';
import { Notification } from '../domain/entities/notification.entity';
import { NotificationTargetType } from '../domain/enums/notification-target-type.enum';
import { NotificationType } from '../domain/enums/notification-type.enum';
import { GROUPING, NotificationEvent } from '../domain/events/notification-event';
import { isQuietHour, nextQuietWindowEnd } from '../domain/events/quiet-hours';
import { MESSAGE_UNREAD_PORT, MessageUnreadPort } from '../domain/message-unread.port';
import { NOTIFICATION_REPOSITORY, NotificationRepository } from '../domain/notification.repository';
import { NotificationsService } from './notifications.service';

/** One flush must not try to send a whole night's backlog in a single tick. */
const PUSH_FLUSH_BATCH = 200;

/**
 * The single way a notification reaches a student (02-PUSH_CATALOG_BACKEND.md).
 *
 * **Every** caller goes through `dispatch`, and that is the whole point. §1.1 makes it a defect for
 * a push to appear on a phone with no matching row in the in-app list, and the only reliable way to
 * guarantee that is to make writing the row and sending the push one operation. When each feature
 * does its own pushing, the two drift within weeks.
 *
 * The delivery policy lives here and nowhere else:
 *
 *  1. the row is written **always** — nothing below can cost a student their history;
 *  2. no push if the event does not want one (§3.4, system announcements);
 *  3. no push if their socket is open — the app is already showing it (§1.2);
 *  4. no push during quiet hours unless the event is urgent, deferred to 08:00 (§5.3);
 *  5. otherwise send, with the badge, grouping keys and `data` envelope of §2 and §4.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository,
    @Inject(PRESENCE_REPOSITORY) private readonly presence: PresenceRepository,
    @Inject(MESSAGE_UNREAD_PORT) private readonly messages: MessageUnreadPort,
    private readonly push: NotificationsService,
  ) {}

  /**
   * Records the event and delivers it if policy allows.
   *
   * Never throws. A notification is a side effect of something the user actually did — sending a
   * message, approving a listing — and a failure to notify must not roll that back. The row is
   * written before the push for the same reason: the durable half should not depend on the half
   * that talks to Apple and Google.
   */
  async dispatch(event: NotificationEvent, now: Date = new Date()): Promise<void> {
    // Decided before the write so the row records the outcome in a single insert.
    const held = event.push && !event.urgent && isQuietHour(now);
    const wantsDelivery = event.push && !(await this.isOnline(event.recipientId));

    let row: Notification;
    try {
      row = await this.notifications.create({
        studentId: event.recipientId,
        type: event.type,
        title: event.title,
        body: event.body,
        target: event.target,
        pushDeferredUntil: wantsDelivery && held ? nextQuietWindowEnd(now) : null,
      });
    } catch (error) {
      this.logger.error({ err: error, type: event.type }, 'could not write notification row');
      return;
    }

    if (!wantsDelivery || held) {
      return;
    }
    try {
      await this.send(event, row.id);
    } catch (error) {
      // Best-effort by contract — the row survives regardless.
      this.logger.warn({ err: error, notificationId: row.id }, 'push delivery failed');
    }
  }

  /**
   * Sends the pushes whose quiet-hours hold has expired (§5.3).
   *
   * Rebuilt from the stored row rather than from a queued copy of the payload: the row is the only
   * thing guaranteed still to be true in the morning, and a second copy would be one more thing
   * that can disagree with the list the user is about to open.
   */
  async flushDeferredPushes(now: Date = new Date()): Promise<number> {
    const due = await this.notifications.findPushDue(now, PUSH_FLUSH_BATCH);
    if (due.length === 0) {
      return 0;
    }
    // Cleared up front, not per success: push is best-effort, and a row left marked after a failed
    // send would be retried on every flush for as long as it existed.
    await this.notifications.clearPushDeferred(due.map((notification) => notification.id));

    let sent = 0;
    for (const notification of due) {
      try {
        if (await this.isOnline(notification.studentId)) {
          continue;
        }
        await this.send(eventFromRow(notification), notification.id);
        sent += 1;
      } catch (error) {
        this.logger.warn(
          { err: error, notificationId: notification.id },
          'deferred push delivery failed',
        );
      }
    }
    return sent;
  }

  /**
   * Presence, with an unknown answer treated as offline.
   *
   * Redis being unreachable must not silence notifications: a duplicate on screen is a moment's
   * annoyance, a missing one is a message the user never learns about.
   */
  private async isOnline(studentId: string): Promise<boolean> {
    try {
      return await this.presence.isOnline(studentId);
    } catch (error) {
      this.logger.warn({ err: error }, 'presence lookup failed — assuming offline');
      return false;
    }
  }

  /** Builds the §2 `data` envelope and hands it to the push provider. */
  private async send(event: NotificationEvent, notificationId: string): Promise<void> {
    const [unreadMessages, unreadNotifications] = await Promise.all([
      this.messages.unreadTotalFor(event.recipientId),
      this.notifications.countUnreadForBadge(event.recipientId),
    ]);

    await this.push.pushToStudent(event.recipientId, {
      title: event.title,
      body: event.body ?? '',
      // §4.2 — iOS shows exactly this number; counting only one half would overwrite the other's.
      // `ForBadge` excludes CHAT rows: those describe messages `unreadTotalFor` already counted,
      // and adding both would show 2 for one message and never come back down.
      badge: unreadMessages + unreadNotifications,
      collapseKey: event.grouping.collapseKey,
      threadId: event.grouping.threadId,
      data: buildDataEnvelope(event, notificationId),
    });
  }
}

/**
 * The `data` envelope (§2). Every value is a string — FCM rejects anything else, and a number
 * stringified in one place but not another is a difference between platforms.
 *
 * Keys with no value are **omitted entirely** rather than sent empty: a client that checks for a
 * key's presence would otherwise render the literal `"null"` as a destination.
 */
export function buildDataEnvelope(
  event: NotificationEvent,
  notificationId: string,
): Record<string, string> {
  return {
    // Caller-supplied keys go first so the envelope below always wins a collision.
    ...(event.extraData ?? {}),
    kind: event.type,
    notificationId,
    ...(event.target === null ? {} : { targetType: event.target.type }),
    ...(event.target?.id == null ? {} : { targetId: event.target.id }),
    // ⚠️ §2 — today's app routes on this and only this. Removing it breaks push taps on every
    // build currently in the store.
    ...(event.conversationId === undefined ? {} : { conversationId: event.conversationId }),
  };
}

/**
 * Reconstructs the deliverable event from a stored row, for the morning flush.
 *
 * Only non-urgent events are ever deferred — chat, calls and connection requests are exempt from
 * quiet hours — so the three families below are exactly the ones that can arrive this way, and no
 * `conversationId` is ever needed.
 */
export function eventFromRow(notification: Notification): NotificationEvent {
  return {
    recipientId: notification.studentId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    target: notification.target,
    grouping: groupingFor(notification),
    urgent: false,
    push: true,
  };
}

function groupingFor(notification: Notification): NotificationEvent['grouping'] {
  if (notification.target?.type === NotificationTargetType.MY_LISTINGS) {
    return GROUPING.myListings();
  }
  if (notification.type === NotificationType.SYSTEM) {
    return GROUPING.system();
  }
  return GROUPING.feed();
}
