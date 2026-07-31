import { ApiProperty } from '@nestjs/swagger';
import { MediaProvider } from '../../../media/domain/enums/media-kind.enum';
import { AttachmentDto } from '../../../media/presentation/dto/attachment.dto';
import { BulkDeleteResult } from '../../domain/chat.repository';
import { Message } from '../../domain/entities/message.entity';
import { MessageType } from '../../domain/enums/message-type.enum';
import { MessageSticker } from '../../domain/sticker-directory.repository';

/**
 * The sticker carried by a `STICKER` message — one shape whichever catalogue it came from.
 *
 * `id`, `url`, `width` and `height` are always set; render from those and you never have to ask
 * where it came from. `packId` and `emoji` are catalogue-only and `provider` and `thumbUrl` are
 * search-only, so each is null for the other source.
 */
export class MessageStickerDto {
  @ApiProperty({ description: 'Catalogue id, or the provider’s own id.' })
  id!: string;

  @ApiProperty({
    enum: MediaProvider,
    enumName: 'MediaProviderDto',
    nullable: true,
    description:
      'Which catalogue this came from. `null` ⇒ our own seeded packs — show no attribution badge.',
  })
  provider!: MediaProvider | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Our pack id. `null` for a sticker from search, which belongs to no pack of ours.',
  })
  packId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '😄',
    description: 'Catalogue stickers only; `null` for a sticker from search.',
  })
  emoji!: string | null;

  @ApiProperty({
    description:
      'WebP with a transparent background. Never an MP4 — that format has no alpha channel.',
  })
  url!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Smaller preview, search results only. `null` for a catalogue sticker — a 512×512 WebP is ' +
      'already small enough to be its own preview, so fall back to `url`.',
  })
  thumbUrl!: string | null;

  @ApiProperty({ type: 'integer', format: 'int32' })
  width!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  height!: number;

  static fromDomain(sticker: MessageSticker): MessageStickerDto {
    const dto = new MessageStickerDto();
    dto.id = sticker.id;
    dto.provider = sticker.provider;
    dto.packId = sticker.packId;
    dto.emoji = sticker.emoji;
    dto.url = sticker.url;
    dto.thumbUrl = sticker.thumbUrl;
    dto.width = sticker.width;
    dto.height = sticker.height;
    return dto;
  }
}

/** A chat message on the wire. */
export class MessageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  conversationId!: string;

  @ApiProperty()
  senderId!: string;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description: 'Per-conversation monotonic sequence',
  })
  seq!: number;

  @ApiProperty({ enum: MessageType, enumName: 'MessageTypeDto' })
  type!: MessageType;

  @ApiProperty({ type: String, nullable: true })
  body!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Your own idempotency key, echoed back — set only when you are the sender, `null` for ' +
      'everyone else. Match your optimistic ("sending") copy against this rather than against the ' +
      'message text: two identical texts in a row are indistinguishable, and a media message has ' +
      'no text at all (§17.1).',
  })
  clientMsgId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'When the sender deleted this message, `null` otherwise. The row keeps its `seq` and stays ' +
      'in the history — `body` is emptied and it no longer counts as unread. Render a "message ' +
      'deleted" placeholder (§18).',
  })
  deletedAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Shared by every image of one multi-image send — draw consecutive messages with the same ' +
      'value as a grid. Each is still its own message with its own `seq`.',
  })
  albumId!: string | null;

  @ApiProperty({
    type: () => AttachmentDto,
    nullable: true,
    description: 'Set for IMAGE, GIF, VIDEO, VOICE and FILE messages; null otherwise.',
  })
  attachment!: AttachmentDto | null;

  @ApiProperty({
    type: () => MessageStickerDto,
    nullable: true,
    description: 'Set for `STICKER` messages; null otherwise.',
  })
  sticker!: MessageStickerDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  /**
   * `viewerId` is whoever will read this DTO — `clientMsgId` is private to the sender. `apiBase` is
   * the `/v1` prefix the media proxy lives under.
   */
  static fromDomain(message: Message, viewerId: string | null, apiBase = '/v1'): MessageDto {
    const dto = new MessageDto();
    dto.id = message.id;
    dto.conversationId = message.conversationId;
    dto.senderId = message.senderId;
    dto.seq = message.seq;
    dto.type = message.type;
    dto.body = message.body;
    dto.clientMsgId = message.senderId === viewerId ? message.clientMsgId : null;
    dto.deletedAt = message.deletedAt === null ? null : message.deletedAt.toISOString();
    dto.albumId = message.albumId;
    dto.attachment =
      message.attachment === null ? null : AttachmentDto.fromDomain(message.attachment, apiBase);
    dto.sticker = message.sticker === null ? null : MessageStickerDto.fromDomain(message.sticker);
    dto.createdAt = message.createdAt.toISOString();
    return dto;
  }
}

