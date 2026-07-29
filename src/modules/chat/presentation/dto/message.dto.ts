import { ApiProperty } from '@nestjs/swagger';
import { Message } from '../../domain/entities/message.entity';
import { MessageType } from '../../domain/enums/message-type.enum';

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

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  /** `viewerId` is whoever will read this DTO — `clientMsgId` is private to the sender. */
  static fromDomain(message: Message, viewerId: string | null): MessageDto {
    const dto = new MessageDto();
    dto.id = message.id;
    dto.conversationId = message.conversationId;
    dto.senderId = message.senderId;
    dto.seq = message.seq;
    dto.type = message.type;
    dto.body = message.body;
    dto.clientMsgId = message.senderId === viewerId ? message.clientMsgId : null;
    dto.deletedAt = message.deletedAt === null ? null : message.deletedAt.toISOString();
    dto.createdAt = message.createdAt.toISOString();
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

  static from(messages: Message[], hasMore: boolean, viewerId: string): MessageListDto {
    const dto = new MessageListDto();
    // Not `map(MessageDto.fromDomain)` — that would feed the array index into the second parameter.
    dto.items = messages.map((message) => MessageDto.fromDomain(message, viewerId));
    dto.hasMore = hasMore;
    return dto;
  }
}
