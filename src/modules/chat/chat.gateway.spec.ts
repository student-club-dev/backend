import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'socket.io';
import { CallEndedBus } from '../calls/application/call-ended.bus';
import { CallEndReason } from '../calls/domain/enums/call-end-reason.enum';
import { CallMedia } from '../calls/domain/enums/call-media.enum';
import { CallStatus } from '../calls/domain/enums/call-status.enum';
import { MediaReadyBus } from '../media/application/media-ready.bus';
import { NotificationDispatcher } from '../notifications/application/notification-dispatcher.service';
import { CHAT_EVENT } from './application/chat-events';
import { ChatService } from './application/chat.service';
import { ChatGateway } from './chat.gateway';
import { CallSnapshot, Message } from './domain/entities/message.entity';
import { MessageType } from './domain/enums/message-type.enum';

const SENDER = 'std_sender';
const OTHER = 'std_other';

const message: Message = {
  id: 'msg_1',
  conversationId: 'cnv_1',
  senderId: SENDER,
  seq: 7,
  type: MessageType.TEXT,
  body: 'salom',
  clientMsgId: 'cmid-1',
  deletedAt: null,
  albumId: null,
  attachment: null,
  sticker: null,
  replyTo: null,
  call: null,
  createdAt: new Date('2026-07-28T09:14:22.531Z'),
};

interface ChatMocks {
  otherMemberId: jest.Mock;
  isOnline: jest.Mock;
  sendMessage?: jest.Mock;
  markRead?: jest.Mock;
  markDelivered?: jest.Mock;
  unreadTotalFor?: jest.Mock;
  pushSenderOf?: jest.Mock;
}

function makeGateway(chat: ChatMocks): {
  gateway: ChatGateway;
  emit: jest.Mock;
  to: jest.Mock;
  dispatch: jest.Mock;
} {
  const dispatch = jest.fn();
  const gateway = new ChatGateway(
    // The badge count and the sender's identity are asked for on every offline push; tests that
    // care override them.
    {
      unreadTotalFor: jest.fn().mockResolvedValue(0),
      pushSenderOf: jest.fn().mockResolvedValue(null),
      ...chat,
    } as unknown as ChatService,
    { dispatch } as unknown as NotificationDispatcher,
    {} as JwtService,
    { get: () => 'v1' } as unknown as ConfigService<never, true>,
    new MediaReadyBus(),
    new CallEndedBus(),
  );
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  (gateway as unknown as { server: Server }).server = { to } as unknown as Server;
  return { gateway, emit, to, dispatch };
}

describe('ChatGateway — message:new fan-out (§17.1)', () => {
  it('echoes clientMsgId to the sender and hides it from the recipient', async () => {
    const chat: ChatMocks = {
      otherMemberId: jest.fn().mockResolvedValue(OTHER),
      isOnline: jest.fn().mockResolvedValue(true),
    };
    const { gateway, emit, to } = makeGateway(chat);

    await gateway.broadcastMessage(message);

    expect(to).toHaveBeenCalledWith(`user:${SENDER}`);
    expect(to).toHaveBeenCalledWith(`user:${OTHER}`);

    const payloads = emit.mock.calls
      .filter(([event]) => event === CHAT_EVENT.MESSAGE_NEW)
      .map(([, payload]) => payload as { message: { clientMsgId: string | null } });

    expect(payloads).toHaveLength(2);
    expect(payloads[0].message.clientMsgId).toBe('cmid-1');
    expect(payloads[1].message.clientMsgId).toBeNull();
  });

  it('still emits to the sender when the conversation has no other member', async () => {
    const chat: ChatMocks = {
      otherMemberId: jest.fn().mockResolvedValue(null),
      isOnline: jest.fn().mockResolvedValue(true),
    };
    const { gateway, emit } = makeGateway(chat);

    await gateway.broadcastMessage(message);

    const payloads = emit.mock.calls.filter(([event]) => event === CHAT_EVENT.MESSAGE_NEW);
    expect(payloads).toHaveLength(1);
  });
});

/**
 * ⚠️ Every CALL message pushed "Javobsiz qo‘ng‘iroq". The push fires whenever the recipient's chat
 * socket is closed — routine while they are on the `/calls` socket or backgrounded — so an answered
 * ten-minute call, a decline and a cancel all told the callee they had missed a call.
 */