/** One id a batch delete left alone, with the reason (§A2). */
export class SkippedMessageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    enum: ['NOT_OWN', 'NOT_FOUND', 'NOT_MEMBER'],
    description:
      '`NOT_OWN` — someone else’s message under `EVERYONE`. `NOT_FOUND` — no such id. ' +
      '`NOT_MEMBER` — the id belongs to a conversation you are not in.',
  })
  reason!: 'NOT_OWN' | 'NOT_FOUND' | 'NOT_MEMBER';
}

/**
 * The outcome of `POST /v1/messages/delete` (§A2). `unreadCount` and `lastMessage` are recomputed
 * for the caller inside the same transaction, so the conversation list can settle without a second
 * round trip — and cannot briefly show a count the history no longer supports.
 */
export class BulkDeleteResultDto {
  @ApiProperty()
  conversationId!: string;

  @ApiProperty({
    type: [String],
    description:
      'Ids actually deleted — or already deleted, which is the same result (idempotent).',
  })
  deleted!: string[];

  @ApiProperty({ type: [SkippedMessageDto], description: 'Empty when everything was applied.' })
  skipped!: SkippedMessageDto[];

  @ApiProperty({ type: 'integer', format: 'int32', description: 'Your unread count, recomputed.' })
  unreadCount!: number;

  @ApiProperty({
    type: () => MessageDto,
    nullable: true,
    description:
      'The newest message still visible to **you**, or `null` if none is left. Under `scope=ME` ' +
      'the other member keeps seeing a different one — that is the feature working, not a bug.',
  })
  lastMessage!: MessageDto | null;

  static fromDomain(
    result: BulkDeleteResult,
    viewerId: string,
    apiBase = '/v1',
  ): BulkDeleteResultDto {
    const dto = new BulkDeleteResultDto();
    dto.conversationId = result.conversationId;
    dto.deleted = result.deleted;
    dto.skipped = result.skipped.map((entry) => {
      const skipped = new SkippedMessageDto();
      skipped.id = entry.id;
      skipped.reason = entry.reason;
      return skipped;
    });
    dto.unreadCount = result.unreadCount;
    dto.lastMessage =
      result.lastMessage === null
        ? null
        : MessageDto.fromDomain(result.lastMessage, viewerId, apiBase);
    return dto;
  }
}

/**
 * The outcome of `DELETE /v1/conversations/:id/history` (§B1). No message row was removed — a
 * per-member watermark rose, and everything at or below it is now invisible to you.
 */
export class ClearHistoryResultDto {
  @ApiProperty()
  conversationId!: string;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description:
      'Everything with `seq <= clearedBeforeSeq` is gone for you. Drop it from the local cache; ' +
      'the server will never return it again. Messages sent after this keep climbing from here.',
  })
  clearedBeforeSeq!: number;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description: 'Always 0 — nothing is left to read.',
  })
  unreadCount!: number;

  static from(result: {
    conversationId: string;
    clearedBeforeSeq: number;
    unreadCount: number;
  }): ClearHistoryResultDto {
    const dto = new ClearHistoryResultDto();
    dto.conversationId = result.conversationId;
    dto.clearedBeforeSeq = result.clearedBeforeSeq;
    dto.unreadCount = result.unreadCount;
    return dto;
  }
}

/** A cursor page of messages (newest-first). `hasMore` ⇒ page again with `before = last item's seq`. */
export class MessageListDto {
  @ApiProperty({ type: [MessageDto], description: 'Newest-first' })
  items!: MessageDto[];

  @ApiProperty({
    type: Boolean,
    description:
      'More messages exist past this page, in the direction you are paging. Exact — the server ' +
      'reads one row beyond `size` rather than inferring it from the page length, so a last page ' +
      'that happens to fill exactly still reports `false` (§17.5).',
  })
  hasMore!: boolean;

  static from(
    messages: Message[],
    hasMore: boolean,
    viewerId: string,
    apiBase = '/v1',
  ): MessageListDto {
    const dto = new MessageListDto();
    // Not `map(MessageDto.fromDomain)` — that would feed the array index into the second parameter.
    dto.items = messages.map((message) => MessageDto.fromDomain(message, viewerId, apiBase));
    dto.hasMore = hasMore;
    return dto;
  }
}
