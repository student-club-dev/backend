import { Injectable } from '@nestjs/common';
import { MessageType as PrismaMessageType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { LAST_SEEN_VISIBILITY_TO_DOMAIN } from '../../profiles/infrastructure/profile-enums.mapper';
import { ChatRepository, ConversationPage } from '../domain/chat.repository';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { ConversationListItem } from '../domain/entities/conversation-view.entity';
import { Message } from '../domain/entities/message.entity';
import { ChatMapper, ChatSummaryRow } from './chat.mapper';

const SUMMARY_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  universityId: true,
  gender: true,
  courseYear: true,
  lastSeenAt: true,
  lastSeenVisibility: true,
} as const;

/** The other member has left the conversation (or the row is corrupt) — render an empty person. */
const MISSING_MEMBER: ConversationListItem['other'] = {
  id: '',
  username: null,
  fullName: null,
  avatarUrl: null,
  universityId: null,
  gender: null,
  courseYear: null,
  online: false,
  lastSeenAt: null,
  lastSeenVisibility: LastSeenVisibility.NOBODY,
};

/** Prisma implementation of the chat repository port. Prisma is used ONLY here. */
@Injectable()
export class ChatPrismaRepository implements ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDirect(directKey: string): Promise<Conversation | null> {
    const row = await this.prisma.conversation.findUnique({ where: { directKey } });
    return row === null ? null : ChatMapper.toConversation(row);
  }

  async createDirect(directKey: string, memberA: string, memberB: string): Promise<Conversation> {
    const row = await this.prisma.conversation.create({
      data: {
        directKey,
        members: { create: [{ studentId: memberA }, { studentId: memberB }] },
      },
    });
    return ChatMapper.toConversation(row);
  }

  async findById(id: string): Promise<Conversation | null> {
    const row = await this.prisma.conversation.findUnique({ where: { id } });
    return row === null ? null : ChatMapper.toConversation(row);
  }

  async findMembership(
    conversationId: string,
    studentId: string,
  ): Promise<ConversationMember | null> {
    const row = await this.prisma.conversationMember.findUnique({
      where: { conversationId_studentId: { conversationId, studentId } },
    });
    return row === null ? null : ChatMapper.toMember(row);
  }

  async otherMemberId(conversationId: string, selfId: string): Promise<string | null> {
    const row = await this.prisma.conversationMember.findFirst({
      where: { conversationId, studentId: { not: selfId } },
      select: { studentId: true },
    });
    return row === null ? null : row.studentId;
  }

  /**
   * Persists a message, assigning the next per-conversation `seq` atomically: post-incrementing
   * `nextSeq` (so the returned value is the new one) means this message takes `nextSeq - 1` (C4).
   */
  async appendMessage(
    conversationId: string,
    senderId: string,
    body: string,
    clientMsgId: string | null,
  ): Promise<Message> {
    // Idempotency (C6): a retry with the same clientMsgId returns the already-stored message.
    if (clientMsgId !== null) {
      const prior = await this.prisma.message.findFirst({ where: { senderId, clientMsgId } });
      if (prior !== null) {
        return ChatMapper.toMessage(prior);
      }
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const convo = await tx.conversation.update({
          where: { id: conversationId },
          data: { nextSeq: { increment: 1 }, lastMessageAt: new Date() },
          select: { nextSeq: true },
        });
        return tx.message.create({
          data: {
            conversationId,
            senderId,
            seq: convo.nextSeq - 1,
            body,
            clientMsgId,
            type: PrismaMessageType.TEXT,
          },
        });
      });
      return ChatMapper.toMessage(row);
    } catch (error) {
      // A concurrent send with the same clientMsgId won the unique race — return the stored one.
      if (
        clientMsgId !== null &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const prior = await this.prisma.message.findFirst({ where: { senderId, clientMsgId } });
        if (prior !== null) {
          return ChatMapper.toMessage(prior);
        }
      }
      throw error;
    }
  }

  async listMessages(
    conversationId: string,
    beforeSeq: number | null,
    size: number,
  ): Promise<Message[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...(beforeSeq === null ? {} : { seq: { lt: beforeSeq } }) },
      orderBy: { seq: 'desc' },
      take: size,
    });
    return rows.map(ChatMapper.toMessage);
  }

  async listSince(conversationId: string, afterSeq: number, size: number): Promise<Message[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: size,
    });
    return rows.map(ChatMapper.toMessage);
  }

  async listConversations(
    studentId: string,
    page: number,
    size: number,
  ): Promise<ConversationPage> {
    const [memberships, total] = await this.prisma.$transaction([
      this.prisma.conversationMember.findMany({
        where: { studentId },
        include: {
          conversation: {
            include: {
              members: {
                where: { studentId: { not: studentId } },
                include: { student: { select: SUMMARY_SELECT } },
              },
            },
          },
        },
        orderBy: { conversation: { lastMessageAt: 'desc' } },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.conversationMember.count({ where: { studentId } }),
    ]);

    const items = await Promise.all(
      memberships.map(async (membership): Promise<ConversationListItem> => {
        const otherMember = membership.conversation.members[0];
        const otherRow = otherMember?.student as ChatSummaryRow | undefined;
        const [lastRow, unreadCount] = await Promise.all([
          this.prisma.message.findFirst({
            where: { conversationId: membership.conversationId },
            orderBy: { seq: 'desc' },
          }),
          this.prisma.message.count({
            where: {
              conversationId: membership.conversationId,
              seq: { gt: membership.lastReadSeq },
              senderId: { not: studentId },
            },
          }),
        ]);
        return {
          conversation: ChatMapper.toConversation(membership.conversation),
          other: otherRow === undefined ? MISSING_MEMBER : ChatMapper.toSummary(otherRow),
          lastMessage: lastRow === null ? null : ChatMapper.toMessage(lastRow),
          unreadCount,
          myReadSeq: membership.lastReadSeq,
          peerReadSeq: otherMember?.lastReadSeq ?? 0,
          peerDeliveredSeq: otherMember?.lastDeliveredSeq ?? 0,
        };
      }),
    );
    return { items, total };
  }

  async advanceCursor(
    conversationId: string,
    studentId: string,
    cursor: 'read' | 'delivered',
    seq: number,
  ): Promise<void> {
    if (cursor === 'read') {
      await this.prisma.conversationMember.updateMany({
        where: { conversationId, studentId, lastReadSeq: { lt: seq } },
        data: { lastReadSeq: seq },
      });
    } else {
      await this.prisma.conversationMember.updateMany({
        where: { conversationId, studentId, lastDeliveredSeq: { lt: seq } },
        data: { lastDeliveredSeq: seq },
      });
    }
  }

  async touchLastSeen(studentId: string): Promise<Date> {
    const now = new Date();
    await this.prisma.student.update({ where: { id: studentId }, data: { lastSeenAt: now } });
    return now;
  }

  async lastSeenVisibilityOf(studentId: string): Promise<LastSeenVisibility> {
    const row = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { lastSeenVisibility: true },
    });
    return row === null
      ? LastSeenVisibility.NOBODY
      : LAST_SEEN_VISIBILITY_TO_DOMAIN[row.lastSeenVisibility];
  }
}
