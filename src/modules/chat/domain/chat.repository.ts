import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
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
  appendMessage(
    conversationId: string,
    senderId: string,
    body: string,
    clientMsgId: string | null,
  ): Promise<Message>;

  /**
   * History strictly before `beforeSeq` (null = latest), newest-first, capped at `size`. Callers
   * pass `size + 1` and drop the extra row to compute `hasMore` exactly (§17.5).
   */
  listMessages(conversationId: string, beforeSeq: number | null, size: number): Promise<Message[]>;

  /**
   * Messages strictly after `afterSeq`, oldest-first — for reconnect catch-up (C6). Same `size + 1`
   * convention as `listMessages`.
   */
  listSince(conversationId: string, afterSeq: number, size: number): Promise<Message[]>;

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
}
