import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  PRESENCE_REPOSITORY,
  PresenceRepository,
} from '../../../infrastructure/presence/presence.repository';
import { applyPresenceVisibility } from '../../connections/domain/presence-visibility';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import {
  MEDIA_ASSET_REPOSITORY,
  MediaAssetRepository,
} from '../../media/domain/media-asset.repository';
import { MediaKind, MediaStatus } from '../../media/domain/enums/media-kind.enum';
import { isAllowedGifUrl } from '../../gifs/domain/gif-source';
import { CHAT_REPOSITORY, ChatRepository, UnreadSummary } from '../domain/chat.repository';
import { MessageType } from '../domain/enums/message-type.enum';
import {
  STICKER_DIRECTORY,
  StickerDirectoryRepository,
} from '../domain/sticker-directory.repository';
import { MAX_ALBUM_SIZE, normalizeBody, requiredKindFor } from '../domain/message-composition';
import { CONNECTION_CHECK, ConnectionCheckRepository } from '../domain/connection-check.repository';
import { Conversation } from '../domain/entities/conversation.entity';
import { ConversationListItem } from '../domain/entities/conversation-view.entity';
import { Message } from '../domain/entities/message.entity';
import { directKeyOf, ExternalGifRef, MessagePage, Page, SendMessageInput } from './chat.io';

/**
 * Chat use-cases (docs/architecture/chat.md). 1:1 DIRECT conversations gated by an accepted
 * connection (C1); the caller id is the JWT `sub` (students only). Broadcasting is the gateway's
 * job — the service returns domain data. Depends on repository interfaces only.
 */
@Injectable()
export class ChatService {
  constructor(
    @Inject(CHAT_REPOSITORY) private readonly chat: ChatRepository,
    @Inject(CONNECTION_CHECK) private readonly connectionCheck: ConnectionCheckRepository,
    @Inject(PRESENCE_REPOSITORY) private readonly presence: PresenceRepository,
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly media: MediaAssetRepository,
    @Inject(STICKER_DIRECTORY) private readonly stickers: StickerDirectoryRepository,
  ) {}

  /** Opens (or returns) the DIRECT conversation with a connected student. */
  async openDirect(user: AuthenticatedUser, otherId: string): Promise<Conversation> {
    if (otherId === user.id) {
      throw AppException.validation({ studentId: "O'zingiz bilan suhbat ochib bo'lmaydi" });
    }
    if (!(await this.connectionCheck.areConnected(user.id, otherId))) {
      throw new AppException(ERROR_CODE.NOT_CONNECTED, 403, "Avval bog'lanish kerak");
    }
    const directKey = directKeyOf(user.id, otherId);
    return (
      (await this.chat.findDirect(directKey)) ??
      (await this.chat.createDirect(directKey, user.id, otherId))
    );
  }

  /**
   * Sends a message into a conversation the caller belongs to (connection re-checked).
   *
   * `type` defaults to `TEXT`, which is what makes an older client — one that only ever sends
   * `{ body, clientMsgId }` — keep working unchanged.
   */
  async sendMessage(user: AuthenticatedUser, input: SendMessageInput): Promise<Message> {
    const type = input.type ?? MessageType.TEXT;
    if (type === MessageType.SYSTEM) {
      throw AppException.validation({ type: 'SYSTEM xabarni yuborib bo‘lmaydi' });
    }

    const body = normalizeBody(type, input.body);

    await this.assertMember(input.conversationId, user.id);
    const otherId = await this.chat.otherMemberId(input.conversationId, user.id);
    if (otherId !== null && !(await this.connectionCheck.areConnected(user.id, otherId))) {
      throw new AppException(ERROR_CODE.NOT_CONNECTED, 403, "Avval bog'lanish kerak");
    }

    const mediaId = await this.resolveAttachment(user, type, input);
    const stickerId = await this.resolveSticker(type, input.stickerId ?? null);
    await this.assertAlbumHasRoom(input.conversationId, input.albumId ?? null);

    return this.chat.appendMessage({
      conversationId: input.conversationId,
      senderId: user.id,
      type,
      body,
      clientMsgId: input.clientMsgId ?? null,
      mediaId,
      stickerId,
      albumId: input.albumId ?? null,
    });
  }

