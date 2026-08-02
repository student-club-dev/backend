import {
  Conversation as PrismaConversation,
  ConversationMember as PrismaMember,
  MediaAsset as PrismaMediaAsset,
  Message as PrismaMessage,
  Sticker as PrismaSticker,
  Student,
} from '@prisma/client';
import { CallEndReason } from '../../calls/domain/enums/call-end-reason.enum';
import { CallMedia } from '../../calls/domain/enums/call-media.enum';
import { CallStatus } from '../../calls/domain/enums/call-status.enum';
import { MediaAsset } from '../../media/domain/entities/media-asset.entity';
import { MediaKind, MediaProvider, MediaStatus } from '../../media/domain/enums/media-kind.enum';
import { StudentSummary } from '../../connections/domain/entities/student-summary.entity';
import {
  ProfilePhotoRow,
  toStudentPhotos,
} from '../../connections/infrastructure/connection.mapper';
import {
  COURSE_YEAR_TO_DOMAIN,
  GENDER_TO_DOMAIN,
  LAST_SEEN_VISIBILITY_TO_DOMAIN,
  PHONE_VISIBILITY_TO_DOMAIN,
} from '../../profiles/infrastructure/profile-enums.mapper';
import { Conversation, ConversationMember } from '../domain/entities/conversation.entity';
import { CallSnapshot, Message, ReplySnapshot } from '../domain/entities/message.entity';
import { ConversationType } from '../domain/enums/conversation-type.enum';
import { MessageType } from '../domain/enums/message-type.enum';
import { MessageSticker } from '../domain/sticker-directory.repository';

/** The student columns for a chat StudentSummary. */
export type ChatSummaryRow = Pick<
  Student,
  | 'id'
  | 'username'
  | 'firstName'
  | 'lastName'
  | 'avatarUrl'
  | 'bio'
  | 'universityId'
  | 'gender'
  | 'courseYear'
  | 'lastSeenAt'
  | 'lastSeenVisibility'
  | 'phoneNumber'
  | 'phoneVisibility'
> & { profilePhotos?: ProfilePhotoRow[] };

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
      replyTo?: { deletedAt: Date | null } | null;
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
      sticker: ChatMapper.toSticker(row),
      replyTo: ChatMapper.toReplySnapshot(row),
      call: ChatMapper.toCallSnapshot(row),
      createdAt: row.createdAt,
    };
  }

  /** Rebuilds the call snapshot from its columns — set only on a `CALL` message. */
  private static toCallSnapshot(row: PrismaMessage): CallSnapshot | null {
    if (row.callId === null || row.callMedia === null || row.callStatus === null) {
      return null;
    }
    return {
      callId: row.callId,
      media: CallMedia[row.callMedia],
      status: CallStatus[row.callStatus],
      durationMs: row.callDuration ?? 0,
      endReason: row.callEndReason === null ? null : CallEndReason[row.callEndReason],
    };
  }

  /**
   * Rebuilds the frozen reply snapshot from its columns (§C2). Only `originalDeleted` is live — it
   * drives whether "jump to original" is offered.
   */
  private static toReplySnapshot(
    row: PrismaMessage & { replyTo?: { deletedAt: Date | null } | null },
  ): ReplySnapshot | null {
    // The snapshot columns are written together, so any one of them answers "is this a reply".
    if (row.replyToSeq === null || row.replyToSenderId === null || row.replyToType === null) {
      return null;
    }
    return {
      id: row.replyToMessageId,
      seq: row.replyToSeq,
      senderId: row.replyToSenderId,
      senderName: row.replyToSenderName,
      type: MessageType[row.replyToType],
      preview: row.replyToPreview,
      quote:
        row.quoteText === null || row.quoteOffset === null
          ? null
          : { text: row.quoteText, offset: row.quoteOffset },
      originalDeleted:
        row.replyToMessageId === null ||
        (row.replyTo !== undefined && row.replyTo !== null && row.replyTo.deletedAt !== null),
    };
  }

  /**
   * The message's sticker, whichever catalogue it came from — the joined `Sticker` row for one of
   * ours, or the columns denormalised onto the message for a provider pick. One shape out, so
   * `MessageDto.sticker` looks the same to the client either way.
   */
  private static toSticker(
    row: PrismaMessage & { sticker?: PrismaSticker | null },
  ): MessageSticker | null {
    if (row.sticker !== undefined && row.sticker !== null) {
      return {
        id: row.sticker.id,
        provider: null,
        packId: row.sticker.packId,
        emoji: row.sticker.emoji,
        url: row.sticker.url,
        thumbUrl: null,
        width: row.sticker.width,
        height: row.sticker.height,
      };
    }
    // `stickerUrl` is what makes the row a provider sticker; the rest is written with it.
    if (row.stickerUrl === null || row.stickerExternalId === null) {
      return null;
    }
    return {
      id: row.stickerExternalId,
      provider: row.stickerProvider === null ? null : MediaProvider[row.stickerProvider],
      packId: null,
      emoji: null,
      url: row.stickerUrl,
      thumbUrl: row.stickerThumbUrl,
      width: row.stickerWidth ?? 0,
      height: row.stickerHeight ?? 0,
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
      clearedBeforeSeq: row.clearedBeforeSeq,
      hidden: row.hidden,
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
      photos: toStudentPhotos(row.profilePhotos),
      bio: row.bio,
      universityId: row.universityId,
      gender: row.gender === null ? null : GENDER_TO_DOMAIN[row.gender],
      courseYear: row.courseYear === null ? null : COURSE_YEAR_TO_DOMAIN[row.courseYear],
      online: false,
      lastSeenAt: row.lastSeenAt,
      // Raw — `applyPresenceVisibility` blanks both this and presence for the specific reader.
      phoneNumber: row.phoneNumber,
      lastSeenVisibility: LAST_SEEN_VISIBILITY_TO_DOMAIN[row.lastSeenVisibility],
      phoneVisibility: PHONE_VISIBILITY_TO_DOMAIN[row.phoneVisibility],
    };
  }
}
