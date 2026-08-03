import { Inject, Injectable } from '@nestjs/common';
import { directKeyFor } from '../../../common/chat/direct-key';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  PRESENCE_REPOSITORY,
  PresenceRepository,
} from '../../../infrastructure/presence/presence.repository';
import {
  CONNECTION_CHECK,
  ConnectionCheckRepository,
} from '../../../infrastructure/social-graph/connection-check.repository';
import { Call, durationMsOf } from '../../calls/domain/entities/call.entity';
import { applyPresenceVisibility } from '../../connections/domain/presence-visibility';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import {
  MEDIA_ASSET_REPOSITORY,
  MediaAssetRepository,
} from '../../media/domain/media-asset.repository';
import { MediaKind, MediaStatus } from '../../media/domain/enums/media-kind.enum';
import { isAllowedGifUrl } from '../../gifs/domain/gif-source';
import { isAllowedStickerUrl } from '../../stickers/domain/sticker-source';
import {
  BulkDeleteResult,
  CHAT_REPOSITORY,
  ChatRepository,
  ExternalStickerRow,
  MessageViewer,
  PushSender,
  ReplyColumns,
  SkippedMessage,
  UnreadSummary,
} from '../domain/chat.repository';
import { DeleteScope } from '../domain/enums/delete-scope.enum';
import { MessageType } from '../domain/enums/message-type.enum';
import {
  STICKER_DIRECTORY,
  StickerDirectoryRepository,
} from '../domain/sticker-directory.repository';
import {
  assertQuoteMatches,
  MAX_ALBUM_SIZE,
  MAX_REPLY_PREVIEW,
  normalizeBody,
  carriesAttachment,
  kindFitsType,
} from '../domain/message-composition';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { ConversationListItem } from '../domain/entities/conversation-view.entity';
import { Message } from '../domain/entities/message.entity';
import { ExternalGifRef, MessagePage, Page, SendMessageInput } from './chat.io';

