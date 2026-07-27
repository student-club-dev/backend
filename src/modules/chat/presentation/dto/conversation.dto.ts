import { ApiProperty } from '@nestjs/swagger';
import { StudentSummaryDto } from '../../../connections/presentation/dto/student-summary.dto';
import { Page } from '../../application/chat.io';
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

  @ApiProperty({ nullable: true, format: 'date-time' })
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

  @ApiProperty()
  unreadCount!: number;

  static fromItem(item: ConversationListItem): ConversationListItemDto {
    const dto = new ConversationListItemDto();
    dto.conversation = ConversationDto.fromDomain(item.conversation);
    dto.other = StudentSummaryDto.fromDomain(item.other);
    dto.lastMessage = item.lastMessage === null ? null : MessageDto.fromDomain(item.lastMessage);
    dto.unreadCount = item.unreadCount;
    return dto;
  }
}

/** Paginated conversation list. */
export class ConversationPageDto {
  @ApiProperty({ type: [ConversationListItemDto] })
  items!: ConversationListItemDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  hasNext!: boolean;

  static fromPage(
    result: Page<ConversationListItem>,
    page: number,
    size: number,
  ): ConversationPageDto {
    const dto = new ConversationPageDto();
    dto.items = result.items.map(ConversationListItemDto.fromItem);
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
}