describe('ChatGateway — the offline push for a CALL message', () => {
  const callMessage = (call: Partial<CallSnapshot>): Message => ({
    ...message,
    type: MessageType.CALL,
    body: null,
    call: {
      callId: 'call_1',
      media: CallMedia.AUDIO,
      status: CallStatus.ENDED,
      durationMs: 184_000,
      endReason: CallEndReason.HANGUP,
      ...call,
    },
  });

  async function pushBodyFor(call: Partial<CallSnapshot>): Promise<string> {
    const { gateway, dispatch } = makeGateway({
      otherMemberId: jest.fn().mockResolvedValue(OTHER),
      isOnline: jest.fn().mockResolvedValue(false), // the callee is on /calls, not /chat
    });
    await gateway.broadcastMessage(callMessage(call));
    return (dispatch.mock.calls[0][0] as { body: string }).body;
  }

  it('tells the callee an answered call is over, with its duration', async () => {
    expect(await pushBodyFor({ status: CallStatus.ENDED })).toBe('📞 Qo‘ng‘iroq · 3:04');
  });

  it('says "missed" only for a call that really was missed', async () => {
    expect(
      await pushBodyFor({
        status: CallStatus.MISSED,
        durationMs: 0,
        endReason: CallEndReason.TIMEOUT,
      }),
    ).toBe('📞 Javobsiz qo‘ng‘iroq');
  });

  it.each([
    ['declined', CallStatus.DECLINED, CallEndReason.DECLINED],
    ['canceled', CallStatus.CANCELED, CallEndReason.CANCELED],
  ])('does not call a %s call missed', async (_name, status, endReason) => {
    expect(await pushBodyFor({ status, durationMs: 0, endReason })).toBe('📞 Qo‘ng‘iroq');
  });
});

/**
 * The badge itself moved to `NotificationDispatcher` (push catalogue §4.2): it is now unread
 * messages **plus** unread notifications, and a caller that knew only the first half would
 * overwrite the combined figure on every send. `notification-dispatcher.service.spec.ts` covers
 * the arithmetic; what remains the gateway's business is *whether* it notifies at all.
 */
describe('ChatGateway — when an offline notification is raised', () => {
  it('raises one for a recipient whose socket is closed', async () => {
    const { gateway, dispatch } = makeGateway({
      otherMemberId: jest.fn().mockResolvedValue(OTHER),
      isOnline: jest.fn().mockResolvedValue(false),
    });

    await gateway.broadcastMessage(message);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0][0] as { recipientId: string }).recipientId).toBe(OTHER);
  });

  it('raises none at all when the recipient is online — they are already looking at it', async () => {
    const { gateway, dispatch } = makeGateway({
      otherMemberId: jest.fn().mockResolvedValue(OTHER),
      isOnline: jest.fn().mockResolvedValue(true),
    });

    await gateway.broadcastMessage(message);

    expect(dispatch).not.toHaveBeenCalled();
  });
});

/**
 * Every push said "Yangi xabar", so a recipient with unread messages from several people could not
 * tell from the notification list who to answer. The title has to carry the name and the server is
 * the only place that can put it there: when a `notification` block is present Android draws the
 * notification itself without ever running app code, and iOS cannot rewrite `aps.alert.title`
 * either. Requested by the mobile team in `PUSH_SENDER_NAME_BACKEND.md`.
 */
