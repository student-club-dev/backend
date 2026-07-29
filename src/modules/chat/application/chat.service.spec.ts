import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PresenceRepository } from '../../../infrastructure/presence/presence.repository';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { ChatRepository } from '../domain/chat.repository';
import { ConnectionCheckRepository } from '../domain/connection-check.repository';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { ConversationListItem } from '../domain/entities/conversation-view.entity';
import { Message } from '../domain/entities/message.entity';
import { ConversationType } from '../domain/enums/conversation-type.enum';
import { MessageType } from '../domain/enums/message-type.enum';
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
    clientMsgId: null,
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

function summary(
  id: string,
  overrides: Partial<ConversationListItem['other']> = {},
): ConversationListItem['other'] {
  return {
    id,
    username: id,
    fullName: id,
    avatarUrl: null,
    universityId: null,
    gender: null,
    courseYear: null,
    online: false,
    lastSeenAt: null,
    lastSeenVisibility: LastSeenVisibility.CONNECTIONS,
    ...overrides,
  };
}

function listItem(overrides: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    conversation: conversation(),
    other: summary('other'),
    lastMessage: message(),
    unreadCount: 2,
    myReadSeq: 3,
    peerReadSeq: 4,
    peerDeliveredSeq: 5,
    ...overrides,
  };
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
    listSince: jest.fn().mockResolvedValue([]),
    listConversations: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    advanceCursor: jest.fn().mockResolvedValue(undefined),
    touchLastSeen: jest.fn().mockResolvedValue(new Date('2026-07-27T00:00:00Z')),
    lastSeenVisibilityOf: jest.fn().mockResolvedValue(LastSeenVisibility.CONNECTIONS),
    ...overrides,
  };
}

function makeConnectionCheck(
  connected = true,
  connectedIds: string[] = ['other'],
): ConnectionCheckRepository {
  return {
    areConnected: jest.fn().mockResolvedValue(connected),
    connectedIds: jest.fn().mockResolvedValue(connectedIds),
  };
}

