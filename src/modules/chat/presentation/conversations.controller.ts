import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiCreatedEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ChatService } from '../application/chat.service';
import { ChatGateway } from '../chat.gateway';
import {
  ConversationDto,
  ConversationListItemDto,
  ConversationPageDto,
  UnreadCountDto,
} from './dto/conversation.dto';
import { DeleteScope } from '../domain/enums/delete-scope.enum';
import { ClearHistoryResultDto, MessageDto, MessageListDto } from './dto/message.dto';
import { ConversationsQueryDto, HistoryQueryDto, ScopeQueryDto } from './dto/queries.dto';
import { MarkDeliveredDto, MarkReadDto, OpenDirectDto, SendMessageDto } from './dto/requests.dto';

/**
 * REST surface for chat: open/list conversations, history (cursor by `seq`), send (WS fallback) and
 * mark-read. Real-time lives in the gateway; a REST-sent message is still broadcast to online
 * members. Students only. Served under `/v1`.
 */
@ApiTags('Chat')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Open (or fetch) a direct conversation with a connection' })
  @ApiCreatedEnvelope(ConversationDto)
  @ApiForbiddenEnvelope('Not connected to this student (`NOT_CONNECTED`).')
  @ApiValidationEnvelope()
  async open(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OpenDirectDto,
  ): Promise<ConversationDto> {
    return ConversationDto.fromDomain(await this.chat.openDirect(user, dto.studentId));
  }

  @Get()
  @ApiOperation({ summary: "List the caller's conversations (newest-active first)" })
  @ApiOkEnvelope(ConversationPageDto)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ConversationsQueryDto,
  ): Promise<ConversationPageDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const result = await this.chat.listConversations(user, page, size);
    return ConversationPageDto.fromPage(result, page, size, user.id);
  }

  // Declared before `:id` — Nest matches routes in declaration order, and `:id` would otherwise
  // swallow `unread-count` as a conversation id.
  @Get('unread-count')
  @ApiOperation({
    summary: 'Unread totals for the tab badge',
    description:
      'Both counters in one query. Without it the client loads the whole conversation list just ' +
      'to add up unread messages (§18).',
  })
  @ApiOkEnvelope(UnreadCountDto)
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<UnreadCountDto> {
    return UnreadCountDto.from(await this.chat.unreadSummary(user));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One conversation — the same row the list returns',
    description:
      'For opening a conversation from a push without reloading the whole list (§18). The shape is ' +
      'identical to an item of `GET /v1/conversations`, so the client can slot it straight in.',
  })
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiOkEnvelope(ConversationListItemDto)
  @ApiNotFoundEnvelope(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Not a member.', 'Suhbat topilmadi')
  async one(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ConversationListItemDto> {
    const item = await this.chat.conversationItem(user, id);
    return ConversationListItemDto.fromItem(item, user.id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Message history (newest-first, cursor by `before`)' })
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiOkEnvelope(MessageListDto)
  @ApiNotFoundEnvelope(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Not a member.', 'Suhbat topilmadi')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: HistoryQueryDto,
  ): Promise<MessageListDto> {
    const size = query.size ?? 30;
    const page =
      query.after === undefined
        ? await this.chat.history(user, id, query.before ?? null, size)
        : await this.chat.messagesSince(user, id, query.after, size);
    return MessageListDto.from(page.items, page.hasMore, user.id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message (REST fallback; also broadcast to online members)' })
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiCreatedEnvelope(MessageDto)
  @ApiNotFoundEnvelope(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Not a member.', 'Suhbat topilmadi')
  @ApiForbiddenEnvelope('Not connected anymore (`NOT_CONNECTED`).')
  @ApiValidationEnvelope()
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    const message = await this.chat.sendMessage(user, {
      conversationId: id,
      type: dto.type,
      body: dto.body,
      mediaId: dto.mediaId,
      gif: dto.gif,
      stickerId: dto.stickerId,
      sticker: dto.sticker,
      albumId: dto.albumId,
      clientMsgId: dto.clientMsgId ?? null,
    });
    await this.gateway.broadcastMessage(message);
    return MessageDto.fromDomain(message, user.id);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Advance the read cursor' })
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiOkEnvelope(undefined, 'Read; `result` is null.')
  @ApiNotFoundEnvelope(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Not a member.', 'Suhbat topilmadi')
  @ApiValidationEnvelope()
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarkReadDto,
  ): Promise<void> {
    await this.chat.markRead(user, id, dto.seq);
    await this.gateway.broadcastRead(id, user.id, dto.seq);
  }

  @Post(':id/delivered')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Advance the delivered cursor',
    description:
      'REST twin of the `message:delivered` event, for when the socket is down. Without it the ' +
      'delivered cursor is only reachable over WS, so a dropped connection left the sender ' +
      'looking at a single tick forever (§17.6).',
  })
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiOkEnvelope(undefined, 'Delivered; `result` is null.')
  @ApiNotFoundEnvelope(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Not a member.', 'Suhbat topilmadi')
  @ApiValidationEnvelope()
  async delivered(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarkDeliveredDto,
  ): Promise<void> {
    await this.chat.markDelivered(user, id, dto.seq);
    await this.gateway.broadcastDelivered(id, user.id, dto.seq);
  }

  @Delete(':id/history')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Clear the conversation history',
    description:
      'Raises a per-member watermark (§B1) — no message row is removed, so `seq` stays gapless and ' +
      'the other member’s read cursors keep working. The conversation itself stays in your list ' +
      'with a null `lastMessage`, exactly as Telegram leaves it, and messages sent after the clear ' +
      'appear normally. `ME` clears it for you on every device you own; `EVERYONE` clears it for ' +
      'both members. Idempotent — clearing twice just rewrites the same watermark.',
  })
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiQuery({
    name: 'scope',
    enum: DeleteScope,
    required: false,
    description:
      'Defaults to `ME` — the conservative choice, since `EVERYONE` also wipes the other member’s copy.',
  })
  @ApiOkEnvelope(ClearHistoryResultDto, 'The watermark written, and your now-zero unread count.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.CONVERSATION_NOT_FOUND,
    'No such conversation, or you are not a member.',
    'Suhbat topilmadi',
  )
  async clearHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ScopeQueryDto,
  ): Promise<ClearHistoryResultDto> {
    // `ME` by default, unlike the message routes: this one can erase the other member's entire
    // history, so the destructive reading is never the one you get by omitting the parameter.
    const scope = query.scope ?? DeleteScope.ME;
    const result = await this.chat.clearHistory(user, id, scope);
    await this.gateway.broadcastHistoryCleared(id, user.id, result.clearedBeforeSeq, scope);
    return ClearHistoryResultDto.from(result);
  }
}
