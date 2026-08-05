import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiForbiddenEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { AdminNotificationsService } from '../application/admin-notifications.service';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { Roles } from './decorators/roles.decorator';
import { AdminSendNotificationDto } from './dto/admin-send-notification.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

/**
 * System notifications, sent by hand (push catalogue §3.4).
 *
 * ADMIN only, not MODERATOR: this is the one endpoint that can put text on an arbitrary number of
 * people's lock screens, and it cannot be recalled once sent.
 */
@ApiTags('Admin — Notifications')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('ADMIN role required.')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: AdminNotificationsService) {}

  @Post()
  @HttpCode(200)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({
    summary: 'Tizim bildirishnomasini yuborish',
    description:
      'Writes a `SYSTEM` row for each recipient. An `ANNOUNCEMENT` is list-only unless `sendPush` ' +
      'is set; a `PROFILE` notification always pushes. Both respect quiet hours (22:00–08:00 ' +
      'Tashkent) — a held push is sent the following morning, while the list row appears at once.',
  })
  @ApiOkEnvelope(undefined, 'Sent; `result` is null.')
  @ApiValidationEnvelope()
  async send(@Body() dto: AdminSendNotificationDto): Promise<void> {
    await this.notifications.send({
      studentIds: dto.studentIds,
      title: dto.title,
      body: dto.body ?? null,
      kind: dto.kind ?? 'ANNOUNCEMENT',
      sendPush: dto.sendPush ?? false,
    });
  }
}