function makePresence(overrides: Partial<PresenceRepository> = {}): PresenceRepository {
  return {
    online: jest.fn().mockResolvedValue(undefined),
    offline: jest.fn().mockResolvedValue(true),
    isOnline: jest.fn().mockResolvedValue(false),
    onlineAmong: jest.fn().mockResolvedValue(new Set<string>()),
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
      expect(chat.appendMessage).toHaveBeenCalledWith('conv-1', 'me', 'salom', null);
      expect(result.body).toBe('salom');
    });

    it('passes the clientMsgId through for idempotency (C6)', async () => {
      const chat = makeChat();
      await makeService(chat).sendMessage(me, 'conv-1', 'salom', 'client-42');
      expect(chat.appendMessage).toHaveBeenCalledWith('conv-1', 'me', 'salom', 'client-42');
    });
  });

  describe('messagesSince', () => {
    it('404 for a non-member', async () => {
      const chat = makeChat({ findMembership: jest.fn().mockResolvedValue(null) });
      await expect(makeService(chat).messagesSince(me, 'conv-1', 3, 20)).rejects.toMatchObject({
        code: ERROR_CODE.CONVERSATION_NOT_FOUND,
      });
    });

    it('returns messages after the cursor for a member', async () => {
      const chat = makeChat({ listSince: jest.fn().mockResolvedValue([message({ seq: 4 })]) });
      const result = await makeService(chat).messagesSince(me, 'conv-1', 3, 20);
      expect(chat.listSince).toHaveBeenCalledWith('conv-1', 3, 21);
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
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
      expect(chat.listMessages).toHaveBeenCalledWith('conv-1', 5, 21);
      expect(result.items).toHaveLength(1);
    });

    it('markRead: advances the read cursor', async () => {
      const chat = makeChat();
      await makeService(chat).markRead(me, 'conv-1', 7);
      expect(chat.advanceCursor).toHaveBeenCalledWith('conv-1', 'me', 'read', 7);
    });
  });

  // §17.5 — `hasMore` used to be `rows.length === size`, which reported "more history" on a last
  // page that happened to fill exactly. The client then paged forever into an empty result.
  describe('hasMore (§17.5)', () => {
    it('asks the repository for size + 1 and reports hasMore when the extra row comes back', async () => {
      const rows = [
        message({ seq: 10 }),
        message({ seq: 9 }),
        message({ seq: 8 }),
        message({ seq: 7 }),
      ];
      const chat = makeChat({ listMessages: jest.fn().mockResolvedValue(rows) });

      const page = await makeService(chat).history(me, 'conv-1', null, 3);

      expect(chat.listMessages).toHaveBeenCalledWith('conv-1', null, 4);
      expect(page.items).toHaveLength(3);
      expect(page.hasMore).toBe(true);
    });

    it('reports hasMore = false on a last page that is exactly `size` long', async () => {
      const chat = makeChat({
        listMessages: jest.fn().mockResolvedValue([message({ seq: 3 }), message({ seq: 2 })]),
      });

      const page = await makeService(chat).history(me, 'conv-1', null, 2);

      expect(page.items).toHaveLength(2);
      expect(page.hasMore).toBe(false);
    });

    it('applies the same rule to the catch-up direction', async () => {
      const chat = makeChat({
        listSince: jest.fn().mockResolvedValue([message({ seq: 1 }), message({ seq: 2 })]),
      });

      const page = await makeService(chat).messagesSince(me, 'conv-1', 0, 1);

      expect(chat.listSince).toHaveBeenCalledWith('conv-1', 0, 2);
      expect(page.items).toHaveLength(1);
      expect(page.hasMore).toBe(true);
    });
  });

  describe('listConversations', () => {
    it('enriches each other member with live online status', async () => {
      const chat = makeChat({
        listConversations: jest.fn().mockResolvedValue({ items: [listItem()], total: 1 }),
      });
      const presence = makePresence({
        onlineAmong: jest.fn().mockResolvedValue(new Set(['other'])),
      });
      const result = await makeService(chat, makeConnectionCheck(), presence).listConversations(
        me,
        1,
        20,
      );
      expect(result.items[0].other.online).toBe(true);
      expect(result.items[0].unreadCount).toBe(2);
    });

    it('carries the read cursors through so ✓✓ survives a restart', async () => {
      const chat = makeChat({
        listConversations: jest.fn().mockResolvedValue({ items: [listItem()], total: 1 }),
      });
      const result = await makeService(chat).listConversations(me, 1, 20);
      expect(result.items[0]).toMatchObject({
        myReadSeq: 3,
        peerReadSeq: 4,
        peerDeliveredSeq: 5,
      });
    });

    it('hides presence from a former connection (history outlives the connection, C9)', async () => {
      const seen = new Date('2026-07-20T10:00:00Z');
      const chat = makeChat({
        listConversations: jest.fn().mockResolvedValue({
          items: [listItem({ other: summary('other', { lastSeenAt: seen }) })],
          total: 1,
        }),
      });
      const presence = makePresence({
        onlineAmong: jest.fn().mockResolvedValue(new Set(['other'])),
      });
      // No longer connected — CONNECTIONS visibility must now hide both fields.
      const result = await makeService(
        chat,
        makeConnectionCheck(false, []),
        presence,
      ).listConversations(me, 1, 20);
      expect(result.items[0].other).toMatchObject({ online: false, lastSeenAt: null });
    });
  });

  describe('presenceAudience', () => {
    it('targets the connections, not every past chat partner', async () => {
      const connectionCheck = makeConnectionCheck(true, ['a', 'b']);
      const audience = await makeService(makeChat(), connectionCheck).presenceAudience('me');
      expect(connectionCheck.connectedIds).toHaveBeenCalledWith('me');
      expect(audience).toEqual(['a', 'b']);
    });

    it('is empty when the student hid their presence (NOBODY)', async () => {
      const chat = makeChat({
        lastSeenVisibilityOf: jest.fn().mockResolvedValue(LastSeenVisibility.NOBODY),
      });
      const connectionCheck = makeConnectionCheck(true, ['a', 'b']);
      const audience = await makeService(chat, connectionCheck).presenceAudience('me');
      expect(audience).toEqual([]);
      expect(connectionCheck.connectedIds).not.toHaveBeenCalled();
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
