import {
  Conversation as PrismaConversation,
  ConversationMember as PrismaMember,
  MediaAsset as PrismaMediaAsset,
  Message as PrismaMessage,
  Sticker as PrismaSticker,
  Student,
} from '@prisma/client';
import { MediaAsset } from '../../media/domain/entities/media-asset.entity';
import { MediaKind, MediaProvider, MediaStatus } from '../../media/domain/enums/media-kind.enum';
import { StudentSummary } from '../../connections/domain/entities/student-summary.entity';
import {
  COURSE_YEAR_TO_DOMAIN,
  GENDER_TO_DOMAIN,
  LAST_SEEN_VISIBILITY_TO_DOMAIN,
} from '../../profiles/infrastructure/profile-enums.mapper';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { Message } from '../domain/entities/message.entity';
import { ConversationType } from '../domain/enums/conversation-type.enum';
import { MessageType } from '../domain/enums/message-type.enum';

/** The student columns for a chat StudentSummary. */
export type ChatSummaryRow = Pick<
  Student,
  | 'id'
  | 'username'
  | 'firstName'
  | 'lastName'
  | 'avatarUrl'
  | 'universityId'
  | 'gender'
  | 'courseYear'
  | 'lastSeenAt'
  | 'lastSeenVisibility'
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

  static toMessage(
    row: PrismaMessage & {
      attachment?: PrismaMediaAsset | null;
      sticker?: PrismaSticker | null;
    },
  ): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      seq: row.seq,
      type: MessageType[row.type],
      body: row.body,
      clientMsgId: row.clientMsgId,
      deletedAt: row.deletedAt,
      albumId: row.albumId,
      attachment:
        row.attachment === undefined || row.attachment === null
          ? null
          : ChatMapper.toAttachment(row.attachment),
      sticker:
        row.sticker === undefined || row.sticker === null
          ? null
          : {
              id: row.sticker.id,
              packId: row.sticker.packId,
              emoji: row.sticker.emoji,
              url: row.sticker.url,
              width: row.sticker.width,
              height: row.sticker.height,
            },
      createdAt: row.createdAt,
    };
  }

  /** Prisma media row → the media module's domain shape, so `MessageDto` can render it. */
  static toAttachment(row: PrismaMediaAsset): MediaAsset {
    return {
      id: row.id,
      ownerId: row.ownerId,
      conversationId: row.conversationId,
      kind: MediaKind[row.kind],
      status: MediaStatus[row.status],
      isAnimated: row.isAnimated,
      storageKey: row.storageKey,
      thumbStorageKey: row.thumbStorageKey,
      externalUrl: row.externalUrl,
      externalThumbUrl: row.externalThumbUrl,
      provider: row.provider === null ? null : MediaProvider[row.provider],
      externalId: row.externalId,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      durationMs: row.durationMs,
      waveform: row.waveform,
      fileName: row.fileName,
      blurHash: row.blurHash,
      messageId: row.messageId,
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
      universityId: row.universityId,
      gender: row.gender === null ? null : GENDER_TO_DOMAIN[row.gender],
      courseYear: row.courseYear === null ? null : COURSE_YEAR_TO_DOMAIN[row.courseYear],
      online: false,
      lastSeenAt: row.lastSeenAt,
      lastSeenVisibility: LAST_SEEN_VISIBILITY_TO_DOMAIN[row.lastSeenVisibility],
    };
  }
}
