import { CallEndReason } from '../../calls/domain/enums/call-end-reason.enum';
import { CallMedia } from '../../calls/domain/enums/call-media.enum';
import { CallStatus } from '../../calls/domain/enums/call-status.enum';
import { MediaProvider } from '../../media/domain/enums/media-kind.enum';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { DeleteScope } from './enums/delete-scope.enum';
import { MessageType } from './enums/message-type.enum';
import { Conversation, ConversationMember } from './entities/conversation.entity';
import { ConversationListItem } from './entities/conversation-view.entity';
import { Message } from './entities/message.entity';

/** Injection token for the chat repository port (bound to the Prisma impl in the module). */
export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');

/** A page of conversation-list items plus the unpaginated total. */
export interface ConversationPage {
  items: ConversationListItem[];
  total: number;
}

/** Tab-badge counters: unread messages, and how many conversations hold at least one (§18). */
export interface UnreadSummary {
  total: number;
  conversations: number;
}

/** Why one id in a bulk delete was left alone (§A2). */
export interface SkippedMessage {
  id: string;
  reason: 'NOT_OWN' | 'NOT_FOUND' | 'NOT_MEMBER';
}

/** The outcome of one bulk delete, with the caller's counters recomputed in the same transaction. */
export interface BulkDeleteResult {
  conversationId: string;
  deleted: string[];
  deletedSeqs: number[];
  skipped: SkippedMessage[];
  unreadCount: number;
  lastMessage: Message | null;
}

/**
 * Who an offline push says it is from. `name` follows the same full-name-else-username-else-null
 * rule as `displayNameOf`, so the person named on the lock screen is the one named in the
 * conversation list. `avatarUrl` is already absolute — the storage adapter stores it that way.
 */
export interface PushSender {
  name: string | null;
  avatarUrl: string | null;
}

/** Who is reading — every history query is filtered through this (§A4.3). */
export interface MessageViewer {
  studentId: string;
  clearedBeforeSeq: number;
  lastReadSeq: number;
}

/** The columns a bulk delete has to authorise against, without loading whole messages. */
export interface MessageAuthRow {
  id: string;
  conversationId: string;
  senderId: string;
  seq: number;
}

/** Everything a new message row needs. `mediaId` is linked to the message in the same transaction. */
export interface AppendMessageInput {
  conversationId: string;
  senderId: string;
  type: MessageType;
  body: string | null;
  clientMsgId: string | null;
  mediaId: string | null;
  /** A sticker from our seeded catalogue. Never set together with `externalSticker`. */
  stickerId: string | null;
  /** A sticker from provider search, stored on the row — there is no catalogue row to point at. */
  externalSticker: ExternalStickerRow | null;
  albumId: string | null;
  /** Album size, first message only; null otherwise. */
  albumSize: number | null;
  /** The frozen reply snapshot, or null when this message is not a reply (§C1). */
  reply: ReplyColumns | null;
  /** The call snapshot columns, set only when writing a `CALL` message (`appendCallMessage`). */
  callId?: string;
  callMedia?: CallMedia;
  callStatus?: CallStatus;
  callDuration?: number;
  callEndReason?: CallEndReason;
}

/** The reply/quote columns written on a new message (§C1). */
export interface ReplyColumns {
  replyToMessageId: string;
  replyToSenderId: string;
  replyToSenderName: string | null;
  replyToSeq: number;
  replyToType: MessageType;
  replyToPreview: string | null;
  quoteText: string | null;
  quoteOffset: number | null;
}

/** The provider-sticker columns denormalised onto a message. */
export interface ExternalStickerRow {
  provider: MediaProvider;
  externalId: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

/**
 * Chat data-access port. The application layer depends on this interface only; the Prisma
 * implementation lives in infrastructure.
 */
export interface ChatRepository {
  /** The DIRECT conversation for the pair (by `directKey`), or `null`. */
  findDirect(directKey: string): Promise<Conversation | null>;

  /** Creates a DIRECT conversation with both members. */
  createDirect(directKey: string, memberA: string, memberB: string): Promise<Conversation>;

  findById(id: string): Promise<Conversation | null>;

  /** The caller's membership row for a conversation, or `null` (⇒ not a member). */
  findMembership(conversationId: string, studentId: string): Promise<ConversationMember | null>;

  /** The other member's id in a DIRECT conversation, or `null`. */
  otherMemberId(conversationId: string, selfId: string): Promise<string | null>;

