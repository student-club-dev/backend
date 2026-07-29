import { Injectable } from '@nestjs/common';
import {
  Conversation as PrismaConversation,
  MessageType as PrismaMessageType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { LAST_SEEN_VISIBILITY_TO_DOMAIN } from '../../profiles/infrastructure/profile-enums.mapper';
import {
  AppendMessageInput,
  ChatRepository,
  ConversationPage,
  UnreadSummary,
} from '../domain/chat.repository';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { ConversationListItem } from '../domain/entities/conversation-view.entity';
import { Message } from '../domain/entities/message.entity';
import { ChatMapper, ChatSummaryRow } from './chat.mapper';

/** A message is never useful without its attachment — load it everywhere, in one query. */
const MESSAGE_INCLUDE = { attachment: true } as const;

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

/** The counterpart membership row, loaded with just enough of the student to build a summary. */
interface OtherMemberRow {
  lastReadSeq: number;
  lastDeliveredSeq: number;
  student: ChatSummaryRow;
}

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
  async appendMessage(input: AppendMessageInput): Promise<Message> {
    const { conversationId, senderId, clientMsgId, mediaId } = input;
    // Idempotency (C6): a retry with the same clientMsgId returns the already-stored message.
    if (clientMsgId !== null) {
      const prior = await this.prisma.message.findFirst({
        where: { senderId, clientMsgId },
        include: MESSAGE_INCLUDE,
      });
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
        const message = await tx.message.create({
          data: {
            conversationId,
            senderId,
            seq: convo.nextSeq - 1,
            body: input.body,
            clientMsgId,
            type: PrismaMessageType[input.type],
            albumId: input.albumId,
          },
        });
        if (mediaId !== null) {
          // Claim the attachment inside the same transaction: two concurrent sends must not both
          // walk away believing they own it, and the unique `message_id` is what enforces that.
          await tx.mediaAsset.update({ where: { id: mediaId }, data: { messageId: message.id } });
        }
        return tx.message.findUniqueOrThrow({
          where: { id: message.id },
          include: MESSAGE_INCLUDE,
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
        const prior = await this.prisma.message.findFirst({
          where: { senderId, clientMsgId },
          include: MESSAGE_INCLUDE,
        });
        if (prior !== null) {
          return ChatMapper.toMessage(prior);
        }
      }
      throw error;
    }
  }

  countInAlbum(conversationId: string, albumId: string): Promise<number> {
    return this.prisma.message.count({ where: { conversationId, albumId } });
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
      include: MESSAGE_INCLUDE,
    });
    return rows.map(ChatMapper.toMessage);
  }

  async listSince(conversationId: string, afterSeq: number, size: number): Promise<Message[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: size,
      include: MESSAGE_INCLUDE,
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
        // Newest-active first. Postgres sorts NULL first on DESC, which floated conversations that
        // never received a message to the top of the list (§17.7). `createdAt`/`id` are the
        // tiebreaker, not decoration: with NULLS LAST alone every empty conversation compares equal,
        // leaving OFFSET paging free to repeat or drop rows between pages.
        orderBy: [
          { conversation: { lastMessageAt: { sort: 'desc', nulls: 'last' } } },
          { conversation: { createdAt: 'desc' } },
          { conversationId: 'desc' },
        ],
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.conversationMember.count({ where: { studentId } }),
    ]);

    const items = await Promise.all(
      memberships.map((membership) =>
        this.toListItem(
          membership.conversation,
          membership.lastReadSeq,
          membership.conversation.members[0],
          studentId,
        ),
      ),
    );
    return { items, total };
  }

  async findConversationItem(
    conversationId: string,
    studentId: string,
  ): Promise<ConversationListItem | null> {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_studentId: { conversationId, studentId } },
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
    });
    if (membership === null) {
      return null;
    }
    return this.toListItem(
      membership.conversation,
      membership.lastReadSeq,
      membership.conversation.members[0],
      studentId,
    );
  }

  /**
   * Both badge numbers in one round trip. Prisma's `groupBy` cannot express this: the unread
   * threshold is `lastReadSeq`, which varies per membership row, so it has to be a join. Counting
   * per conversation instead — the way `listConversations` does — is one query per row, far too
   * much for a number the app asks for on every foreground.
   */
  async unreadSummary(studentId: string): Promise<UnreadSummary> {
    // `::int` on both aggregates is deliberate: SUM(bigint) is `numeric` and COUNT is `bigint`, which
    // Prisma hands back as Decimal/BigInt — awkward values to carry through the DTO for two badge
    // counters. `${studentId}` is a tagged-template parameter, so it is bound, never interpolated.
    const rows = await this.prisma.$queryRaw<{ total: number; conversations: number }[]>`
      SELECT
        COALESCE(SUM(c.unread), 0)::int             AS total,
        (COUNT(*) FILTER (WHERE c.unread > 0))::int AS conversations
      FROM (
        SELECT COUNT(m.id) AS unread
        FROM conversation_members cm
        LEFT JOIN messages m
          ON m.conversation_id = cm.conversation_id
         AND m.seq > cm.last_read_seq
         AND m.sender_id <> cm.student_id
         AND m.deleted_at IS NULL
        WHERE cm.student_id = ${studentId}
        GROUP BY cm.id
      ) c
    `;
    const row = rows[0];
    return {
      total: row?.total ?? 0,
      conversations: row?.conversations ?? 0,
    };
  }

  async findMessage(messageId: string): Promise<Message | null> {
    const row = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });
    return row === null ? null : ChatMapper.toMessage(row);
  }

  async softDeleteMessage(messageId: string): Promise<Message> {
    const row = await this.prisma.message.update({
      where: { id: messageId },
      // The body really goes — a delete that only hid the text would be a lie to the sender.
      // Evidence for moderation is captured in `reports.content_snapshot` at report time.
      data: { deletedAt: new Date(), body: null },
      include: MESSAGE_INCLUDE,
    });
    return ChatMapper.toMessage(row);
  }

  /** Builds one conversation-list row from an already-loaded membership and its counterpart. */
  private async toListItem(
    conversation: PrismaConversation,
    myReadSeq: number,
    otherMember: OtherMemberRow | undefined,
    studentId: string,
  ): Promise<ConversationListItem> {
    const [lastRow, unreadCount] = await Promise.all([
      this.prisma.message.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { seq: 'desc' },
        include: MESSAGE_INCLUDE,
      }),
      this.prisma.message.count({
        where: {
          conversationId: conversation.id,
          seq: { gt: myReadSeq },
          senderId: { not: studentId },
          // A deleted message must not keep the badge lit: it is invisible, so it can never be read.
          deletedAt: null,
        },
      }),
    ]);
    const otherRow = otherMember?.student;
    return {
      conversation: ChatMapper.toConversation(conversation),
      other: otherRow === undefined ? MISSING_MEMBER : ChatMapper.toSummary(otherRow),
      // The last message is shown even when deleted — the client draws the tombstone.
      lastMessage: lastRow === null ? null : ChatMapper.toMessage(lastRow),
      unreadCount,
      myReadSeq,
      peerReadSeq: otherMember?.lastReadSeq ?? 0,
      peerDeliveredSeq: otherMember?.lastDeliveredSeq ?? 0,
    };
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
