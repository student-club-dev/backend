import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PresenceRepository } from '../../../infrastructure/presence/presence.repository';
import { ConnectionCheckRepository } from '../../../infrastructure/social-graph/connection-check.repository';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { PhoneVisibility } from '../../profiles/domain/enums/phone-visibility.enum';
import { MediaAsset } from '../../media/domain/entities/media-asset.entity';
import { MediaAssetRepository } from '../../media/domain/media-asset.repository';
import { MediaKind, MediaProvider, MediaStatus } from '../../media/domain/enums/media-kind.enum';
import { AppendMessageInput, ChatRepository, MessageAuthRow } from '../domain/chat.repository';
import { DeleteScope } from '../domain/enums/delete-scope.enum';
import { MessageSticker, StickerDirectoryRepository } from '../domain/sticker-directory.repository';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { ConversationListItem } from '../domain/entities/conversation-view.entity';
import { Message } from '../domain/entities/message.entity';
import { ConversationType } from '../domain/enums/conversation-type.enum';
import { MessageType } from '../domain/enums/message-type.enum';
import { ExternalStickerRef } from './chat.io';
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

/** What `viewerOf(member())` produces — every read is expected to be filtered through it (§A4.3). */
const VIEWER = { studentId: 'me', clearedBeforeSeq: 0, lastReadSeq: 0 };

function member(overrides: Partial<ConversationMember> = {}): ConversationMember {
  return {
    conversationId: 'conv-1',
    studentId: 'me',
    lastReadSeq: 0,
    lastDeliveredSeq: 0,
    clearedBeforeSeq: 0,
    hidden: false,
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
    listAround: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
    findMessagesByIds: jest.fn().mockResolvedValue([]),
    deleteMessages: jest.fn().mockResolvedValue({ unreadCount: 0, lastMessage: null }),
    clearHistory: jest.fn().mockResolvedValue(812),
    deleteConversation: jest.fn().mockResolvedValue(812),
    purgeClearedMessages: jest.fn().mockResolvedValue(0),
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
    connectionState: jest.fn().mockResolvedValue(connected ? 'CONNECTED' : 'NOT_CONNECTED'),
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

function makeMedia(asset: MediaAsset | null = null): MediaAssetRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(asset),
    findByIds: jest.fn().mockResolvedValue(asset === null ? [] : [asset]),
    bytesUploadedSince: jest.fn().mockResolvedValue(0),
    markProcessed: jest.fn(),
    attachToMessage: jest.fn(),
    findOrphans: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn(),
  };
}

/** A READY image the caller owns, in this conversation, not yet attached to anything. */
function readyImage(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'med_1',
    ownerId: 'me',
    conversationId: 'conv-1',
    kind: MediaKind.IMAGE,
    status: MediaStatus.READY,
    quality: null,
    isAnimated: false,
    storageKey: 'k.webp',
    thumbStorageKey: 't.webp',
    externalUrl: null,
    externalThumbUrl: null,
    provider: null,
    externalId: null,
    mimeType: 'image/webp',
    sizeBytes: 1000,
    width: 100,
    height: 100,
    durationMs: null,
    waveform: [],
    transcript: null,
    variants: null,
    fileName: null,
    blurHash: 'L6P',
    messageId: null,
    createdAt: new Date('2026-07-29T00:00:00Z'),
    ...overrides,
  };
}

function makeStickers(found: MessageSticker | null = null): StickerDirectoryRepository {
  return { findById: jest.fn().mockResolvedValue(found) };
}

const STICKER: MessageSticker = {
  id: 'st_1',
  provider: null,
  packId: 'pk_1',
  emoji: '😄',
  url: 'https://cdn/st_1.webp',
  thumbUrl: null,
  width: 512,
  height: 512,
};

/** A sticker as it comes back from `GET /v1/stickers/search`, echoed by the client on a send. */
const PROVIDER_STICKER: ExternalStickerRef = {
  provider: MediaProvider.KLIPY,
  externalId: '8471021',
  url: 'https://static.klipy.com/ii/abc/md.webp',
  thumbUrl: 'https://static.klipy.com/ii/abc/xs.webp',
  width: 512,
  height: 512,
};

