import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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
import { ConversationDto, ConversationPageDto } from './dto/conversation.dto';
import { MessageDto, MessageListDto } from './dto/message.dto';
import { ConversationsQueryDto, HistoryQueryDto } from './dto/queries.dto';
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
    const message = await this.chat.sendMessage(user, id, dto.body, dto.clientMsgId ?? null);
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
}
