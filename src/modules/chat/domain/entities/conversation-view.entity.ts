import { StudentSummary } from '../../../connections/domain/entities/student-summary.entity';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';

/** A conversation as shown in the caller's list: the other member, last message and unread count. */
export interface ConversationListItem {
  conversation: Conversation;
  /** The other member (1:1). */
  other: StudentSummary;
  lastMessage: Message | null;
  unreadCount: number;
  /** How far the caller has read — the persisted counterpart of `unreadCount`. */
  myReadSeq: number;
  /** How far the other member has read the caller's messages — drives ✓✓ after a restart (C5). */
  peerReadSeq: number;
  /** How far the other member's device has received — drives ✓. */
  peerDeliveredSeq: number;
}