function makeService(
  chat: ChatRepository = makeChat(),
  connectionCheck: ConnectionCheckRepository = makeConnectionCheck(),
  presence: PresenceRepository = makePresence(),
  media: MediaAssetRepository = makeMedia(),
  stickers: StickerDirectoryRepository = makeStickers(STICKER),
): ChatService {
  return new ChatService(chat, connectionCheck, presence, media, stickers);
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
      await expect(
        makeService().sendMessage(me, { conversationId: 'conv-1', body: '   ' }),
      ).rejects.toMatchObject({
        code: ERROR_CODE.MESSAGE_EMPTY,
        status: 422,
      });
    });

    it('throws 404 CONVERSATION_NOT_FOUND when the caller is not a member', async () => {
      const chat = makeChat({ findMembership: jest.fn().mockResolvedValue(null) });
      await expect(
        makeService(chat).sendMessage(me, { conversationId: 'conv-1', body: 'hi' }),
      ).rejects.toMatchObject({
        code: ERROR_CODE.CONVERSATION_NOT_FOUND,
        status: 404,
      });
    });

    it('throws 403 NOT_CONNECTED when the pair is no longer connected', async () => {
      const service = makeService(makeChat(), makeConnectionCheck(false));
      await expect(
        service.sendMessage(me, { conversationId: 'conv-1', body: 'hi' }),
      ).rejects.toMatchObject({
        code: ERROR_CODE.NOT_CONNECTED,
        status: 403,
      });
    });

    it('appends the trimmed message for a connected member', async () => {
      const chat = makeChat();
      const result = await makeService(chat).sendMessage(me, {
        conversationId: 'conv-1',
        body: '  salom  ',
      });
      expect(chat.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', senderId: 'me', body: 'salom' }),
      );
      expect(result.body).toBe('salom');
    });

    it('passes the clientMsgId through for idempotency (C6)', async () => {
      const chat = makeChat();
      await makeService(chat).sendMessage(me, {
        conversationId: 'conv-1',
        body: 'salom',
        clientMsgId: 'client-42',
      });
      expect(chat.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'salom', clientMsgId: 'client-42' }),
      );
    });
  });

  // §2.1 — every way an attachment can be wrong. Each clause is a separate way a send could
  // otherwise smuggle in someone else's file, or one already spent.
  describe('sendMessage with an attachment', () => {
    const imageSend = { conversationId: 'conv-1', type: MessageType.IMAGE, mediaId: 'med_1' };

    it('attaches a READY image the caller owns', async () => {
      const chat = makeChat();
      await makeService(
        chat,
        makeConnectionCheck(),
        makePresence(),
        makeMedia(readyImage()),
      ).sendMessage(me, imageSend);
      expect(chat.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.IMAGE, mediaId: 'med_1' }),
      );
    });

    it('requires a mediaId for a media type', async () => {
      await expect(
        makeService().sendMessage(me, { conversationId: 'conv-1', type: MessageType.IMAGE }),
      ).rejects.toMatchObject({ code: ERROR_CODE.VALIDATION_ERROR });
    });

    it('refuses an attachment owned by someone else', async () => {
      const media = makeMedia(readyImage({ ownerId: 'other' }));
      await expect(
        makeService(makeChat(), makeConnectionCheck(), makePresence(), media).sendMessage(
          me,
          imageSend,
        ),
      ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_NOT_FOUND, status: 422 });
    });

    it('refuses an attachment uploaded for a different conversation', async () => {
      const media = makeMedia(readyImage({ conversationId: 'conv-other' }));
      await expect(
        makeService(makeChat(), makeConnectionCheck(), makePresence(), media).sendMessage(
          me,
          imageSend,
        ),
      ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_NOT_FOUND, status: 422 });
    });

    it('refuses an attachment already spent on another message', async () => {
      const media = makeMedia(readyImage({ messageId: 'msg_old' }));
      await expect(
        makeService(makeChat(), makeConnectionCheck(), makePresence(), media).sendMessage(
          me,
          imageSend,
        ),
      ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_ALREADY_USED, status: 422 });
    });

    it('refuses a video that is still transcoding', async () => {
      const media = makeMedia(readyImage({ status: MediaStatus.PROCESSING }));
      await expect(
        makeService(makeChat(), makeConnectionCheck(), makePresence(), media).sendMessage(
          me,
          imageSend,
        ),
      ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_NOT_READY, status: 422 });
    });

    it('refuses an attachment whose kind does not match the declared type', async () => {
      const media = makeMedia(readyImage({ kind: MediaKind.VOICE }));
      await expect(
        makeService(makeChat(), makeConnectionCheck(), makePresence(), media).sendMessage(
          me,
          imageSend,
        ),
      ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_KIND_MISMATCH, status: 422 });
    });

    it('refuses an eleventh image in the same album', async () => {
      const chat = makeChat({ countInAlbum: jest.fn().mockResolvedValue(10) });
      await expect(
        makeService(
          chat,
          makeConnectionCheck(),
          makePresence(),
          makeMedia(readyImage()),
        ).sendMessage(me, { ...imageSend, albumId: 'alb_1' }),
      ).rejects.toMatchObject({ code: ERROR_CODE.ALBUM_TOO_LARGE, status: 422 });
    });

    it('sends a sticker that exists in the catalogue', async () => {
      const chat = makeChat();
      await makeService(chat).sendMessage(me, {
        conversationId: 'conv-1',
        type: MessageType.STICKER,
        stickerId: 'st_1',
      });
      expect(chat.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.STICKER, stickerId: 'st_1', mediaId: null }),
      );
    });

    it('refuses an unknown stickerId', async () => {
      const service = makeService(
        makeChat(),
        makeConnectionCheck(),
        makePresence(),
        makeMedia(),
        makeStickers(null),
      );
      await expect(
        service.sendMessage(me, {
          conversationId: 'conv-1',
          type: MessageType.STICKER,
          stickerId: 'nope',
        }),
      ).rejects.toMatchObject({ code: ERROR_CODE.STICKER_NOT_FOUND, status: 422 });
    });

    it('requires a stickerId on a STICKER message', async () => {
      await expect(
        makeService().sendMessage(me, { conversationId: 'conv-1', type: MessageType.STICKER }),
      ).rejects.toMatchObject({ code: ERROR_CODE.VALIDATION_ERROR });
    });

    it('does not look up a sticker for a non-sticker message', async () => {
      const stickers = makeStickers(STICKER);
      await makeService(
        makeChat(),
        makeConnectionCheck(),
        makePresence(),
        makeMedia(),
        stickers,
      ).sendMessage(me, { conversationId: 'conv-1', body: 'salom' });
      expect(stickers.findById).not.toHaveBeenCalled();
    });

    it('stores a provider sticker on the row, without touching the catalogue', async () => {
      const chat = makeChat();
      const stickers = makeStickers(STICKER);
      await makeService(
        chat,
        makeConnectionCheck(),
        makePresence(),
        makeMedia(),
        stickers,
      ).sendMessage(me, {
        conversationId: 'conv-1',
        type: MessageType.STICKER,
        sticker: PROVIDER_STICKER,
      });

      // Nothing to look up: a KLIPY sticker has no row in our catalogue, which is the whole reason
      // the object travels on the message instead of an id.
      expect(stickers.findById).not.toHaveBeenCalled();
      expect(chat.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          stickerId: null,
          externalSticker: expect.objectContaining({
            provider: MediaProvider.KLIPY,
            externalId: '8471021',
            url: PROVIDER_STICKER.url,
          }),
        }),
      );
    });

    it('refuses a provider sticker served from a host outside the allowlist', async () => {
      // The client hands this object back to us, so an unchecked url is an open redirect: a link
      // that logs every recipient's IP renders exactly like a real sticker.
      await expect(
        makeService().sendMessage(me, {
          conversationId: 'conv-1',
          type: MessageType.STICKER,
          sticker: { ...PROVIDER_STICKER, url: 'https://static.klipy.com.evil.example/x.webp' },
        }),
      ).rejects.toMatchObject({ code: ERROR_CODE.STICKER_URL_NOT_ALLOWED, status: 422 });
    });

    it('refuses a provider sticker whose thumbUrl is off-allowlist even when the url is fine', async () => {
      await expect(
        makeService().sendMessage(me, {
          conversationId: 'conv-1',
          type: MessageType.STICKER,
          sticker: { ...PROVIDER_STICKER, thumbUrl: 'https://evil.example/x.webp' },
        }),
      ).rejects.toMatchObject({ code: ERROR_CODE.STICKER_URL_NOT_ALLOWED, status: 422 });
    });

    it('refuses a send that names both sticker sources', async () => {
      // Refused rather than resolved by precedence: the client that did this has a bug, and quietly
      // dropping half of what it sent is what would hide it.
      await expect(
        makeService().sendMessage(me, {
          conversationId: 'conv-1',
          type: MessageType.STICKER,
          stickerId: 'st_1',
          sticker: PROVIDER_STICKER,
        }),
      ).rejects.toMatchObject({ code: ERROR_CODE.STICKER_SOURCE_AMBIGUOUS, status: 422 });
    });

    it('keeps the old catalogue path working — an existing client sends stickerId alone', async () => {
      const chat = makeChat();
      await makeService(chat).sendMessage(me, {
        conversationId: 'conv-1',
        type: MessageType.STICKER,
        stickerId: 'st_1',
      });
      expect(chat.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ stickerId: 'st_1', externalSticker: null }),
      );
    });

    it('refuses a client-sent SYSTEM message', async () => {
      await expect(
        makeService().sendMessage(me, { conversationId: 'conv-1', type: MessageType.SYSTEM }),
      ).rejects.toMatchObject({ code: ERROR_CODE.VALIDATION_ERROR });
    });

    it('refuses a client-sent CALL message', async () => {
      await expect(
        makeService().sendMessage(me, { conversationId: 'conv-1', type: MessageType.CALL }),
      ).rejects.toMatchObject({ code: ERROR_CODE.VALIDATION_ERROR });
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
      expect(chat.listSince).toHaveBeenCalledWith('conv-1', VIEWER, 3, 21);
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
      expect(chat.listMessages).toHaveBeenCalledWith('conv-1', VIEWER, 5, 21);
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

      expect(chat.listMessages).toHaveBeenCalledWith('conv-1', VIEWER, null, 4);
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

      expect(chat.listSince).toHaveBeenCalledWith('conv-1', VIEWER, 0, 2);
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

  // §18 — soft delete. `seq` is the axis every cursor walks, so the row survives; only its content
  // and its claim on the unread badge go away.
  describe('deleteMessage (§18)', () => {
    it('soft-deletes the caller’s own message', async () => {
      const chat = makeChat();
      const result = await makeService(chat).deleteMessage(me, 'm1');
      expect(chat.softDeleteMessage).toHaveBeenCalledWith('m1');
      expect(result.body).toBeNull();
      expect(result.deletedAt).not.toBeNull();
    });

    it('throws 403 FORBIDDEN for a message the caller did not send', async () => {
      const chat = makeChat({
        findMessage: jest.fn().mockResolvedValue(message({ senderId: 'other' })),
      });
      await expect(makeService(chat).deleteMessage(me, 'm1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(chat.softDeleteMessage).not.toHaveBeenCalled();
    });

    it('throws 404 for an unknown message id', async () => {
      const chat = makeChat({ findMessage: jest.fn().mockResolvedValue(null) });
      await expect(makeService(chat).deleteMessage(me, 'nope')).rejects.toMatchObject({
        code: ERROR_CODE.MESSAGE_NOT_FOUND,
        status: 404,
      });
    });

    it('hides a non-member’s message behind 404 rather than 403', async () => {
      // Answering 403 here would confirm the id exists — an id-probing oracle for other people's
      // conversations. Only a member is entitled to be told "exists, but not yours".
      const chat = makeChat({
        findMessage: jest.fn().mockResolvedValue(message({ senderId: 'other' })),
        findMembership: jest.fn().mockResolvedValue(null),
      });
      await expect(makeService(chat).deleteMessage(me, 'm1')).rejects.toMatchObject({
        code: ERROR_CODE.MESSAGE_NOT_FOUND,
        status: 404,
      });
    });

    it('is idempotent — a second delete changes nothing', async () => {
      const already = message({ body: null, deletedAt: new Date('2026-07-29T00:00:00Z') });
      const chat = makeChat({ findMessage: jest.fn().mockResolvedValue(already) });
      const result = await makeService(chat).deleteMessage(me, 'm1');
      expect(result).toBe(already);
      expect(chat.softDeleteMessage).not.toHaveBeenCalled();
    });
  });

  describe('deleteMessages (§A2)', () => {
    const authRow = (overrides: Partial<MessageAuthRow> = {}): MessageAuthRow => ({
      id: 'm1',
      conversationId: 'conv-1',
      senderId: 'me',
      seq: 1,
      ...overrides,
    });

    it('skips someone else’s message under EVERYONE and deletes the rest', async () => {
      const chat = makeChat({
        findMessagesByIds: jest
          .fn()
          .mockResolvedValue([
            authRow({ id: 'a', seq: 1 }),
            authRow({ id: 'b', seq: 2, senderId: 'other' }),
          ]),
        deleteMessages: jest
          .fn()
          .mockResolvedValue({ deletedSeqs: [1], unreadCount: 0, lastMessage: null }),
      });

      const result = await makeService(chat).deleteMessages(me, ['a', 'b'], DeleteScope.EVERYONE);

      expect(result.deleted).toEqual(['a']);
      expect(result.skipped).toEqual([{ id: 'b', reason: 'NOT_OWN' }]);
      expect(chat.deleteMessages).toHaveBeenCalledWith(
        'conv-1',
        VIEWER,
        ['a'],
        DeleteScope.EVERYONE,
      );
    });

    it('hides anyone’s message under ME — nothing is mutated, so ownership is irrelevant', async () => {
      const chat = makeChat({
        findMessagesByIds: jest.fn().mockResolvedValue([authRow({ id: 'b', senderId: 'other' })]),
        deleteMessages: jest
          .fn()
          .mockResolvedValue({ deletedSeqs: [1], unreadCount: 0, lastMessage: null }),
      });

      const result = await makeService(chat).deleteMessages(me, ['b'], DeleteScope.ME);

      expect(result.deleted).toEqual(['b']);
      expect(result.skipped).toEqual([]);
    });

    it('rejects ids drawn from more than one conversation', async () => {
      const chat = makeChat({
        findMessagesByIds: jest
          .fn()
          .mockResolvedValue([
            authRow({ id: 'a' }),
            authRow({ id: 'b', conversationId: 'conv-2' }),
          ]),
      });

      await expect(
        makeService(chat).deleteMessages(me, ['a', 'b'], DeleteScope.ME),
      ).rejects.toMatchObject({ code: ERROR_CODE.MIXED_CONVERSATIONS, status: 422 });
      expect(chat.deleteMessages).not.toHaveBeenCalled();
    });

    it('rejects more than 100 ids before touching the database', async () => {
      const chat = makeChat();
      const ids = Array.from({ length: 101 }, (_, index) => `m${index}`);

      await expect(makeService(chat).deleteMessages(me, ids, DeleteScope.ME)).rejects.toMatchObject(
        {
          code: ERROR_CODE.TOO_MANY_IDS,
          status: 422,
        },
      );
      expect(chat.findMessagesByIds).not.toHaveBeenCalled();
    });

    it('reports unknown ids as skipped rather than failing the whole batch', async () => {
      const chat = makeChat({
        findMessagesByIds: jest.fn().mockResolvedValue([authRow({ id: 'a' })]),
        deleteMessages: jest
          .fn()
          .mockResolvedValue({ deletedSeqs: [1], unreadCount: 0, lastMessage: null }),
      });

      const result = await makeService(chat).deleteMessages(
        me,
        ['a', 'ghost'],
        DeleteScope.EVERYONE,
      );

      expect(result.deleted).toEqual(['a']);
      expect(result.skipped).toEqual([{ id: 'ghost', reason: 'NOT_FOUND' }]);
    });

    it('throws 403 NOT_MEMBER when the caller does not belong to the conversation', async () => {
      const chat = makeChat({
        findMessagesByIds: jest.fn().mockResolvedValue([authRow({ senderId: 'other' })]),
        findMembership: jest.fn().mockResolvedValue(null),
      });

      await expect(
        makeService(chat).deleteMessages(me, ['m1'], DeleteScope.ME),
      ).rejects.toMatchObject({ code: ERROR_CODE.NOT_MEMBER, status: 403 });
    });

    it('throws 404 when not one id resolves — there is no conversation to report on', async () => {
      const chat = makeChat({ findMessagesByIds: jest.fn().mockResolvedValue([]) });

      await expect(
        makeService(chat).deleteMessages(me, ['ghost'], DeleteScope.ME),
      ).rejects.toMatchObject({ code: ERROR_CODE.MESSAGE_NOT_FOUND, status: 404 });
    });

    it('returns 200 with an empty `deleted` when everything was skipped', async () => {
      const chat = makeChat({
        findMessagesByIds: jest.fn().mockResolvedValue([authRow({ senderId: 'other' })]),
      });

      const result = await makeService(chat).deleteMessages(me, ['m1'], DeleteScope.EVERYONE);

      expect(result.deleted).toEqual([]);
      expect(result.skipped).toEqual([{ id: 'm1', reason: 'NOT_OWN' }]);
      expect(result.unreadCount).toBe(2);
      expect(chat.deleteMessages).not.toHaveBeenCalled();
    });

    // The WS event ships `ids` and `seqs` as parallel arrays.
    it('returns deletedSeqs aligned with deleted, not sorted independently', async () => {
      const chat = makeChat({
        findMessagesByIds: jest
          .fn()
          .mockResolvedValue([
            authRow({ id: 'c', seq: 30 }),
            authRow({ id: 'a', seq: 10 }),
            authRow({ id: 'b', seq: 20 }),
          ]),
      });

      const result = await makeService(chat).deleteMessages(
        me,
        ['c', 'a', 'b'],
        DeleteScope.EVERYONE,
      );

      expect(result.deleted).toEqual(['c', 'a', 'b']);
      expect(result.deletedSeqs).toEqual([30, 10, 20]);
    });

    it('collapses duplicate ids so one message is not reported twice', async () => {
      const chat = makeChat({
        findMessagesByIds: jest.fn().mockResolvedValue([authRow({ id: 'a' })]),
        deleteMessages: jest
          .fn()
          .mockResolvedValue({ deletedSeqs: [1], unreadCount: 0, lastMessage: null }),
      });

      const result = await makeService(chat).deleteMessages(
        me,
        ['a', 'a', 'a'],
        DeleteScope.EVERYONE,
      );

      expect(result.deleted).toEqual(['a']);
      expect(chat.findMessagesByIds).toHaveBeenCalledWith(['a']);
    });
  });

  describe('sendMessage with a reply/quote (§C1)', () => {
    const send = (chat: ChatRepository, extra: Record<string, unknown>) =>
      makeService(chat).sendMessage(me, { conversationId: 'conv-1', body: 'ha', ...extra });

    it('freezes the target into a snapshot', async () => {
      const chat = makeChat({
        findMessage: jest
          .fn()
          .mockResolvedValue(
            message({ id: 't1', seq: 9, senderId: 'other', body: 'ertaga soat 10 da' }),
          ),
      });

      await send(chat, { replyToMessageId: 't1', quote: { text: 'soat 10', offset: 7 } });

      expect(chat.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          reply: {
            replyToMessageId: 't1',
            replyToSenderId: 'other',
            replyToSenderName: 'Kumushim',
            replyToSeq: 9,
            replyToType: MessageType.TEXT,
            replyToPreview: 'ertaga soat 10 da',
            quoteText: 'soat 10',
            quoteOffset: 7,
          },
        }),
      );
    });

    it('sends no reply columns when nothing was replied to', async () => {
      const chat = makeChat();
      await send(chat, {});
      expect(chat.appendMessage).toHaveBeenCalledWith(expect.objectContaining({ reply: null }));
    });

    it('rejects a target from another conversation — it would leak a stranger\u2019s text', async () => {
      const chat = makeChat({
        findMessage: jest
          .fn()
          .mockResolvedValue(message({ id: 't1', conversationId: 'other-conv' })),
      });
      await expect(send(chat, { replyToMessageId: 't1' })).rejects.toMatchObject({
        code: ERROR_CODE.REPLY_TARGET_NOT_FOUND,
        status: 422,
      });
      expect(chat.appendMessage).not.toHaveBeenCalled();
    });

    it('rejects an unknown target', async () => {
      const chat = makeChat({ findMessage: jest.fn().mockResolvedValue(null) });
      await expect(send(chat, { replyToMessageId: 'ghost' })).rejects.toMatchObject({
        code: ERROR_CODE.REPLY_TARGET_NOT_FOUND,
      });
    });

    it('rejects a reply to a deleted message', async () => {
      const chat = makeChat({
        findMessage: jest.fn().mockResolvedValue(message({ id: 't1', deletedAt: new Date() })),
      });
      await expect(send(chat, { replyToMessageId: 't1' })).rejects.toMatchObject({
        code: ERROR_CODE.REPLY_TARGET_DELETED,
      });
    });

    it('rejects a quote that is not the slice at the offset', async () => {
      const chat = makeChat({
        findMessage: jest.fn().mockResolvedValue(message({ id: 't1', body: 'ertaga soat 10 da' })),
      });
      await expect(
        send(chat, { replyToMessageId: 't1', quote: { text: 'soat 10', offset: 0 } }),
      ).rejects.toMatchObject({ code: ERROR_CODE.QUOTE_NOT_FOUND });
    });

    it('rejects a quote with no reply target', async () => {
      const chat = makeChat();
      await expect(send(chat, { quote: { text: 'x', offset: 0 } })).rejects.toMatchObject({
        code: ERROR_CODE.QUOTE_WITHOUT_REPLY,
      });
      expect(chat.findMessage).not.toHaveBeenCalled();
    });

    it('stores a null preview when replying to media, which has no text', async () => {
      const chat = makeChat({
        findMessage: jest
          .fn()
          .mockResolvedValue(message({ id: 't1', type: MessageType.IMAGE, body: null })),
      });
      await send(chat, { replyToMessageId: 't1' });
      expect(chat.appendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          reply: expect.objectContaining({ replyToPreview: null, replyToType: MessageType.IMAGE }),
        }),
      );
    });

    it('truncates a long preview to 120 characters', async () => {
      const chat = makeChat({
        findMessage: jest.fn().mockResolvedValue(message({ id: 't1', body: 'a'.repeat(400) })),
      });
      await send(chat, { replyToMessageId: 't1' });
      const input = (chat.appendMessage as jest.Mock).mock.calls[0][0];
      expect(input.reply.replyToPreview).toHaveLength(120);
    });
  });

  describe('historyAround (§C3)', () => {
    it('asks the repository for a window centred on the seq', async () => {
      const chat = makeChat({
        listAround: jest.fn().mockResolvedValue({ items: [message()], hasMore: true }),
      });
      const page = await makeService(chat).historyAround(me, 'conv-1', 141, 50);

      expect(chat.listAround).toHaveBeenCalledWith('conv-1', VIEWER, 141, 50);
      expect(page.items).toHaveLength(1);
      expect(page.hasMore).toBe(true);
    });

    it('404s for a non-member', async () => {
      const chat = makeChat({ findMembership: jest.fn().mockResolvedValue(null) });
      await expect(makeService(chat).historyAround(me, 'conv-1', 5, 50)).rejects.toMatchObject({
        code: ERROR_CODE.CONVERSATION_NOT_FOUND,
      });
    });
  });

  describe('clearHistory (§B1)', () => {
    it('raises the watermark for the caller and reports a zero unread count', async () => {
      const chat = makeChat();
      const result = await makeService(chat).clearHistory(me, 'conv-1', DeleteScope.ME);

      expect(chat.clearHistory).toHaveBeenCalledWith('conv-1', 'me', DeleteScope.ME);
      expect(result).toEqual({ conversationId: 'conv-1', clearedBeforeSeq: 812, unreadCount: 0 });
    });

    it('passes EVERYONE through so both members are cleared', async () => {
      const chat = makeChat();
      await makeService(chat).clearHistory(me, 'conv-1', DeleteScope.EVERYONE);
      expect(chat.clearHistory).toHaveBeenCalledWith('conv-1', 'me', DeleteScope.EVERYONE);
    });

    it('404s for a non-member before touching the watermark', async () => {
      const chat = makeChat({ findMembership: jest.fn().mockResolvedValue(null) });

      await expect(
        makeService(chat).clearHistory(me, 'conv-1', DeleteScope.ME),
      ).rejects.toMatchObject({ code: ERROR_CODE.CONVERSATION_NOT_FOUND, status: 404 });
      expect(chat.clearHistory).not.toHaveBeenCalled();
    });
  });

  describe('deleteConversation (§B2)', () => {
    it('clears and hides for the caller', async () => {
      const chat = makeChat();
      const result = await makeService(chat).deleteConversation(me, 'conv-1', DeleteScope.ME);

      expect(chat.deleteConversation).toHaveBeenCalledWith('conv-1', 'me', DeleteScope.ME);
      expect(result).toEqual({ conversationId: 'conv-1', clearedBeforeSeq: 812 });
    });

    it('passes EVERYONE through so both members lose it', async () => {
      const chat = makeChat();
      await makeService(chat).deleteConversation(me, 'conv-1', DeleteScope.EVERYONE);
      expect(chat.deleteConversation).toHaveBeenCalledWith('conv-1', 'me', DeleteScope.EVERYONE);
    });

    it('404s for a non-member before touching anything', async () => {
      const chat = makeChat({ findMembership: jest.fn().mockResolvedValue(null) });
      await expect(
        makeService(chat).deleteConversation(me, 'conv-1', DeleteScope.ME),
      ).rejects.toMatchObject({ code: ERROR_CODE.CONVERSATION_NOT_FOUND });
      expect(chat.deleteConversation).not.toHaveBeenCalled();
    });
  });

  describe('conversationItem / unreadSummary (§18)', () => {
    it('404s when the caller is not a member', async () => {
      const chat = makeChat({ findConversationItem: jest.fn().mockResolvedValue(null) });
      await expect(makeService(chat).conversationItem(me, 'conv-1')).rejects.toMatchObject({
        code: ERROR_CODE.CONVERSATION_NOT_FOUND,
        status: 404,
      });
    });

    it('applies presence visibility to the other member, like the list does', async () => {
      const chat = makeChat();
      const presence = makePresence({ isOnline: jest.fn().mockResolvedValue(true) });
      const item = await makeService(chat, makeConnectionCheck(), presence).conversationItem(
        me,
        'conv-1',
      );
      expect(item.other.online).toBe(true);
    });

    it('hides presence from a former connection', async () => {
      const chat = makeChat();
      const presence = makePresence({ isOnline: jest.fn().mockResolvedValue(true) });
      const item = await makeService(
        chat,
        makeConnectionCheck(false, []),
        presence,
      ).conversationItem(me, 'conv-1');
      expect(item.other).toMatchObject({ online: false, lastSeenAt: null });
    });

    it('passes the unread summary through', async () => {
      const chat = makeChat({
        unreadSummary: jest.fn().mockResolvedValue({ total: 37, conversations: 4 }),
      });
      await expect(makeService(chat).unreadSummary(me)).resolves.toEqual({
        total: 37,
        conversations: 4,
      });
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
