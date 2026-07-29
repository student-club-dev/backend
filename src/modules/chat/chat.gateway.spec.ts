import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'socket.io';
import { NotificationsService } from '../notifications/application/notifications.service';
import { CHAT_EVENT } from './application/chat-events';
import { ChatService } from './application/chat.service';
import { ChatGateway } from './chat.gateway';
import { Message } from './domain/entities/message.entity';
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
  createdAt: new Date('2026-07-28T09:14:22.531Z'),
};

interface ChatMocks {
  otherMemberId: jest.Mock;
  isOnline: jest.Mock;
  sendMessage?: jest.Mock;
  markRead?: jest.Mock;
  markDelivered?: jest.Mock;
}

function makeGateway(chat: ChatMocks): { gateway: ChatGateway; emit: jest.Mock; to: jest.Mock } {
  const gateway = new ChatGateway(
    chat as unknown as ChatService,
    { pushToStudent: jest.fn() } as unknown as NotificationsService,
    {} as JwtService,
    {} as ConfigService<never, true>,
  );
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  (gateway as unknown as { server: Server }).server = { to } as unknown as Server;
  return { gateway, emit, to };
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
