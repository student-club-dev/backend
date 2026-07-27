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

  @ApiProperty({ description: 'Per-conversation monotonic sequence' })
  seq!: number;

  @ApiProperty({ enum: MessageType, enumName: 'MessageTypeDto' })
  type!: MessageType;

  @ApiProperty({ nullable: true })
  body!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromDomain(message: Message): MessageDto {
    const dto = new MessageDto();
    dto.id = message.id;
    dto.conversationId = message.conversationId;
    dto.senderId = message.senderId;
    dto.seq = message.seq;
    dto.type = message.type;
    dto.body = message.body;
    dto.createdAt = message.createdAt.toISOString();
    return dto;
  }
}

/** A cursor page of messages (newest-first). `hasMore` ⇒ page again with `before = last item's seq`. */
export class MessageListDto {
  @ApiProperty({ type: [MessageDto], description: 'Newest-first' })
  items!: MessageDto[];

  @ApiProperty({ description: 'More history exists before the oldest item' })
  hasMore!: boolean;

  static from(messages: Message[], size: number): MessageListDto {
    const dto = new MessageListDto();
    dto.items = messages.map(MessageDto.fromDomain);
    dto.hasMore = messages.length === size;
    return dto;
  }
}
