import { Body, Controller, Delete, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ChatService } from '../application/chat.service';
import { ChatGateway } from '../chat.gateway';
import { DeleteScope } from '../domain/enums/delete-scope.enum';
import { BulkDeleteResultDto, MessageDto } from './dto/message.dto';
import { ScopeQueryDto } from './dto/queries.dto';
import { DeleteMessagesDto } from './dto/requests.dto';

/** Operations on messages (§18, §A2). Students only. Served under `/v1`. */
@ApiTags('Chat')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('messages')
export class MessagesController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  // Declared before `:id` so the literal path is never shadowed by the parameter route.
  @Post('delete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete many messages at once',
    description:
      'One transaction for the whole batch (§A2): every permitted id is applied or none is, the ' +
      'unread count and last message are recomputed once, and a single `message:deleted` event ' +
      'goes out instead of one per id. Idempotent — re-deleting returns 200 and changes nothing. ' +
      'Ids you may not delete come back in `skipped`; an empty `deleted` is a result, not an error.',
  })
  @ApiOkEnvelope(
    BulkDeleteResultDto,
    'What was deleted, what was skipped, and the settled counters.',
  )
  @ApiForbiddenEnvelope(
    'Not a member of that conversation (`NOT_MEMBER`), or the caller is not a STUDENT account.',
  )
  @ApiNotFoundEnvelope(
    ERROR_CODE.MESSAGE_NOT_FOUND,
    'Not one of the ids exists — there is no conversation to report counters for.',
    'Xabar topilmadi',
  )
  async removeMany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteMessagesDto,
  ): Promise<BulkDeleteResultDto> {
    const result = await this.chat.deleteMessages(user, dto.ids, dto.scope);
    await this.gateway.broadcastBulkDeleted(
      result.conversationId,
      user.id,
      result.deleted,
      result.deletedSeqs,
      dto.scope,
    );
    return BulkDeleteResultDto.fromDomain(result, user.id);
  }

  /**
   * The pre-batch route, kept verbatim for clients already in the wild (§A2).
   *
   * `scope` is additive: omitting it runs exactly the code this route always ran, down to the 403 on
   * someone else's message and the `MessageDto` response. `ME` is the only new branch — and it
   * returns the message unchanged, because hiding it for one member mutates no row.
   */
  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete one message',
    description:
      'Soft delete: the message keeps its `seq` and stays in the history, but `body` is emptied, ' +
      '`deletedAt` is set and it stops counting as unread. `seq` is the axis every history and ' +
      'read cursor walks, so removing the row would tear holes in both. Idempotent. ' +
      '`scope=ME` hides it for you alone on every device you own, leaving it untouched for the ' +
      'other member — and unlike `EVERYONE`, it works on their messages too. Prefer ' +
      '`POST /v1/messages/delete` for anything more than a single message.',
  })
  @ApiParam({ name: 'id', description: 'Message id' })
  @ApiQuery({
    name: 'scope',
    enum: DeleteScope,
    required: false,
    description: 'Defaults to `EVERYONE` — the behaviour this route had before the parameter.',
  })
  @ApiOkEnvelope(MessageDto, 'The message. Blanked under `EVERYONE`, unchanged under `ME`.')
  @ApiForbiddenEnvelope('Not your message (`FORBIDDEN`), or the caller is not a STUDENT account.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.MESSAGE_NOT_FOUND,
    'No such message, or it is not in a conversation you belong to.',
    'Xabar topilmadi',
  )
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ScopeQueryDto,
  ): Promise<MessageDto> {
    const scope = query.scope ?? DeleteScope.EVERYONE;
    const { message, result } = await this.chat.deleteSingleMessage(user, id, scope);
    await this.gateway.broadcastBulkDeleted(
      result?.conversationId ?? message.conversationId,
      user.id,
      result?.deleted ?? [message.id],
      result?.deletedSeqs ?? [message.seq],
      scope,
    );
    return MessageDto.fromDomain(message, user.id);
  }
}
