import { ApiProperty } from '@nestjs/swagger';
import { StudentSummaryDto } from '../../../connections/presentation/dto/student-summary.dto';
import { Page } from '../../application/chat.io';
import { UnreadSummary } from '../../domain/chat.repository';
import { Conversation } from '../../domain/entities/conversation.entity';
import { ConversationListItem } from '../../domain/entities/conversation-view.entity';
import { ConversationType } from '../../domain/enums/conversation-type.enum';
import { MessageDto } from './message.dto';

/** A conversation header (returned when opening a direct conversation). */
export class ConversationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ConversationType, enumName: 'ConversationTypeDto' })
  type!: ConversationType;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastMessageAt!: string | null;

  static fromDomain(conversation: Conversation): ConversationDto {
    const dto = new ConversationDto();
    dto.id = conversation.id;
    dto.type = conversation.type;
    dto.lastMessageAt =
      conversation.lastMessageAt === null ? null : conversation.lastMessageAt.toISOString();
    return dto;
  }
}

/** A conversation-list row: the other member, last message and unread count. */
export class ConversationListItemDto {
  @ApiProperty({ type: ConversationDto })
  conversation!: ConversationDto;

  @ApiProperty({ type: StudentSummaryDto })
  other!: StudentSummaryDto;

  @ApiProperty({ type: MessageDto, nullable: true })
  lastMessage!: MessageDto | null;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description: 'Messages from the other member with `seq > myReadSeq`.',
  })
  unreadCount!: number;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description:
      'How far you have read (`ConversationMember.lastReadSeq`). The persisted counterpart of ' +
      '`unreadCount` — advanced by `POST /v1/conversations/{id}/read` or the `message:read` event.',
  })
  myReadSeq!: number;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description:
      'How far the other member has read. Every message you sent with `seq <= peerReadSeq` is ' +
      'read (✓✓). Restores receipt state after a restart, when the live `message:read` event is gone.',
  })
  peerReadSeq!: number;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description:
      'How far the other member’s device has received. `seq <= peerDeliveredSeq` is delivered (✓).',
  })
  peerDeliveredSeq!: number;

  static fromItem(item: ConversationListItem, viewerId: string): ConversationListItemDto {
    const dto = new ConversationListItemDto();
    dto.conversation = ConversationDto.fromDomain(item.conversation);
    dto.other = StudentSummaryDto.fromDomain(item.other);
    dto.lastMessage =
      item.lastMessage === null ? null : MessageDto.fromDomain(item.lastMessage, viewerId);
    dto.unreadCount = item.unreadCount;
    dto.myReadSeq = item.myReadSeq;
    dto.peerReadSeq = item.peerReadSeq;
    dto.peerDeliveredSeq = item.peerDeliveredSeq;
    return dto;
  }
}

/** Tab-badge counters (§18) — saves loading the whole conversation list just to add up unread. */
export class UnreadCountDto {
  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description: 'Unread messages across every conversation. Deleted messages are not counted.',
  })
  total!: number;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description: 'How many conversations hold at least one unread message.',
  })
  conversations!: number;

  static from(summary: UnreadSummary): UnreadCountDto {
    const dto = new UnreadCountDto();
    dto.total = summary.total;
    dto.conversations = summary.conversations;
    return dto;
  }
}

/** Paginated conversation list. */
export class ConversationPageDto {
  @ApiProperty({ type: [ConversationListItemDto] })
  items!: ConversationListItemDto[];

  @ApiProperty({ type: 'integer', format: 'int32' })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  total!: number;

  @ApiProperty()
  hasNext!: boolean;

  static fromPage(
    result: Page<ConversationListItem>,
    page: number,
    size: number,
    viewerId: string,
  ): ConversationPageDto {
    const dto = new ConversationPageDto();
    dto.items = result.items.map((item) => ConversationListItemDto.fromItem(item, viewerId));
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