/** §A2 caps one batch at 100 ids. */
const MAX_DELETE_IDS = 100;

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
    const directKey = directKeyFor(user.id, otherId);
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
    // Server-authored types. SYSTEM and CALL rows are written by the server itself — accepting one
    // from a client would let anyone forge a system notice or a call that never happened.
    if (type === MessageType.SYSTEM || type === MessageType.CALL) {
      throw AppException.validation({ type: 'Bu turdagi xabarni yuborib bo‘lmaydi' });
    }

    const body = normalizeBody(type, input.body);

    await this.assertMember(input.conversationId, user.id);
    const otherId = await this.chat.otherMemberId(input.conversationId, user.id);
    if (otherId !== null && !(await this.connectionCheck.areConnected(user.id, otherId))) {
      throw new AppException(ERROR_CODE.NOT_CONNECTED, 403, "Avval bog'lanish kerak");
    }

    const reply = await this.resolveReply(input);
    const mediaId = await this.resolveAttachment(user, type, input);
    const sticker = await this.resolveSticker(type, input);
    await this.assertAlbumHasRoom(input.conversationId, input.albumId ?? null);

    return this.chat.appendMessage({
      reply,
      conversationId: input.conversationId,
      senderId: user.id,
      type,
      body,
      clientMsgId: input.clientMsgId ?? null,
      mediaId,
      stickerId: sticker.stickerId,
      externalSticker: sticker.externalSticker,
      albumId: input.albumId ?? null,
    });
  }

  /**
   * Write the chat record for a finished call. Called from the CallEndedBus subscription, not by a
   * client — chat owns `seq`, so the row must go through `appendMessage` (which increments
   * `Conversation.nextSeq` inside a transaction) rather than a fresh insert.
   *
   * The call details are snapshotted onto the message rather than joined from `calls`: if either
   * participant's account is deleted the call row cascades away, and a join would leave the client
   * rendering an empty bubble. Same reasoning as the `replyTo*` and `sticker*` columns.
   *
   * ⚠️ The read cursor is deliberately NOT advanced here. "Only a MISSED call is unread" (§14.2) is
   * enforced in the repository's unread predicate instead: the cursor is shared by every message in
   * the conversation, and this row carries the highest `seq`, so moving it to `message.seq` marked
   * every text the callee had not opened as read as a side effect of answering the phone.
   */
  async appendCallMessage(call: Call): Promise<Message> {
    return this.chat.appendMessage({
      conversationId: call.conversationId,
      senderId: call.callerId,
      type: MessageType.CALL,
      body: null,
      clientMsgId: null,
      mediaId: null,
      stickerId: null,
      externalSticker: null,
      albumId: null,
      reply: null,
      callId: call.id,
      callMedia: call.media,
      callStatus: call.status,
      callDuration: durationMsOf(call),
      callEndReason: call.endReason ?? undefined,
    });
  }

  /**
   * Validates a reply target and freezes the snapshot stored on the new message (§C1). The
   * same-conversation check is what stops the preview leaking a stranger's text into this chat.
   */
  private async resolveReply(input: SendMessageInput): Promise<ReplyColumns | null> {
    const targetId = input.replyToMessageId ?? null;
    const quote = input.quote ?? null;

    if (targetId === null) {
      if (quote !== null) {
        throw new AppException(
          ERROR_CODE.QUOTE_WITHOUT_REPLY,
          422,
          'Sitata uchun javob beriladigan xabar kerak',
        );
      }
      return null;
    }

    const target = await this.chat.findMessage(targetId);
    if (target === null || target.conversationId !== input.conversationId) {
      throw new AppException(
        ERROR_CODE.REPLY_TARGET_NOT_FOUND,
        422,
        'Javob beriladigan xabar topilmadi',
      );
    }
    if (target.deletedAt !== null) {
      throw new AppException(
        ERROR_CODE.REPLY_TARGET_DELETED,
        422,
        "O'chirilgan xabarga javob berib bo'lmaydi",
      );
    }
    if (quote !== null) {
      assertQuoteMatches(target.body, quote.text, quote.offset);
    }

    return {
      replyToMessageId: target.id,
      replyToSenderId: target.senderId,
      replyToSenderName: await this.chat.displayNameOf(target.senderId),
      replyToSeq: target.seq,
      replyToType: target.type,
      replyToPreview: target.body === null ? null : target.body.slice(0, MAX_REPLY_PREVIEW),
      quoteText: quote?.text ?? null,
      quoteOffset: quote?.offset ?? null,
    };
  }

  /**
   * Resolves the sticker on a `STICKER` message from whichever of the two sources named it, and
   * rejects any other type that names one at all.
   *
   * The two sources cannot be merged: `stickerId` points at a row in our catalogue and is checked by
   * looking it up, while `sticker` is a provider object that arrives from the client and is checked
   * against the host allowlist. Sending both is refused rather than picking a winner — the client
   * that did it has a bug, and silently dropping half of what it sent hides that.
   */
  private async resolveSticker(
    type: MessageType,
    input: SendMessageInput,
  ): Promise<{ stickerId: string | null; externalSticker: ExternalStickerRow | null }> {
    const stickerId = input.stickerId ?? null;
    const external = input.sticker ?? null;

    if (type !== MessageType.STICKER) {
      return { stickerId: null, externalSticker: null };
    }
    if (stickerId !== null && external !== null) {
      throw new AppException(
        ERROR_CODE.STICKER_SOURCE_AMBIGUOUS,
        422,
        'stickerId yoki sticker — ikkalasi emas',
      );
    }
    if (external !== null) {
      // Re-checked here, not just in search: the client hands this object back to us, so trusting it
      // would turn the field into an open redirect to any host an attacker chooses.
      if (!isAllowedStickerUrl(external.url) || !isAllowedStickerUrl(external.thumbUrl)) {
        throw new AppException(
          ERROR_CODE.STICKER_URL_NOT_ALLOWED,
          422,
          'Bu havoladan stiker yuborib bo‘lmaydi',
        );
      }
      return {
        stickerId: null,
        externalSticker: {
          provider: external.provider,
          externalId: external.externalId,
          url: external.url,
          thumbUrl: external.thumbUrl,
          width: external.width,
          height: external.height,
        },
      };
    }
    if (stickerId === null) {
      throw AppException.validation({ stickerId: 'Stiker tanlang' });
    }
    if ((await this.stickers.findById(stickerId)) === null) {
      throw new AppException(ERROR_CODE.STICKER_NOT_FOUND, 422, 'Stiker topilmadi');
    }
    return { stickerId, externalSticker: null };
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
    if (!carriesAttachment(type)) {
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
    if (!kindFitsType(type, asset.kind)) {
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
      // Video-only fields, and this is somebody else's already-encoded GIF: nothing to choose and
      // nothing to transcode.
      quality: null,
      variants: null,
      transcript: null,
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
    const membership = await this.assertMember(conversationId, user.id);
    return trim(
      await this.chat.listSince(conversationId, viewerOf(membership), afterSeq, size + 1),
      size,
    );
  }

  /** History for a conversation the caller belongs to (newest-first, `seq`-cursor). */
  async history(
    user: AuthenticatedUser,
    conversationId: string,
    beforeSeq: number | null,
    size: number,
  ): Promise<MessagePage> {
    const membership = await this.assertMember(conversationId, user.id);
    return trim(
      await this.chat.listMessages(conversationId, viewerOf(membership), beforeSeq, size + 1),
      size,
    );
  }

  /** The window around a message (§C3) — where a tapped quote jumps to. */
  async historyAround(
    user: AuthenticatedUser,
    conversationId: string,
    seq: number,
    size: number,
  ): Promise<MessagePage> {
    const membership = await this.assertMember(conversationId, user.id);
    const page = await this.chat.listAround(conversationId, viewerOf(membership), seq, size);
    return { items: page.items, hasMore: page.hasMore };
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

  /**
   * Deletes many messages at once (§A2): one transaction, one recount, one WS event.
   *
   * `EVERYONE` may only touch your own messages; anyone else's come back in `skipped` rather than
   * failing the batch. `ME` may touch any message in the conversation — it mutates no row.
   */
  async deleteMessages(
    user: AuthenticatedUser,
    ids: string[],
    scope: DeleteScope,
  ): Promise<BulkDeleteResult> {
    if (ids.length > MAX_DELETE_IDS) {
      throw new AppException(
        ERROR_CODE.TOO_MANY_IDS,
        422,
        `Bir vaqtda ${MAX_DELETE_IDS} tadan ko'p xabarni o'chirib bo'lmaydi`,
      );
    }
    const unique = [...new Set(ids)];
    const found = await this.chat.findMessagesByIds(unique);

    if (new Set(found.map((message) => message.conversationId)).size > 1) {
      throw new AppException(
        ERROR_CODE.MIXED_CONVERSATIONS,
        422,
        'Xabarlar bitta suhbatdan bo‘lishi kerak',
      );
    }
    const conversationId = found[0]?.conversationId;
    if (conversationId === undefined) {
      // Nothing resolved, so there is no conversation to report counters for. Undefined in the spec.
      throw AppException.notFound(ERROR_CODE.MESSAGE_NOT_FOUND, 'Xabar topilmadi');
    }

    const membership = await this.chat.findMembership(conversationId, user.id);
    if (membership === null) {
      // 403 here but 404 in `deleteMessage` — deliberate: reaching this line means the caller
      // already holds a real message id, so the existence is out either way.
      throw new AppException(ERROR_CODE.NOT_MEMBER, 403, 'Siz bu suhbat a’zosi emassiz');
    }

    const byId = new Map(found.map((message) => [message.id, message]));
    const deletable: string[] = [];
    const skipped: SkippedMessage[] = [];
    for (const id of unique) {
      const message = byId.get(id);
      if (message === undefined) {
        skipped.push({ id, reason: 'NOT_FOUND' });
      } else if (scope === DeleteScope.EVERYONE && message.senderId !== user.id) {
        skipped.push({ id, reason: 'NOT_OWN' });
      } else {
        deletable.push(id);
      }
    }

    if (deletable.length === 0) {
      // Still a 200 — "nothing could be deleted" is a result, not a failure (§A2).
      const item = await this.chat.findConversationItem(conversationId, user.id);
      return {
        conversationId,
        deleted: [],
        deletedSeqs: [],
        skipped,
        unreadCount: item?.unreadCount ?? 0,
        lastMessage: item?.lastMessage ?? null,
      };
    }

    const outcome = await this.chat.deleteMessages(
      conversationId,
      viewerOf(membership),
      deletable,
      scope,
    );
    return {
      conversationId,
      deleted: deletable,
      // Same list, same order: the WS event ships these as parallel arrays.
      deletedSeqs: deletable.map((id) => byId.get(id)!.seq),
      skipped,
      unreadCount: outcome.unreadCount,
      lastMessage: outcome.lastMessage,
    };
  }

  /**
   * The single-message delete, now scope-aware (§A2). Omitting `scope` runs the pre-batch path
   * unchanged; `ME` returns the message untouched, because hiding it mutates no row.
   */
  async deleteSingleMessage(
    user: AuthenticatedUser,
    messageId: string,
    scope: DeleteScope,
  ): Promise<{ message: Message; result: BulkDeleteResult | null }> {
    if (scope === DeleteScope.EVERYONE) {
      return { message: await this.deleteMessage(user, messageId), result: null };
    }
    const result = await this.deleteMessages(user, [messageId], DeleteScope.ME);
    const message = await this.chat.findMessage(messageId);
    if (message === null) {
      throw AppException.notFound(ERROR_CODE.MESSAGE_NOT_FOUND, 'Xabar topilmadi');
    }
    return { message, result };
  }

  /**
   * Clears the conversation history (§B1). Nothing is deleted — a per-member watermark rises, so the
   * other member's cursors keep working and the conversation stays in the list.
   */
  async clearHistory(
    user: AuthenticatedUser,
    conversationId: string,
    scope: DeleteScope,
  ): Promise<{ conversationId: string; clearedBeforeSeq: number; unreadCount: number }> {
    await this.assertMember(conversationId, user.id);
    const clearedBeforeSeq = await this.chat.clearHistory(conversationId, user.id, scope);
    return { conversationId, clearedBeforeSeq, unreadCount: 0 };
  }

  /**
   * Removes the conversation from the caller's list, history and all (§B2). It returns under the
   * same id on the next message — `POST /v1/conversations` keeps resolving here.
   */
  async deleteConversation(
    user: AuthenticatedUser,
    conversationId: string,
    scope: DeleteScope,
  ): Promise<{ conversationId: string; clearedBeforeSeq: number }> {
    await this.assertMember(conversationId, user.id);
    const clearedBeforeSeq = await this.chat.deleteConversation(conversationId, user.id, scope);
    return { conversationId, clearedBeforeSeq };
  }

  /** Physically drops messages every member has cleared past — the weekly sweep's use-case (§B1). */
  purgeClearedMessages(): Promise<number> {
    return this.chat.purgeClearedMessages();
  }

  /** A message by id, with its attachment — used when a transcode finishes (chat media spec §6.3). */
  findMessageById(messageId: string): Promise<Message | null> {
    return this.chat.findMessage(messageId);
  }

  /** How many messages share an album id — the gateway coalesces pushes with it. */
  countInAlbum(conversationId: string, albumId: string): Promise<number> {
    return this.chat.countInAlbum(conversationId, albumId);
  }

  /** Name + avatar for the title of an offline push. */
  pushSenderOf(studentId: string): Promise<PushSender | null> {
    return this.chat.pushSenderOf(studentId);
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

  /**
   * Total unread messages for a student — the number an iOS push puts on the app icon. Same figure
   * as `GET /v1/conversations/unread-count`; iOS never counts it itself, so whatever the server
   * sends is what the user sees.
   */
  async unreadTotalFor(studentId: string): Promise<number> {
    const { total } = await this.chat.unreadSummary(studentId);
    return total;
  }

  private async assertMember(
    conversationId: string,
    studentId: string,
  ): Promise<ConversationMember> {
    const membership = await this.chat.findMembership(conversationId, studentId);
    if (membership === null) {
      throw AppException.notFound(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Suhbat topilmadi');
    }
    return membership;
  }
}

/** A membership row is all a read needs to know about who is looking (§A4.3). */
function viewerOf(membership: ConversationMember): MessageViewer {
  return {
    studentId: membership.studentId,
    clearedBeforeSeq: membership.clearedBeforeSeq,
    lastReadSeq: membership.lastReadSeq,
  };
}

/**
 * Turns a `size + 1` read into an exact page: the extra row is the proof that more exist, and it is
 * dropped from the result. `hasMore` means "more rows past this page in the direction you are
 * paging", so the same rule holds for `before` (scroll-up) and `after` (catch-up) alike (§17.5).
 */
function trim(rows: Message[], size: number): MessagePage {
  return { items: rows.slice(0, size), hasMore: rows.length > size };
}
