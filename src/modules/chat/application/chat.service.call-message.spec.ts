import { AppException } from '../../../common/exceptions/app.exception';
import { PresenceRepository } from '../../../infrastructure/presence/presence.repository';
import { ConnectionCheckRepository } from '../../../infrastructure/social-graph/connection-check.repository';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { PhoneVisibility } from '../../profiles/domain/enums/phone-visibility.enum';
import { MediaAssetRepository } from '../../media/domain/media-asset.repository';
import { Call } from '../../calls/domain/entities/call.entity';
import { CallEndReason } from '../../calls/domain/enums/call-end-reason.enum';
import { CallMedia } from '../../calls/domain/enums/call-media.enum';
import { CallParty } from '../../calls/domain/enums/call-party.enum';
import { CallStatus } from '../../calls/domain/enums/call-status.enum';
import { AppendMessageInput, ChatRepository } from '../domain/chat.repository';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { ConversationListItem } from '../domain/entities/conversation-view.entity';
import { Message } from '../domain/entities/message.entity';
import { ConversationType } from '../domain/enums/conversation-type.enum';
import { MessageType } from '../domain/enums/message-type.enum';
import { StickerDirectoryRepository } from '../domain/sticker-directory.repository';
import { ChatService } from './chat.service';

/**
 * Same mock set as `chat.service.spec.ts` (trimmed to what these tests need) — the two file-scoped
 * factories cannot be imported, only copied (they are not exported).
 */
function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'cnv_1',
    type: ConversationType.DIRECT,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    lastMessageAt: null,
    ...overrides,
  };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversationId: 'cnv_1',
    senderId: 'A',
    seq: 1,
    type: MessageType.TEXT,
    body: null,
    clientMsgId: null,
    deletedAt: null,
    albumId: null,
    attachment: null,
    sticker: null,
    replyTo: null,
    call: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function member(overrides: Partial<ConversationMember> = {}): ConversationMember {
  return {
    conversationId: 'cnv_1',
    studentId: 'A',
    lastReadSeq: 0,
    lastDeliveredSeq: 0,
    clearedBeforeSeq: 0,
    hidden: false,
    ...overrides,
  };
}

function listItem(overrides: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    conversation: conversation(),
    other: {
      id: 'B',
      username: 'B',
      fullName: 'B',
      avatarUrl: null,
      photos: [],
      bio: null,
      universityId: null,
      gender: null,
      courseYear: null,
      online: false,
      lastSeenAt: null,
      phoneNumber: null,
      lastSeenVisibility: LastSeenVisibility.CONNECTIONS,
      phoneVisibility: PhoneVisibility.NOBODY,
    },
    lastMessage: message(),
    unreadCount: 0,
    myReadSeq: 0,
    peerReadSeq: 0,
    peerDeliveredSeq: 0,
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
    otherMemberId: jest.fn().mockResolvedValue('B'),
    appendMessage: jest.fn(async (input: AppendMessageInput) =>
      message({
        conversationId: input.conversationId,
        senderId: input.senderId,
        body: input.body,
        type: input.type,
        albumId: input.albumId,
      }),
    ),
    countInAlbum: jest.fn().mockResolvedValue(0),
    listMessages: jest.fn().mockResolvedValue([]),
    listSince: jest.fn().mockResolvedValue([]),
    listConversations: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findConversationItem: jest.fn().mockResolvedValue(listItem()),
    unreadSummary: jest.fn().mockResolvedValue({ total: 0, conversations: 0 }),
    findMessage: jest.fn().mockResolvedValue(message()),
    softDeleteMessage: jest.fn(async (id: string) =>
      message({ id, body: null, deletedAt: new Date('2026-07-29T00:00:00Z') }),
    ),
    displayNameOf: jest.fn().mockResolvedValue('Kumushim'),
    pushSenderOf: jest.fn().mockResolvedValue({ name: 'Kumushim', avatarUrl: null }),
    listAround: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
    findMessagesByIds: jest.fn().mockResolvedValue([]),
    deleteMessages: jest.fn().mockResolvedValue({ unreadCount: 0, lastMessage: null }),
    clearHistory: jest.fn().mockResolvedValue(0),
    deleteConversation: jest.fn().mockResolvedValue(0),
    purgeClearedMessages: jest.fn().mockResolvedValue(0),
    advanceCursor: jest.fn().mockResolvedValue(undefined),
    touchLastSeen: jest.fn().mockResolvedValue(new Date('2026-07-27T00:00:00Z')),
    lastSeenVisibilityOf: jest.fn().mockResolvedValue(LastSeenVisibility.CONNECTIONS),
    ...overrides,
  };
}

