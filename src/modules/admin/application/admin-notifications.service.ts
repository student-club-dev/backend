import { Injectable } from '@nestjs/common';
import { NotificationDispatcher } from '../../notifications/application/notification-dispatcher.service';
import { NotificationCatalog } from '../../notifications/domain/events/notification-catalog';

/** Which of the two system rows to write (push catalogue §3.4). */
export const SYSTEM_NOTIFICATION_KINDS = ['ANNOUNCEMENT', 'PROFILE'] as const;
export type SystemNotificationKind = (typeof SYSTEM_NOTIFICATION_KINDS)[number];

/** One request must not become a platform-wide broadcast by accident. */
export const MAX_NOTIFICATION_RECIPIENTS = 500;

/** What an admin asked to send. */
export interface SendSystemNotification {
  studentIds: string[];
  title: string;
  body: string | null;
  kind: SystemNotificationKind;
  sendPush: boolean;
}

/**
 * Admin-raised system notifications (push catalogue §3.4 №11/№12).
 *
 * Goes through the dispatcher like every other event, which is what makes the two rules in §3.4
 * hold without anyone having to remember them: an announcement is list-only unless `sendPush` was
 * ticked, and either way quiet hours apply, because neither is live conversation between people.
 */
@Injectable()
export class AdminNotificationsService {
  constructor(private readonly dispatcher: NotificationDispatcher) {}

  /**
   * Sends to each recipient in turn. Returns how many were attempted.
   *
   * Sequential rather than a `Promise.all`: a broadcast to five hundred students would otherwise
   * open five hundred concurrent push conversations, and nothing about an announcement is urgent
   * enough to be worth that.
   */
  async send(input: SendSystemNotification): Promise<number> {
    for (const studentId of input.studentIds) {
      const event =
        input.kind === 'PROFILE'
          ? NotificationCatalog.profile({
              recipientId: studentId,
              title: input.title,
              body: input.body,
            })
          : NotificationCatalog.system({
              recipientId: studentId,
              title: input.title,
              body: input.body,
              sendPush: input.sendPush,
            });
      await this.dispatcher.dispatch(event);
    }
    return input.studentIds.length;
  }
}