  /** A `STICKER` message must name a sticker that exists; every other type must not name one. */
  private async resolveSticker(
    type: MessageType,
    stickerId: string | null,
  ): Promise<string | null> {
    if (type !== MessageType.STICKER) {
      return null;
    }
    if (stickerId === null) {
      throw AppException.validation({ stickerId: 'Stiker tanlang' });
    }
    if ((await this.stickers.findById(stickerId)) === null) {
      throw new AppException(ERROR_CODE.STICKER_NOT_FOUND, 422, 'Stiker topilmadi');
    }
    return stickerId;
  }

  /**
   * Checks that the `mediaId` may be attached to this message, and returns it (or null when the
   * type carries no attachment).
   *
   * Every clause here is a separate way the send could otherwise go wrong: someone else's upload,
   * an upload for a different conversation, one already spent on an earlier message, a video that
   * has not finished transcoding, or a kind that does not match the declared type.
   */
  private async resolveAttachment(
    user: AuthenticatedUser,
    type: MessageType,
    input: SendMessageInput,
  ): Promise<string | null> {
    const requiredKind = requiredKindFor(type);
    if (requiredKind === null) {
      return null;
    }

    // A GIF has two sources that must look identical to the client: an upload, or a pick from
    // provider search. The second one is referenced rather than copied — re-hosting is against
    // their terms — so it gets a MediaAsset row with no bytes behind it.
    if (type === MessageType.GIF && input.gif !== undefined && input.gif !== null) {
      if (input.mediaId !== undefined && input.mediaId !== null) {
        throw AppException.validation({ gif: 'mediaId yoki gif — ikkalasi emas' });
      }
      return this.createExternalGif(user, input.conversationId, input.gif);
    }

    if (input.mediaId === undefined || input.mediaId === null) {
      throw AppException.validation({ mediaId: 'Avval faylni yuklang' });
    }

    const asset = await this.media.findById(input.mediaId);
    if (asset === null || asset.ownerId !== user.id) {
      throw new AppException(ERROR_CODE.MEDIA_NOT_FOUND, 422, 'Fayl topilmadi');
    }
    if (asset.conversationId !== input.conversationId) {
      throw new AppException(ERROR_CODE.MEDIA_NOT_FOUND, 422, 'Fayl topilmadi');
    }
    if (asset.messageId !== null) {
      throw new AppException(ERROR_CODE.MEDIA_ALREADY_USED, 422, 'Bu fayl allaqachon yuborilgan');
    }
    if (asset.status !== MediaStatus.READY) {
      throw new AppException(ERROR_CODE.MEDIA_NOT_READY, 422, 'Fayl hali tayyor emas');
    }
    if (asset.kind !== requiredKind) {
      throw new AppException(
        ERROR_CODE.MEDIA_KIND_MISMATCH,
        422,
        'Fayl turi xabar turiga mos emas',
      );
    }
    return asset.id;
  }

  /**
   * Stores a provider GIF as an attachment without downloading it. Both URLs are re-checked against
   * the host allowlist here, not just in search: the client sends this object back to us, so
   * trusting it would turn the field into an open redirect to any host an attacker chooses.
   */
  private async createExternalGif(
    user: AuthenticatedUser,
    conversationId: string,
    gif: ExternalGifRef,
  ): Promise<string> {
    if (!isAllowedGifUrl(gif.url) || !isAllowedGifUrl(gif.thumbUrl)) {
      throw new AppException(
        ERROR_CODE.GIF_URL_NOT_ALLOWED,
        422,
        'Bu havoladan GIF yuborib bo‘lmaydi',
      );
    }
    const asset = await this.media.create({
      ownerId: user.id,
      conversationId,
      kind: MediaKind.GIF,
      status: MediaStatus.READY,
      isAnimated: true,
      storageKey: null,
      thumbStorageKey: null,
      externalUrl: gif.url,
      externalThumbUrl: gif.thumbUrl,
      provider: gif.provider,
      externalId: gif.externalId,
      mimeType: 'video/mp4',
      // Not ours to measure — the bytes live on their CDN. Zero keeps it out of the daily quota,
      // which is about our disk, not theirs.
      sizeBytes: 0,
      width: gif.width,
      height: gif.height,
      durationMs: gif.durationMs ?? null,
      waveform: [],
      fileName: null,
      blurHash: null,
    });
    return asset.id;
  }