  /**
   * Persists a message, atomically assigning the next per-conversation `seq` + `lastMessageAt`.
   * When `clientMsgId` is set, a retry with the same id returns the already-stored message instead
   * of creating a duplicate (C6 idempotency), enforced by a `(senderId, clientMsgId)` unique index.
   */
  appendMessage(input: AppendMessageInput): Promise<Message>;

  /** How many messages already share this album id — the 10-image ceiling (chat media spec §3). */
  countInAlbum(conversationId: string, albumId: string): Promise<number>;

  /**
   * History strictly before `beforeSeq` (null = latest), newest-first, capped at `size`. Callers
   * pass `size + 1` and drop the extra row to compute `hasMore` exactly (§17.5). Hidden and cleared
   * rows are excluded in the `WHERE`, never after `take`, or the page comes back short (§A4.3).
   */
  listMessages(
    conversationId: string,
    viewer: MessageViewer,
    beforeSeq: number | null,
    size: number,
  ): Promise<Message[]>;

  /**
   * Messages strictly after `afterSeq`, oldest-first — for reconnect catch-up (C6). Same `size + 1`
   * convention and the same viewer filtering as `listMessages`.
   */
  listSince(
    conversationId: string,
    viewer: MessageViewer,
    afterSeq: number,
    size: number,
  ): Promise<Message[]>;

  /** The caller's conversations (other member + last message + unread), by `lastMessageAt` desc. */
  listConversations(studentId: string, page: number, size: number): Promise<ConversationPage>;

  /** One conversation-list row for a member — the same shape a list page returns (§18). */
  findConversationItem(
    conversationId: string,
    studentId: string,
  ): Promise<ConversationListItem | null>;

  /** Unread totals across every conversation the student belongs to — for the tab badge (§18). */
  unreadSummary(studentId: string): Promise<UnreadSummary>;

  /** A message with its conversation id — for the ownership checks a delete has to make. */
  findMessage(messageId: string): Promise<Message | null>;

  /**
   * Blanks the body and stamps `deletedAt` (§18). The row is kept: `seq` is the ordering axis every
   * cursor walks, so removing it would tear holes in history and in the unread arithmetic.
   * Idempotent — deleting an already-deleted message changes nothing.
   */
  softDeleteMessage(messageId: string): Promise<Message>;

  /** Every message named by `ids`, with just the columns a bulk delete authorises against (§A2). */
  findMessagesByIds(ids: string[]): Promise<MessageAuthRow[]>;

  /**
   * Applies one delete to many messages in a single transaction (§A4.4), then recomputes the
   * caller's unread count and newest visible message once.
   */
  deleteMessages(
    conversationId: string,
    viewer: MessageViewer,
    ids: string[],
    scope: DeleteScope,
  ): Promise<{ unreadCount: number; lastMessage: Message | null }>;

  /**
   * Raises the clear watermark to the conversation's highest `seq` — for one member (`ME`) or both
   * (`EVERYONE`) — and parks their read cursor there. Returns the watermark written (§B1).
   */
  clearHistory(conversationId: string, studentId: string, scope: DeleteScope): Promise<number>;

  /**
   * Clears the history and drops the conversation from the list (§B2). The membership row survives
   * with `hidden = true` — deleting it would lose the read cursors and fork the history in two.
   */
  deleteConversation(
    conversationId: string,
    studentId: string,
    scope: DeleteScope,
  ): Promise<number>;

  /**
   * Physically removes messages every member of their conversation has cleared past (§B1). Safe
   * because it goes by the lowest watermark: no live cursor is left pointing into a hole.
   */
  purgeClearedMessages(): Promise<number>;

  /** Advances a member's `read`/`delivered` cursor to at least `seq` (never backwards). */
  advanceCursor(
    conversationId: string,
    studentId: string,
    cursor: 'read' | 'delivered',
    seq: number,
  ): Promise<void>;

  /** Persists `students.lastSeenAt = now` (on true-offline). Returns the timestamp written. */
  touchLastSeen(studentId: string): Promise<Date>;

  /** The student's own presence-privacy setting — decides whether to emit `presence:update` at all. */
  lastSeenVisibilityOf(studentId: string): Promise<LastSeenVisibility>;

  /** A student's display name for a reply snapshot — full name, else username, else null (§C2). */
  displayNameOf(studentId: string): Promise<string | null>;

  /** Name + avatar for the title of an offline push. Null when the student row is gone. */
  pushSenderOf(studentId: string): Promise<PushSender | null>;

  /** A window of `size` messages centred on `seq` (§C3). `hasMore` ⇒ older messages exist below. */
  listAround(
    conversationId: string,
    viewer: MessageViewer,
    seq: number,
    size: number,
  ): Promise<{ items: Message[]; hasMore: boolean }>;
}
