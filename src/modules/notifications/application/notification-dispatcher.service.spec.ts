import type { PresenceRepository } from '../../../infrastructure/presence/presence.repository';
import { NotificationTargetType } from '../domain/enums/notification-target-type.enum';
import { NotificationType } from '../domain/enums/notification-type.enum';
import { NotificationCatalog } from '../domain/events/notification-catalog';
import { GROUPING, NotificationEvent } from '../domain/events/notification-event';
import type { MessageUnreadPort } from '../domain/message-unread.port';
import type { NotificationRepository } from '../domain/notification.repository';
import { NotificationDispatcher, buildDataEnvelope } from './notification-dispatcher.service';
import type { NotificationsService } from './notifications.service';

/** 03:00 and 12:00 Tashkent, as UTC instants (UTC+5). */
const AT_NIGHT = new Date(Date.UTC(2026, 7, 5, 22, 0));
const AT_NOON = new Date(Date.UTC(2026, 7, 5, 7, 0));

function anEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    recipientId: 'std_1',
    type: NotificationType.LISTING,
    title: 'E‘lon muddati tugayapti',
    body: '3 kundan keyin yopiladi',
    target: { type: NotificationTargetType.MY_LISTINGS, id: null },
    grouping: GROUPING.myListings(),
    urgent: false,
    push: true,
    ...overrides,
  };
}

describe('NotificationDispatcher', () => {
  let notifications: jest.Mocked<NotificationRepository>;
  let presence: jest.Mocked<PresenceRepository>;
  let messages: jest.Mocked<MessageUnreadPort>;
  let push: { pushToStudent: jest.Mock };
  let dispatcher: NotificationDispatcher;

  beforeEach(() => {
    notifications = {
      create: jest.fn(async (n) => ({
        id: 'ntf_1',
        studentId: n.studentId,
        type: n.type,
        title: n.title,
        body: n.body,
        target: n.target,
        readAt: null,
        createdAt: new Date(),
      })),
      list: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
      countUnread: jest.fn().mockResolvedValue(2),
      findPushDue: jest.fn().mockResolvedValue([]),
      clearPushDeferred: jest.fn().mockResolvedValue(undefined),
      deleteOlderThan: jest.fn(),
    } as unknown as jest.Mocked<NotificationRepository>;

    presence = {
      online: jest.fn(),
      offline: jest.fn(),
      isOnline: jest.fn().mockResolvedValue(false),
      onlineAmong: jest.fn(),
    } as unknown as jest.Mocked<PresenceRepository>;

    messages = { unreadTotalFor: jest.fn().mockResolvedValue(5) };
    push = { pushToStudent: jest.fn().mockResolvedValue(undefined) };

    dispatcher = new NotificationDispatcher(
      notifications,
      presence,
      messages,
      push as unknown as NotificationsService,
    );
  });

  describe('the delivery policy', () => {
    it('writes the row and sends the push for an offline recipient', async () => {
      await dispatcher.dispatch(anEvent(), AT_NOON);

      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(push.pushToStudent).toHaveBeenCalledTimes(1);
    });

    /** §1.1 — a push the phone shows must always be findable in the list. */
    it('writes the row even when nothing is pushed', async () => {
      await dispatcher.dispatch(anEvent({ push: false }), AT_NOON);

      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(push.pushToStudent).not.toHaveBeenCalled();
    });

    /** §1.2 — the rule covers the whole catalogue, not just chat. */
    it('sends no push when the recipient has an open socket', async () => {
      presence.isOnline.mockResolvedValue(true);

      await dispatcher.dispatch(anEvent(), AT_NOON);

      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(push.pushToStudent).not.toHaveBeenCalled();
    });

    it('treats an unreachable presence store as offline rather than staying silent', async () => {
      presence.isOnline.mockRejectedValue(new Error('redis down'));

      await dispatcher.dispatch(anEvent(), AT_NOON);

      expect(push.pushToStudent).toHaveBeenCalledTimes(1);
    });
  });

  describe('quiet hours (§5.3)', () => {
    it('holds a non-urgent push and records when it is owed', async () => {
      await dispatcher.dispatch(anEvent(), AT_NIGHT);

      expect(push.pushToStudent).not.toHaveBeenCalled();
      const written = notifications.create.mock.calls[0][0];
      expect(written.pushDeferredUntil).toBeInstanceOf(Date);
    });

    it('writes the row immediately all the same — only the push waits', async () => {
      await dispatcher.dispatch(anEvent(), AT_NIGHT);

      expect(notifications.create).toHaveBeenCalledTimes(1);
    });

    it('sends an urgent event at 03:00 anyway — a message delayed nine hours is not a message', async () => {
      await dispatcher.dispatch(anEvent({ urgent: true }), AT_NIGHT);

      expect(push.pushToStudent).toHaveBeenCalledTimes(1);
      expect(notifications.create.mock.calls[0][0].pushDeferredUntil).toBeNull();
    });

    it('marks nothing deferred for a recipient who is online at night', async () => {
      presence.isOnline.mockResolvedValue(true);

      await dispatcher.dispatch(anEvent(), AT_NIGHT);

      // Otherwise the flush would push it at 08:00 for something they saw in the app at midnight.
      expect(notifications.create.mock.calls[0][0].pushDeferredUntil).toBeNull();
    });
  });

  describe('the push payload', () => {
    it('adds both halves of the badge (§4.2)', async () => {
      await dispatcher.dispatch(anEvent(), AT_NOON);

      expect(push.pushToStudent.mock.calls[0][1].badge).toBe(7); // 5 messages + 2 notifications
    });

    it('carries the §4.1 grouping keys', async () => {
      await dispatcher.dispatch(
        anEvent({ grouping: GROUPING.chat('cnv_9'), urgent: true }),
        AT_NOON,
      );

      const payload = push.pushToStudent.mock.calls[0][1];
      expect(payload.collapseKey).toBe('chat:cnv_9');
      expect(payload.threadId).toBe('cnv_9');
    });
  });

  describe('flushDeferredPushes', () => {
    const held = {
      id: 'ntf_held',
      studentId: 'std_1',
      type: NotificationType.LISTING,
      title: 'E‘lon muddati tugayapti',
      body: null,
      target: { type: NotificationTargetType.MY_LISTINGS, id: null },
      readAt: null,
      createdAt: new Date(),
    };

    it('sends what is due and clears the marker', async () => {
      notifications.findPushDue.mockResolvedValue([held]);

      await expect(dispatcher.flushDeferredPushes(AT_NOON)).resolves.toBe(1);

      expect(notifications.clearPushDeferred).toHaveBeenCalledWith(['ntf_held']);
      expect(push.pushToStudent).toHaveBeenCalledTimes(1);
    });

    /**
     * The marker is cleared before the send, not after a success. A row left marked after a failed
     * delivery would be retried on every flush for as long as it existed.
     */
    it('clears the marker even when the send fails', async () => {
      notifications.findPushDue.mockResolvedValue([held]);
      push.pushToStudent.mockRejectedValue(new Error('APNs down'));

      await expect(dispatcher.flushDeferredPushes(AT_NOON)).resolves.toBe(0);

      expect(notifications.clearPushDeferred).toHaveBeenCalledWith(['ntf_held']);
    });

    it('skips someone who has come back online overnight', async () => {
      notifications.findPushDue.mockResolvedValue([held]);
      presence.isOnline.mockResolvedValue(true);

      await expect(dispatcher.flushDeferredPushes(AT_NOON)).resolves.toBe(0);
      expect(push.pushToStudent).not.toHaveBeenCalled();
    });
  });
});