describe('ChatGateway — who the offline push says it is from', () => {
  // What the gateway now produces: a catalogue event. `conversationId` is a first-class field
  // on it (the dispatcher copies it into `data`), the rest travel as `extraData`.
  type DispatchedEvent = {
    title: string;
    conversationId?: string;
    extraData: Record<string, string>;
  };

  async function pushFor(
    sender: { name: string | null; avatarUrl: string | null } | null,
    override: Partial<Message> = {},
  ): Promise<DispatchedEvent> {
    const { gateway, dispatch } = makeGateway({
      otherMemberId: jest.fn().mockResolvedValue(OTHER),
      isOnline: jest.fn().mockResolvedValue(false),
      pushSenderOf: jest.fn().mockResolvedValue(sender),
    });
    await gateway.broadcastMessage({ ...message, ...override });
    return dispatch.mock.calls[0][0] as DispatchedEvent;
  }

  it('titles the push with the sender’s name and repeats it in data', async () => {
    const payload = await pushFor({ name: 'Aziz Karimov', avatarUrl: 'https://cdn/a.jpg' });

    expect(payload.title).toBe('Aziz Karimov');
    expect(payload.extraData.senderName).toBe('Aziz Karimov');
    expect(payload.extraData.senderId).toBe(SENDER);
    expect(payload.extraData.senderAvatarUrl).toBe('https://cdn/a.jpg');
  });

  it('keeps the deep-link data the client already routes on', async () => {
    const payload = await pushFor({ name: 'Aziz Karimov', avatarUrl: null });

    expect(payload.conversationId).toBe('cnv_1');
    expect(payload.extraData.messageType).toBe(MessageType.TEXT);
  });

  // FCM rejects a non-string `data` value, and a literal "null" would be rendered as a broken image
  // by a client that trusts the field's presence — absent is the only correct way to say "none".
  it('omits senderAvatarUrl entirely when the sender has no avatar', async () => {
    const payload = await pushFor({ name: 'Aziz Karimov', avatarUrl: null });

    expect(payload.extraData).not.toHaveProperty('senderAvatarUrl');
  });

  // A deleted account, or one that never filled in a name or username. The notification must still
  // arrive — an empty title is worse than a generic one.
  it('falls back to “Yangi xabar” when the sender has no name', async () => {
    expect((await pushFor({ name: null, avatarUrl: null })).title).toBe('Yangi xabar');
    expect((await pushFor(null)).title).toBe('Yangi xabar');
  });

  it('omits senderName when there is none, but still sends senderId', async () => {
    const payload = await pushFor(null);

    expect(payload.extraData).not.toHaveProperty('senderName');
    expect(payload.extraData.senderId).toBe(SENDER);
  });

  /**
   * `firstName`/`lastName` are `@IsString()` with no length limit, so the name is attacker-chosen
   * and unbounded — the only such string in the payload, since `pushTextFor` already cuts the body
   * to 120. Left whole it would carry a multi-kilobyte name into a 4 KB payload; FCM answers
   * INVALID_ARGUMENT, `FcmPushProvider` files that under "dead token", and `pushToStudent` deletes
   * the row. The recipient would then lose push from everyone, silently, because someone they are
   * connected to renamed themselves.
   */
  it('caps the name a sender can put on someone else’s lock screen', async () => {
    const payload = await pushFor({ name: 'A'.repeat(5000), avatarUrl: null });

    expect(payload.title).toBe('A'.repeat(64));
    expect(payload.extraData.senderName).toBe('A'.repeat(64));
  });

  // A name is stored exactly as it was typed — `firstName` has no trim on the way in — so a title
  // taken from it straight would render as an empty notification, which §6.3 rules out.
  it('treats a whitespace-only name as no name at all', async () => {
    const payload = await pushFor({ name: '   ', avatarUrl: null });

    expect(payload.title).toBe('Yangi xabar');
    expect(payload.extraData).not.toHaveProperty('senderName');
  });

  // SYSTEM rows are written by the server, not by a person (`sendMessage` rejects the type from a
  // client), so attributing one to whoever happens to be in `senderId` would be a lie. `data` has
  // to agree with the title: the mobile contract says `senderName` and `title` are the same string.
  it('gives a SYSTEM message the product name and no sender identity at all', async () => {
    const pushSenderOf = jest.fn().mockResolvedValue({ name: 'Aziz Karimov', avatarUrl: 'x' });
    const { gateway, dispatch } = makeGateway({
      otherMemberId: jest.fn().mockResolvedValue(OTHER),
      isOnline: jest.fn().mockResolvedValue(false),
      pushSenderOf,
    });

    await gateway.broadcastMessage({ ...message, type: MessageType.SYSTEM });
    const payload = dispatch.mock.calls[0][0] as DispatchedEvent;

    expect(payload.title).toBe('StudentClub');
    expect(payload.extraData).not.toHaveProperty('senderName');
    expect(payload.extraData).not.toHaveProperty('senderAvatarUrl');
    // Nothing to look up — the row has no person behind it.
    expect(pushSenderOf).not.toHaveBeenCalled();
  });

  // A missed call now names the caller — the same push path, so it comes for free.
  it('names the caller on a CALL message', async () => {
    const payload = await pushFor(
      { name: 'Aziz Karimov', avatarUrl: null },
      {
        type: MessageType.CALL,
        body: null,
        call: {
          callId: 'call_1',
          media: CallMedia.AUDIO,
          status: CallStatus.MISSED,
          durationMs: 0,
          endReason: CallEndReason.TIMEOUT,
        },
      },
    );

    expect(payload.title).toBe('Aziz Karimov');
  });
});

