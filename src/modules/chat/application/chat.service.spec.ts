import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ChatRepository } from '../domain/chat.repository';
import { ConnectionCheckRepository } from '../domain/connection-check.repository';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { ConversationListItem } from '../domain/entities/conversation-view.entity';
import { Message } from '../domain/entities/message.entity';
import { ConversationType } from '../domain/enums/conversation-type.enum';
import { MessageType } from '../domain/enums/message-type.enum';
import { PresenceRepository } from '../domain/presence.repository';
import { ChatService } from './chat.service';

const me: AuthenticatedUser = { id: 'me', type: AccountType.STUDENT };

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    type: ConversationType.DIRECT,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    lastMessageAt: null,
    ...overrides,
  };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversationId: 'conv-1',
    senderId: 'me',
    seq: 1,
    type: MessageType.TEXT,
    body: 'salom',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function member(overrides: Partial<ConversationMember> = {}): ConversationMember {
  return {
    conversationId: 'conv-1',
    studentId: 'me',
    lastReadSeq: 0,
    lastDeliveredSeq: 0,
    ...overrides,
  };
}

function summary(id: string, online = false): ConversationListItem['other'] {
  return { id, username: id, fullName: id, avatarUrl: null, online, lastSeenAt: null };
}

function makeChat(overrides: Partial<ChatRepository> = {}): ChatRepository {
  return {
    findDirect: jest.fn().mockResolvedValue(null),
    createDirect: jest.fn(async (_dk: string, _a: string, _b: string) =>
      conversation({ id: 'new' }),
    ),
    findById: jest.fn().mockResolvedValue(null),
    findMembership: jest.fn().mockResolvedValue(member()),
    otherMemberId: jest.fn().mockResolvedValue('other'),
    appendMessage: jest.fn(async (conversationId: string, senderId: string, body: string) =>
      message({ conversationId, senderId, body }),
    ),
    listMessages: jest.fn().mockResolvedValue([]),
    listConversations: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    advanceCursor: jest.fn().mockResolvedValue(undefined),
    touchLastSeen: jest.fn().mockResolvedValue(new Date('2026-07-27T00:00:00Z')),
    partnerIds: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeConnectionCheck(connected = true): ConnectionCheckRepository {
  return { areConnected: jest.fn().mockResolvedValue(connected) };
}

function makePresence(overrides: Partial<PresenceRepository> = {}): PresenceRepository {
  return {
    online: jest.fn().mockResolvedValue(undefined),
    offline: jest.fn().mockResolvedValue(true),
    isOnline: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
}

function makeService(
  chat: ChatRepository = makeChat(),
  connectionCheck: ConnectionCheckRepository = makeConnectionCheck(),
  presence: PresenceRepository = makePresence(),
): ChatService {
  return new ChatService(chat, connectionCheck, presence);
}

describe('ChatService', () => {
  describe('openDirect', () => {
    it('throws 422 for a self conversation', async () => {
      await expect(makeService().openDirect(me, 'me')).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
      });
    });

    it('throws 403 NOT_CONNECTED when the pair is not connected', async () => {
      const service = makeService(makeChat(), makeConnectionCheck(false));
      await expect(service.openDirect(me, 'other')).rejects.toMatchObject({
        code: ERROR_CODE.NOT_CONNECTED,
        status: 403,
      });
    });

    it('returns the existing direct conversation without creating', async () => {
      const chat = makeChat({
        findDirect: jest.fn().mockResolvedValue(conversation({ id: 'existing' })),
      });
      const result = await makeService(chat).openDirect(me, 'other');
      expect(result.id).toBe('existing');
      expect(chat.createDirect).not.toHaveBeenCalled();
    });

    it('creates a direct conversation with the sorted directKey when none exists', async () => {
      const chat = makeChat();
      await makeService(chat).openDirect(me, 'other');
      expect(chat.createDirect).toHaveBeenCalledWith('me:other', 'me', 'other');
    });
  });

  describe('sendMessage', () => {
    it('throws 422 MESSAGE_EMPTY for a blank body', async () => {
      await expect(makeService().sendMessage(me, 'conv-1', '   ')).rejects.toMatchObject({
        code: ERROR_CODE.MESSAGE_EMPTY,
        status: 422,
      });
    });

    it('throws 404 CONVERSATION_NOT_FOUND when the caller is not a member', async () => {
      const chat = makeChat({ findMembership: jest.fn().mockResolvedValue(null) });
      await expect(makeService(chat).sendMessage(me, 'conv-1', 'hi')).rejects.toMatchObject({
        code: ERROR_CODE.CONVERSATION_NOT_FOUND,
        status: 404,
      });
    });

    it('throws 403 NOT_CONNECTED when the pair is no longer connected', async () => {
      const service = makeService(makeChat(), makeConnectionCheck(false));
      await expect(service.sendMessage(me, 'conv-1', 'hi')).rejects.toMatchObject({
        code: ERROR_CODE.NOT_CONNECTED,
        status: 403,
      });
    });

    it('appends the trimmed message for a connected member', async () => {
      const chat = makeChat();
      const result = await makeService(chat).sendMessage(me, 'conv-1', '  salom  ');
      expect(chat.appendMessage).toHaveBeenCalledWith('conv-1', 'me', 'salom');
      expect(result.body).toBe('salom');
    });
  });

  describe('history / markRead', () => {
    it('history: 404 for a non-member', async () => {
      const chat = makeChat({ findMembership: jest.fn().mockResolvedValue(null) });
      await expect(makeService(chat).history(me, 'conv-1', null, 20)).rejects.toMatchObject({
        code: ERROR_CODE.CONVERSATION_NOT_FOUND,
      });
    });

    it('history: returns the repository page for a member', async () => {
      const chat = makeChat({ listMessages: jest.fn().mockResolvedValue([message()]) });
      const result = await makeService(chat).history(me, 'conv-1', 5, 20);
      expect(chat.listMessages).toHaveBeenCalledWith('conv-1', 5, 20);
      expect(result).toHaveLength(1);
    });

    it('markRead: advances the read cursor', async () => {
      const chat = makeChat();
      await makeService(chat).markRead(me, 'conv-1', 7);
      expect(chat.advanceCursor).toHaveBeenCalledWith('conv-1', 'me', 'read', 7);
    });
  });

  describe('listConversations', () => {
    it('enriches each other member with live online status', async () => {
      const item: ConversationListItem = {
        conversation: conversation(),
        other: summary('other'),
        lastMessage: message(),
        unreadCount: 2,
      };
      const chat = makeChat({
        listConversations: jest.fn().mockResolvedValue({ items: [item], total: 1 }),
      });
      const presence = makePresence({ isOnline: jest.fn().mockResolvedValue(true) });
      const result = await makeService(chat, makeConnectionCheck(), presence).listConversations(
        me,
        1,
        20,
      );
      expect(presence.isOnline).toHaveBeenCalledWith('other');
      expect(result.items[0].other.online).toBe(true);
      expect(result.items[0].unreadCount).toBe(2);
    });
  });

  describe('goOffline', () => {
    it('persists lastSeenAt only on true-offline', async () => {
      const chat = makeChat();
      const presence = makePresence({ offline: jest.fn().mockResolvedValue(true) });
      const result = await makeService(chat, makeConnectionCheck(), presence).goOffline('me');
      expect(chat.touchLastSeen).toHaveBeenCalledWith('me');
      expect(result.offline).toBe(true);
    });

    it('does not persist lastSeenAt when other sockets remain', async () => {
      const chat = makeChat();
      const presence = makePresence({ offline: jest.fn().mockResolvedValue(false) });
      const result = await makeService(chat, makeConnectionCheck(), presence).goOffline('me');
      expect(chat.touchLastSeen).not.toHaveBeenCalled();
      expect(result.offline).toBe(false);
    });
  });
});
