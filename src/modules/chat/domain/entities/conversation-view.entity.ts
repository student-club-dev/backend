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
}
