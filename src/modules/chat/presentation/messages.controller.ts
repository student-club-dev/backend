import { Controller, Delete, HttpCode, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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
import { MessageDto } from './dto/message.dto';

/** Operations on a single message (§18). Students only. Served under `/v1`. */
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

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete your own message',
    description:
      'Soft delete: the message keeps its `seq` and stays in the history, but `body` is emptied, ' +
      '`deletedAt` is set and it stops counting as unread. `seq` is the axis every history and ' +
      'read cursor walks, so removing the row would tear holes in both. Idempotent.',
  })
  @ApiParam({ name: 'id', description: 'Message id' })
  @ApiOkEnvelope(MessageDto, 'The message, now deleted.')
  @ApiForbiddenEnvelope('Not your message (`FORBIDDEN`), or the caller is not a STUDENT account.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.MESSAGE_NOT_FOUND,
    'No such message, or it is not in a conversation you belong to.',
    'Xabar topilmadi',
  )
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MessageDto> {
    const message = await this.chat.deleteMessage(user, id);
    await this.gateway.broadcastDeleted(message);
    return MessageDto.fromDomain(message, user.id);
  }
}
