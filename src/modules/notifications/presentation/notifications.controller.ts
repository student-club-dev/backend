import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiForbiddenEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { NotificationListService } from '../application/notification-list.service';
import { MarkNotificationsReadDto } from './dto/mark-read.dto';
import {
  NotificationDto,
  NotificationListDto,
  NotificationTargetDto,
} from './dto/notification.dto';
import { NOTIFICATIONS_LIMIT_DEFAULT, NotificationsQueryDto } from './dto/notifications-query.dto';

/**
 * The in-app notifications list (01-NOTIFICATIONS_BACKEND.md). Students only, served under `/v1`.
 *
 * Distinct from `POST /v1/devices` next door, which registers a push token: that is the one-shot
 * signal that reaches a locked phone, this is the history behind the bell icon. They complement
 * each other and neither replaces the other.
 *
 * `NotificationTargetDto` is registered explicitly because `NotificationDto.target` reaches it
 * through a hand-written `allOf`, which the schema scanner does not follow — without this the
 * generated spec would carry a `$ref` to a component that was never emitted.
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@ApiExtraModels(NotificationTargetDto, NotificationDto)
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationListService) {}

  @Get()
  @ApiOperation({
    summary: 'Bildirishnomalar ro‘yxati',
    description:
      'Newest first, `createdAt DESC` with `id DESC` breaking ties so the order is stable between ' +
      'requests. Capped rather than paged — `unreadCount` covers the whole history, not the ' +
      'returned slice.',
  })
  @ApiOkEnvelope(NotificationListDto)
  @ApiValidationEnvelope()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationsQueryDto,
  ): Promise<NotificationListDto> {
    const limit = query.limit ?? NOTIFICATIONS_LIMIT_DEFAULT;
    return NotificationListDto.fromDomain(await this.notifications.list(user.id, limit));
  }

  /**
   * `200`, not `201` — nothing is created, and the client retries this freely (§3.1). Idempotent:
   * re-marking a read notification leaves its original `readAt` alone.
   */
  @Post('read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'O‘qildi deb belgilash',
    description:
      'Send `{ids: [...]}` for specific rows or `{all: true}` for every unread one — exactly one ' +
      'of the two. Unknown ids are ignored rather than rejected, so a batch from a stale cache ' +
      'still marks everything it legitimately can.',
  })
  @ApiOkEnvelope(undefined, 'Marked; `result` is null.')
  @ApiValidationEnvelope(
    'Neither `ids` nor `all` was sent, both were, or `ids` exceeded 200 entries.',
  )
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkNotificationsReadDto,
  ): Promise<void> {
    await this.notifications.markRead(user.id, dto.ids, dto.all === true);
  }
}