/**
 * §17.3 — the handshake token is verified once, at connect, so a long-lived socket outlives its
 * access token. §17.8 — the cursor events used to be fire-and-forget, leaving the client unable to
 * tell a lost read cursor from a stored one.
 */
describe('ChatGateway — token freshness (§17.3) and cursor acks (§17.8)', () => {
  const user = { id: SENDER, type: 'STUDENT' };

  const socketWith = (expSeconds: number): { data: Record<string, unknown> } => ({
    data: { user, tokenExp: expSeconds },
  });

  const fresh = (): { data: Record<string, unknown> } =>
    socketWith(Math.floor(Date.now() / 1000) + 600);
  const expired = (): { data: Record<string, unknown> } =>
    socketWith(Math.floor(Date.now() / 1000) - 1);

  function chatMocks(): ChatMocks {
    return {
      otherMemberId: jest.fn().mockResolvedValue(OTHER),
      isOnline: jest.fn().mockResolvedValue(true),
      sendMessage: jest.fn().mockResolvedValue(message),
      markRead: jest.fn().mockResolvedValue(undefined),
      markDelivered: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('rejects a send once the handshake token has expired', async () => {
    const chat = chatMocks();
    const { gateway } = makeGateway(chat);

    const ack = await gateway.onSend(expired() as never, {
      conversationId: 'cnv_1',
      clientMsgId: 'cmid-1',
      body: 'salom',
    });

    expect(ack).toEqual({
      clientMsgId: 'cmid-1',
      status: 'error',
      error: { code: 'TOKEN_EXPIRED', message: 'Sessiya muddati tugadi' },
    });
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it('lets a send through while the token is still valid', async () => {
    const chat = chatMocks();
    const { gateway } = makeGateway(chat);

    const ack = await gateway.onSend(fresh() as never, {
      conversationId: 'cnv_1',
      clientMsgId: 'cmid-1',
      body: 'salom',
    });

    expect(ack).toMatchObject({ clientMsgId: 'cmid-1', id: 'msg_1', seq: 7, status: 'sent' });
  });

  it('acks message:read with the cursor it stored', async () => {
    const chat = chatMocks();
    const { gateway } = makeGateway(chat);

    const ack = await gateway.onRead(fresh() as never, { conversationId: 'cnv_1', seq: 42 });

    expect(ack).toEqual({ conversationId: 'cnv_1', seq: 42, status: 'ok' });
    expect(chat.markRead).toHaveBeenCalledWith(user, 'cnv_1', 42);
  });

  it('acks message:delivered with the cursor it stored', async () => {
    const chat = chatMocks();
    const { gateway } = makeGateway(chat);

    const ack = await gateway.onDelivered(fresh() as never, { conversationId: 'cnv_1', seq: 42 });

    expect(ack).toEqual({ conversationId: 'cnv_1', seq: 42, status: 'ok' });
    expect(chat.markDelivered).toHaveBeenCalledWith(user, 'cnv_1', 42);
  });

  it('rejects a read cursor from an expired token without moving it', async () => {
    const chat = chatMocks();
    const { gateway } = makeGateway(chat);

    const ack = await gateway.onRead(expired() as never, { conversationId: 'cnv_1', seq: 42 });

    expect(ack).toEqual({
      status: 'error',
      error: { code: 'TOKEN_EXPIRED', message: 'Sessiya muddati tugadi' },
    });
    expect(chat.markRead).not.toHaveBeenCalled();
  });
});