  private async assertAlbumHasRoom(conversationId: string, albumId: string | null): Promise<void> {
    if (albumId === null) {
      return;
    }
    if ((await this.chat.countInAlbum(conversationId, albumId)) >= MAX_ALBUM_SIZE) {
      throw new AppException(
        ERROR_CODE.ALBUM_TOO_LARGE,
        422,
        `Bitta albomda ${MAX_ALBUM_SIZE} tadan ko'p rasm bo'lmaydi`,
      );
    }
  }

  /**
   * Reconnect catch-up (C6): messages after `afterSeq`, oldest-first, for a conversation member.
   * Reads one row past `size` so `hasMore` is exact on the last page too (§17.5).
   */
  async messagesSince(
    user: AuthenticatedUser,
    conversationId: string,
    afterSeq: number,
    size: number,
  ): Promise<MessagePage> {
    await this.assertMember(conversationId, user.id);
    return trim(await this.chat.listSince(conversationId, afterSeq, size + 1), size);
  }

  /** History for a conversation the caller belongs to (newest-first, `seq`-cursor). */
  async history(
    user: AuthenticatedUser,
    conversationId: string,
    beforeSeq: number | null,
    size: number,
  ): Promise<MessagePage> {
    await this.assertMember(conversationId, user.id);
    return trim(await this.chat.listMessages(conversationId, beforeSeq, size + 1), size);
  }

  /** Advances the caller's read cursor. */
  async markRead(user: AuthenticatedUser, conversationId: string, seq: number): Promise<void> {
    await this.assertMember(conversationId, user.id);
    await this.chat.advanceCursor(conversationId, user.id, 'read', seq);
  }

  /** Advances the caller's delivered cursor. */
  async markDelivered(user: AuthenticatedUser, conversationId: string, seq: number): Promise<void> {
    await this.assertMember(conversationId, user.id);
    await this.chat.advanceCursor(conversationId, user.id, 'delivered', seq);
  }

  /**
   * The caller's conversation list, with each other member's live `online` status — masked by that
   * member's `lastSeenVisibility` (C7). History outlives a disconnect (C9), so being a chat partner
   * is not proof of being a connection: the connected set is loaded and checked per row.
   */
  async listConversations(
    user: AuthenticatedUser,
    page: number,
    size: number,
  ): Promise<Page<ConversationListItem>> {
    const result = await this.chat.listConversations(user.id, page, size);
    const [connected, online] = await Promise.all([
      this.connectionCheck.connectedIds(user.id),
      this.presence.onlineAmong(result.items.map((item) => item.other.id)),
    ]);
    const connectedSet = new Set(connected);
    const items = result.items.map((item): ConversationListItem => {
      const other = applyPresenceVisibility(
        item.other,
        connectedSet.has(item.other.id),
        online.has(item.other.id),
      );
      return { ...item, other };
    });
    return { items, total: result.total };
  }

