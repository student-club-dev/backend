import {
  Conversation as PrismaConversation,
  ConversationMember as PrismaMember,
  Message as PrismaMessage,
  Student,
} from '@prisma/client';
import { StudentSummary } from '../../connections/domain/entities/student-summary.entity';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { Message } from '../domain/entities/message.entity';
import { ConversationType } from '../domain/enums/conversation-type.enum';
import { MessageType } from '../domain/enums/message-type.enum';

/** The student columns for a chat StudentSummary (includes `lastSeenAt`, unlike the connections one). */
export type ChatSummaryRow = Pick<
  Student,
  'id' | 'username' | 'firstName' | 'lastName' | 'avatarUrl' | 'lastSeenAt'
>;

/** Maps Prisma chat rows to the domain. Prisma enums carry the same wire values as ours. */
export class ChatMapper {
  static toConversation(row: PrismaConversation): Conversation {
    return {
      id: row.id,
      type: ConversationType[row.type],
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt,
    };
  }

  static toMessage(row: PrismaMessage): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      seq: row.seq,
      type: MessageType[row.type],
      body: row.body,
      createdAt: row.createdAt,
    };
  }

  static toMember(row: PrismaMember): ConversationMember {
    return {
      conversationId: row.conversationId,
      studentId: row.studentId,
      lastReadSeq: row.lastReadSeq,
      lastDeliveredSeq: row.lastDeliveredSeq,
    };
  }

  /** `online` is left `false` here (live status comes from presence); `lastSeenAt` is from the DB. */
  static toSummary(row: ChatSummaryRow): StudentSummary {
    const fullName = [row.firstName, row.lastName].filter((part) => part).join(' ') || null;
    return {
      id: row.id,
      username: row.username,
      fullName,
      avatarUrl: row.avatarUrl,
      online: false,
      lastSeenAt: row.lastSeenAt,
    };
  }
}
