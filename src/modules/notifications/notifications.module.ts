import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { NotificationListService } from './application/notification-list.service';
import { NotificationsService } from './application/notifications.service';
import { DEVICE_TOKEN_REPOSITORY } from './domain/device-token.repository';
import { NOTIFICATION_REPOSITORY } from './domain/notification.repository';
import { DeviceTokenPrismaRepository } from './infrastructure/device-token.prisma.repository';
import { NotificationPrismaRepository } from './infrastructure/notification.prisma.repository';
import { DevicesController } from './presentation/devices.controller';
import { NotificationsController } from './presentation/notifications.controller';

/**
 * Notifications, in both senses the app uses the word: the push that reaches a locked phone
 * (`NotificationsService` + device tokens, chat.md C8) and the in-app list that keeps the history
 * (`NotificationListService`, 01-NOTIFICATIONS_BACKEND.md). `PushModule` (global) provides the
 * push provider.
 *
 * Both services are exported — chat pushes to offline recipients, and the retention cron sweeps
 * the list.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [DevicesController, NotificationsController],
  providers: [
    NotificationsService,
    NotificationListService,
    JwtAuthGuard,
    StudentGuard,
    { provide: DEVICE_TOKEN_REPOSITORY, useClass: DeviceTokenPrismaRepository },
    { provide: NOTIFICATION_REPOSITORY, useClass: NotificationPrismaRepository },
  ],
  exports: [NotificationsService, NotificationListService],
})
export class NotificationsModule {}
