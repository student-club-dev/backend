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

  /** Persists a message, atomically assigning the next per-conversation `seq` + `lastMessageAt`. */
  appendMessage(conversationId: string, senderId: string, body: string): Promise<Message>;

  /** History strictly before `beforeSeq` (null = latest), newest-first, capped at `size`. */
  listMessages(conversationId: string, beforeSeq: number | null, size: number): Promise<Message[]>;

  /** The caller's conversations (other member + last message + unread), by `lastMessageAt` desc. */
  listConversations(studentId: string, page: number, size: number): Promise<ConversationPage>;

  /** Advances a member's `read`/`delivered` cursor to at least `seq` (never backwards). */
  advanceCursor(
    conversationId: string,
    studentId: string,
    cursor: 'read' | 'delivered',
    seq: number,
  ): Promise<void>;

  /** Persists `students.lastSeenAt = now` (on true-offline). Returns the timestamp written. */
  touchLastSeen(studentId: string): Promise<Date>;

  /** Distinct other-member ids across the student's conversations (for presence fan-out). */
  partnerIds(studentId: string): Promise<string[]>;
}