describe('buildDataEnvelope (§2)', () => {
  it('carries kind, notificationId and the target pair', () => {
    const data = buildDataEnvelope(
      anEvent({ target: { type: NotificationTargetType.LISTING, id: 'lst_1' } }),
      'ntf_1',
    );

    expect(data).toMatchObject({
      kind: 'LISTING',
      notificationId: 'ntf_1',
      targetType: 'LISTING',
      targetId: 'lst_1',
    });
  });

  it('omits targetId rather than sending null for a screen-only destination', () => {
    const data = buildDataEnvelope(anEvent(), 'ntf_1');

    expect(data.targetType).toBe('MY_LISTINGS');
    expect(data).not.toHaveProperty('targetId');
  });

  it('omits targetType entirely for a row that opens nothing', () => {
    const data = buildDataEnvelope(anEvent({ target: null }), 'ntf_1');

    expect(data).not.toHaveProperty('targetType');
    expect(data).not.toHaveProperty('targetId');
  });

  /** ⚠️ Today's app routes on this and nothing else — dropping it breaks every shipped build. */
  it('keeps conversationId on a chat event', () => {
    const event = NotificationCatalog.newMessage({
      recipientId: 'std_1',
      conversationId: 'cnv_1',
      senderName: 'Aziz',
      text: 'salom',
    });

    expect(buildDataEnvelope(event, 'ntf_1').conversationId).toBe('cnv_1');
  });

  it('lets caller keys through but never lets them overwrite the envelope', () => {
    const event = anEvent({
      extraData: { senderName: 'Aziz', kind: 'SPOOFED', notificationId: 'SPOOFED' },
    });

    const data = buildDataEnvelope(event, 'ntf_1');

    expect(data.senderName).toBe('Aziz');
    expect(data.kind).toBe('LISTING');
    expect(data.notificationId).toBe('ntf_1');
  });

  it('is entirely strings — FCM rejects any other type', () => {
    const data = buildDataEnvelope(
      anEvent({ target: { type: NotificationTargetType.LISTING, id: 'lst_1' } }),
      'ntf_1',
    );

    for (const value of Object.values(data)) {
      expect(typeof value).toBe('string');
    }
  });
});