function makeConnectionCheck(): ConnectionCheckRepository {
  return {
    areConnected: jest.fn().mockResolvedValue(true),
    connectedIds: jest.fn().mockResolvedValue([]),
    connectionState: jest.fn().mockResolvedValue('CONNECTED'),
  };
}

function makePresence(): PresenceRepository {
  return {
    online: jest.fn().mockResolvedValue(undefined),
    offline: jest.fn().mockResolvedValue(true),
    isOnline: jest.fn().mockResolvedValue(false),
    onlineAmong: jest.fn().mockResolvedValue(new Set<string>()),
  };
}

function makeMedia(): MediaAssetRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(null),
    findByIds: jest.fn().mockResolvedValue([]),
    bytesUploadedSince: jest.fn().mockResolvedValue(0),
    markProcessed: jest.fn(),
    attachToMessage: jest.fn(),
    findOrphans: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn(),
  };
}

function makeStickers(): StickerDirectoryRepository {
  return { findById: jest.fn().mockResolvedValue(null) };
}

let repo: ChatRepository;

function buildService(): ChatService {
  repo = makeChat();
  return new ChatService(repo, makeConnectionCheck(), makePresence(), makeMedia(), makeStickers());
}

/** A three-minute audio call, answered and hung up normally. */
function endedCall(overrides: Partial<Call> = {}): Call {
  return {
    id: 'call_1',
    conversationId: 'cnv_1',
    callerId: 'A',
    calleeId: 'B',
    media: CallMedia.AUDIO,
    status: CallStatus.ENDED,
    startedAt: new Date('2026-07-01T00:00:00.000Z'),
    answeredAt: new Date('2026-07-01T00:00:00.000Z'),
    endedAt: new Date('2026-07-01T00:03:04.000Z'),
    endReason: CallEndReason.HANGUP,
    endedBy: CallParty.CALLEE,
    ...overrides,
  };
}

/** Never answered — rings out. */
function missedCall(): Call {
  return endedCall({
    status: CallStatus.MISSED,
    answeredAt: null,
    endedAt: new Date('2026-07-01T00:00:30.000Z'),
    endReason: CallEndReason.TIMEOUT,
    endedBy: null,
  });
}

describe('ChatService call messages', () => {
  // ⚠️ `sendMessage` blocks only SYSTEM today, and `toMessageType` accepts any enum member. The
  // moment CALL exists a client can post `message:send { type: "CALL" }` and forge call history.
  it('rejects a client-sent CALL message', async () => {
    const service = buildService();
    await expect(
      service.sendMessage(
        { id: 'A', type: 'STUDENT' } as never,
        {
          conversationId: 'cnv_1',
          type: MessageType.CALL,
          body: null,
        } as never,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('writes a CALL message through appendMessage so seq stays contiguous', async () => {
    const service = buildService();
    await service.appendCallMessage(endedCall());
    expect(repo.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.CALL,
        senderId: 'A',
        callId: 'call_1',
        callDuration: 184_000,
      }),
    );
  });

  // ⚠️ §14.2 ("only a MISSED call is unread") used to be implemented by advancing the callee's read
  // cursor for every other outcome. The cursor is shared by the whole conversation and the CALL row
  // carries its highest `seq`, so answering the phone silently marked every text the callee had
  // never opened as read. The exclusion lives in the repository's unread predicate instead.
  it.each([
    ['an answered call', endedCall],
    ['a missed call', missedCall],
  ])('never touches the shared read cursor for %s', async (_name, call) => {
    const service = buildService();
    await service.appendCallMessage(call());
    expect(repo.advanceCursor).not.toHaveBeenCalled();
  });
});
