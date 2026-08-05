import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { PresenceModule } from '../../infrastructure/presence/presence.module';
import { ChatModule } from '../chat/chat.module';
import { ExpiryReminderService } from './application/expiry-reminder.service';
import { JobDigestService } from './application/job-digest.service';
import { NotificationDedupService } from './application/notification-dedup.service';
import { NotificationDispatcher } from './application/notification-dispatcher.service';
import { NotificationListService } from './application/notification-list.service';
import { NotificationsService } from './application/notifications.service';
import { DEVICE_TOKEN_REPOSITORY } from './domain/device-token.repository';
import { EXPIRY_REMINDER_REPOSITORY } from './domain/expiry-reminder.repository';
import { JOB_DIGEST_REPOSITORY } from './domain/job-digest.repository';
import { NOTIFICATION_DEDUP_REPOSITORY } from './domain/notification-dedup.repository';
import { NOTIFICATION_REPOSITORY } from './domain/notification.repository';
import { DeviceTokenPrismaRepository } from './infrastructure/device-token.prisma.repository';
import { ExpiryReminderPrismaRepository } from './infrastructure/expiry-reminder.prisma.repository';
import { JobDigestPrismaRepository } from './infrastructure/job-digest.prisma.repository';
import { NotificationDedupPrismaRepository } from './infrastructure/notification-dedup.prisma.repository';
import { NotificationPrismaRepository } from './infrastructure/notification.prisma.repository';
import { DevicesController } from './presentation/devices.controller';
import { NotificationsController } from './presentation/notifications.controller';

/**
 * Notifications, in all three senses the app uses the word:
 *
 *  - the push that reaches a locked phone (`NotificationsService` + device tokens, chat.md C8);
 *  - the in-app list that keeps the history (`NotificationListService`, 01-NOTIFICATIONS);
 *  - the catalogue that decides what gets sent and when (`NotificationDispatcher`, 02-PUSH_CATALOG).
 *
 * `PushModule` (global) provides the push provider; `PresenceModule` answers "is their socket open".
 * `ChatModule` arrives through `forwardRef` — it needs this module to push, and this module needs
 * its unread-message count for the badge (§4.2).
 *
 * `NotificationDispatcher` is exported because every feature that raises an event calls it: chat,
 * connections, calls, admin moderation and the crons.
 */
@Module({
  imports: [PrismaModule, PresenceModule, JwtModule.register({}), forwardRef(() => ChatModule)],
  controllers: [DevicesController, NotificationsController],
  providers: [
    NotificationsService,
    NotificationListService,
    NotificationDispatcher,
    NotificationDedupService,
    ExpiryReminderService,
    JobDigestService,
    JwtAuthGuard,
    StudentGuard,
    { provide: DEVICE_TOKEN_REPOSITORY, useClass: DeviceTokenPrismaRepository },
    { provide: NOTIFICATION_REPOSITORY, useClass: NotificationPrismaRepository },
    { provide: NOTIFICATION_DEDUP_REPOSITORY, useClass: NotificationDedupPrismaRepository },
    { provide: EXPIRY_REMINDER_REPOSITORY, useClass: ExpiryReminderPrismaRepository },
    { provide: JOB_DIGEST_REPOSITORY, useClass: JobDigestPrismaRepository },
  ],
  exports: [
    NotificationsService,
    NotificationListService,
    NotificationDispatcher,
    NotificationDedupService,
    ExpiryReminderService,
    JobDigestService,
    NOTIFICATION_DEDUP_REPOSITORY,
  ],
})
export class NotificationsModule {}