  /** One conversation-list row for a member — what the client needs when a push is tapped (§18). */
  async conversationItem(
    user: AuthenticatedUser,
    conversationId: string,
  ): Promise<ConversationListItem> {
    const item = await this.chat.findConversationItem(conversationId, user.id);
    if (item === null) {
      throw AppException.notFound(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Suhbat topilmadi');
    }
    const [connected, online] = await Promise.all([
      this.connectionCheck.areConnected(user.id, item.other.id),
      this.presence.isOnline(item.other.id),
    ]);
    return { ...item, other: applyPresenceVisibility(item.other, connected, online) };
  }

  /** Unread totals across all the caller's conversations — the tab badge (§18). */
  unreadSummary(user: AuthenticatedUser): Promise<UnreadSummary> {
    return this.chat.unreadSummary(user.id);
  }

  /**
   * Soft-deletes the caller's own message (§18).
   *
   * A non-member gets 404 rather than 403: telling someone who has no business in this conversation
   * that the id exists turns the endpoint into a probe for other people's message ids. A member who
   * is not the sender gets 403 — they are entitled to know the message exists, just not to delete it.
   */
  async deleteMessage(user: AuthenticatedUser, messageId: string): Promise<Message> {
    const message = await this.chat.findMessage(messageId);
    if (message === null) {
      throw AppException.notFound(ERROR_CODE.MESSAGE_NOT_FOUND, 'Xabar topilmadi');
    }
    const membership = await this.chat.findMembership(message.conversationId, user.id);
    if (membership === null) {
      throw AppException.notFound(ERROR_CODE.MESSAGE_NOT_FOUND, 'Xabar topilmadi');
    }
    if (message.senderId !== user.id) {
      throw AppException.forbidden("Faqat o'z xabaringizni o'chira olasiz");
    }
    if (message.deletedAt !== null) {
      return message; // idempotent — a retried delete is not an error
    }
    return this.chat.softDeleteMessage(messageId);
  }

  /** A message by id, with its attachment — used when a transcode finishes (chat media spec §6.3). */
  findMessageById(messageId: string): Promise<Message | null> {
    return this.chat.findMessage(messageId);
  }

  /** How many messages share an album id — the gateway coalesces pushes with it. */
  countInAlbum(conversationId: string, albumId: string): Promise<number> {
    return this.chat.countInAlbum(conversationId, albumId);
  }

  /** A socket connected — mark the student online. */
  async goOnline(studentId: string): Promise<void> {
    await this.presence.online(studentId);
  }

  /** A socket disconnected — decrement; on true-offline persist and return `lastSeenAt`. */
  async goOffline(studentId: string): Promise<{ offline: boolean; lastSeenAt: Date | null }> {
    const offline = await this.presence.offline(studentId);
    if (!offline) {
      return { offline: false, lastSeenAt: null };
    }
    const lastSeenAt = await this.chat.touchLastSeen(studentId);
    return { offline: true, lastSeenAt };
  }

  /** The other member's id in a conversation the caller belongs to (for broadcasting), or null. */
  otherMemberId(conversationId: string, selfId: string): Promise<string | null> {
    return this.chat.otherMemberId(conversationId, selfId);
  }

  /**
   * Who should be told this student's presence changed: their accepted connections (C7) — not
   * every past chat partner, since a disconnect keeps the history but revokes presence (C9).
   * Empty when the student hid their presence, which suppresses the broadcast entirely.
   */
  async presenceAudience(studentId: string): Promise<string[]> {
    const visibility = await this.chat.lastSeenVisibilityOf(studentId);
    if (visibility === LastSeenVisibility.NOBODY) {
      return [];
    }
    return this.connectionCheck.connectedIds(studentId);
  }

  /** Whether a student currently has an open socket (⇒ deliver over WS, not push). */
  isOnline(studentId: string): Promise<boolean> {
    return this.presence.isOnline(studentId);
  }

  private async assertMember(conversationId: string, studentId: string): Promise<void> {
    const membership = await this.chat.findMembership(conversationId, studentId);
    if (membership === null) {
      throw AppException.notFound(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Suhbat topilmadi');
    }
  }
}

/**
 * Turns a `size + 1` read into an exact page: the extra row is the proof that more exist, and it is
 * dropped from the result. `hasMore` means "more rows past this page in the direction you are
 * paging", so the same rule holds for `before` (scroll-up) and `after` (catch-up) alike (§17.5).
 */
function trim(rows: Message[], size: number): MessagePage {
  return { items: rows.slice(0, size), hasMore: rows.length > size };
}
