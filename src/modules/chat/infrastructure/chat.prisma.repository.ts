import { Injectable } from '@nestjs/common';
import {
  Conversation as PrismaConversation,
  MessageType as PrismaMessageType,
  Prisma,
} from '@prisma/client';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { PhoneVisibility } from '../../profiles/domain/enums/phone-visibility.enum';
import { LAST_SEEN_VISIBILITY_TO_DOMAIN } from '../../profiles/infrastructure/profile-enums.mapper';
import {
  AppendMessageInput,
  ChatRepository,
  ConversationPage,
  MessageAuthRow,
  MessageViewer,
  UnreadSummary,
} from '../domain/chat.repository';
import { DeleteScope } from '../domain/enums/delete-scope.enum';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { ConversationListItem } from '../domain/entities/conversation-view.entity';
import { Message } from '../domain/entities/message.entity';
import { PROFILE_PHOTOS_INCLUDE } from '../../connections/infrastructure/connection.mapper';
import { ChatMapper, ChatSummaryRow } from './chat.mapper';

/** A message is never useful without its attachment — load it everywhere, in one query. */
const MESSAGE_INCLUDE = { attachment: true, sticker: true } as const;

const SUMMARY_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  bio: true,
  universityId: true,
  gender: true,
  courseYear: true,
  lastSeenAt: true,
  lastSeenVisibility: true,
  // Read raw and masked per-reader by `applyPresenceVisibility` — never serialised straight through.
  phoneNumber: true,
  phoneVisibility: true,
  profilePhotos: PROFILE_PHOTOS_INCLUDE,
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
  photos: [],
  bio: null,
  universityId: null,
  gender: null,
  courseYear: null,
  online: false,
  lastSeenAt: null,
  phoneNumber: null,
  lastSeenVisibility: LastSeenVisibility.NOBODY,
  phoneVisibility: PhoneVisibility.NOBODY,
};

/**
 * The `WHERE` every history read shares (§A4.3): rows below this member's clear watermark, and rows
 * they hid for themselves.
 *
 * It is one function rather than a clause spelled out per query because the failure mode of
 * forgetting it in a single place is silent — a hidden message reappears in `lastMessage` while the
 * history keeps hiding it, and the two views of one conversation quietly disagree.
 */
function visibleTo(conversationId: string, viewer: MessageViewer): Prisma.MessageWhereInput {
  return {
    conversationId,
    seq: { gt: viewer.clearedBeforeSeq },
    hidden: { none: { studentId: viewer.studentId } },
  };
}

/**
 * Deterministic newest-first ordering (§A4.2). `seq` is unique per conversation, so it is already a
 * total order — `createdAt`/`id` are insurance: if that invariant is ever violated, two identical
 * queries must still agree, or rows swap places between pages in the client's cache.
 */
const NEWEST_FIRST = [
  { seq: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.MessageOrderByWithRelationInput[];

/** The same order, oldest-first — catch-up and `?around=` page forwards. */
const OLDEST_FIRST = [
  { seq: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.MessageOrderByWithRelationInput[];

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
            stickerId: input.stickerId,
            stickerProvider: input.externalSticker?.provider ?? null,
            stickerExternalId: input.externalSticker?.externalId ?? null,
            stickerUrl: input.externalSticker?.url ?? null,
            stickerThumbUrl: input.externalSticker?.thumbUrl ?? null,
            stickerWidth: input.externalSticker?.width ?? null,
            stickerHeight: input.externalSticker?.height ?? null,
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
      // The `message_id` unique index is what actually makes an attachment single-use. The
      // service's `messageId !== null` check happens before the transaction, so two sends racing
      // on the same mediaId both pass it and the loser lands here — a 409, not a 500.
      if (
        mediaId !== null &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        targetsMessageId(error)
      ) {
        throw new AppException(ERROR_CODE.MEDIA_ALREADY_USED, 422, 'Bu fayl allaqachon yuborilgan');
      }
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
    viewer: MessageViewer,
    beforeSeq: number | null,
    size: number,
  ): Promise<Message[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        ...visibleTo(conversationId, viewer),
        // Rebuilt rather than merged: a second `seq` key would overwrite the watermark bound from
        // `visibleTo`, quietly handing back everything the member cleared.
        seq: { gt: viewer.clearedBeforeSeq, ...(beforeSeq === null ? {} : { lt: beforeSeq }) },
      },
      orderBy: NEWEST_FIRST,
      take: size,
      include: MESSAGE_INCLUDE,
    });
    return rows.map(ChatMapper.toMessage);
  }

  async listSince(
    conversationId: string,
    viewer: MessageViewer,
    afterSeq: number,
    size: number,
  ): Promise<Message[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        ...visibleTo(conversationId, viewer),
        seq: { gt: Math.max(afterSeq, viewer.clearedBeforeSeq) },
      },
      orderBy: OLDEST_FIRST,
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
          membership,
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
      membership,
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
         AND m.seq > GREATEST(cm.last_read_seq, cm.cleared_before_seq)
         AND m.sender_id <> cm.student_id
         AND m.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM message_hidden h
           WHERE h.message_id = m.id AND h.student_id = cm.student_id
         )
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

  findMessagesByIds(ids: string[]): Promise<MessageAuthRow[]> {
    return this.prisma.message.findMany({
      where: { id: { in: ids } },
      select: { id: true, conversationId: true, senderId: true, seq: true },
    });
  }

  /**
   * One transaction for the whole batch (§A4.4): apply, then recount. Nothing here loops per message
   * — 100 ids cost the same four statements as one, and the counters are derived from the post-delete
   * state rather than adjusted by hand, which is what keeps them from drifting under concurrency.
   */
  async deleteMessages(
    conversationId: string,
    viewer: MessageViewer,
    ids: string[],
    scope: DeleteScope,
  ): Promise<{ unreadCount: number; lastMessage: Message | null }> {
    return this.prisma.$transaction(async (tx) => {
      if (scope === DeleteScope.EVERYONE) {
        // `deletedAt: null` in the filter is what makes a retry idempotent: without it a second call
        // slides the timestamp forward, and the client sees the message "deleted again".
        //
        // `senderId` repeats a check the service already made. That is deliberate: this is the
        // statement that actually blanks other people's messages, so the rule that you may only do
        // it to your own is enforced here rather than trusted from the caller.
        await tx.message.updateMany({
          where: {
            id: { in: ids },
            conversationId,
            senderId: viewer.studentId,
            deletedAt: null,
          },
          // The body really goes — a delete that only hid the text would be a lie to the sender.
          // Evidence for moderation is captured in `reports.content_snapshot` at report time.
          data: { deletedAt: new Date(), body: null },
        });
      } else {
        await tx.messageHidden.createMany({
          data: ids.map((messageId) => ({ studentId: viewer.studentId, messageId })),
          // Re-hiding an already-hidden message is a no-op, not a unique-constraint failure.
          skipDuplicates: true,
        });
      }

      const [lastRow, unreadCount] = await Promise.all([
        tx.message.findFirst({
          where: visibleTo(conversationId, viewer),
          orderBy: NEWEST_FIRST,
          include: MESSAGE_INCLUDE,
        }),
        tx.message.count({
          where: {
            ...visibleTo(conversationId, viewer),
            seq: { gt: Math.max(viewer.lastReadSeq, viewer.clearedBeforeSeq) },
            senderId: { not: viewer.studentId },
            deletedAt: null,
          },
        }),
      ]);

      return {
        unreadCount,
        lastMessage: lastRow === null ? null : ChatMapper.toMessage(lastRow),
      };
    });
  }

  async clearHistory(
    conversationId: string,
    studentId: string,
    scope: DeleteScope,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const newest = await tx.message.findFirst({
        where: { conversationId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      const watermark = newest?.seq ?? 0;
      await tx.conversationMember.updateMany({
        where: { conversationId, ...(scope === DeleteScope.EVERYONE ? {} : { studentId }) },
        // `lastReadSeq` moves with the watermark: everything below it is invisible, and an invisible
        // message can never be read, so a cursor left behind would keep the badge lit forever.
        data: { clearedBeforeSeq: watermark, lastReadSeq: watermark },
      });
      return watermark;
    });
  }

  /**
   * Finds the conversations worth purging first, then deletes each one's rows on its own.
   *
   * The obvious single statement — `DELETE FROM messages USING (SELECT MIN(cleared_before_seq) …
   * GROUP BY conversation_id)` — makes the planner sequentially scan `messages` to find its victims,
   * because the watermark is not known until the aggregate has run. Measured at 100k rows: 3079
   * buffers read to delete 4000, with 96000 rows discarded by the join filter. That cost scales with
   * the whole table rather than with the work, every week, forever.
   *
   * Looking the conversations up first turns each delete into an index range scan on
   * `(conversation_id, seq)` — 10 buffers for the same 400 rows — and gives every conversation its
   * own statement, so a large purge never holds one lock across all of them.
   *
   * `message_hidden` rows cascade away with their messages. Attachments and reports are only
   * detached (`ON DELETE SET NULL`): the uploads become orphans that `OrphanMediaCron` already
   * sweeps nightly, and reports keep the `content_snapshot` taken at report time.
   */
  async purgeClearedMessages(): Promise<number> {
    const targets = await this.prisma.conversationMember.groupBy({
      by: ['conversationId'],
      _min: { clearedBeforeSeq: true },
      // `> 0` is what keeps this proportional to the work: without it every conversation that was
      // never cleared still gets a delete issued against it.
      having: { clearedBeforeSeq: { _min: { gt: 0 } } },
    });

    let removed = 0;
    for (const target of targets) {
      const floor = target._min.clearedBeforeSeq;
      if (floor === null) {
        continue;
      }
      const { count } = await this.prisma.message.deleteMany({
        where: { conversationId: target.conversationId, seq: { lte: floor } },
      });
      removed += count;
    }
    return removed;
  }

  /** Builds one conversation-list row from an already-loaded membership and its counterpart. */
  private async toListItem(
    conversation: PrismaConversation,
    membership: { lastReadSeq: number; clearedBeforeSeq: number },
    otherMember: OtherMemberRow | undefined,
    studentId: string,
  ): Promise<ConversationListItem> {
    const viewer: MessageViewer = {
      studentId,
      clearedBeforeSeq: membership.clearedBeforeSeq,
      lastReadSeq: membership.lastReadSeq,
    };
    const [lastRow, unreadCount] = await Promise.all([
      this.prisma.message.findFirst({
        where: visibleTo(conversation.id, viewer),
        orderBy: NEWEST_FIRST,
        include: MESSAGE_INCLUDE,
      }),
      this.prisma.message.count({
        where: {
          ...visibleTo(conversation.id, viewer),
          seq: { gt: Math.max(membership.lastReadSeq, membership.clearedBeforeSeq) },
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
      // Shown even when deleted — the client draws the tombstone. Hidden and cleared rows are gone
      // from `visibleTo` entirely, so the two members of one conversation can legitimately see
      // different last messages. That is `scope = ME` working, not a bug (§A4.5).
      lastMessage: lastRow === null ? null : ChatMapper.toMessage(lastRow),
      unreadCount,
      myReadSeq: membership.lastReadSeq,
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

/** Whether a P2002 came from the attachment's `message_id` index rather than `clientMsgId`. */
function targetsMessageId(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  return fields.some((field) => String(field).includes('message_id'));
}
