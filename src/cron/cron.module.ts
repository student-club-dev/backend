import { Module } from '@nestjs/common';
import { CallsModule } from '../modules/calls/calls.module';
import { ChatModule } from '../modules/chat/chat.module';
import { ListingsModule } from '../modules/listings/listings.module';
import { MediaModule } from '../modules/media/media.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { StoriesModule } from '../modules/stories/stories.module';
import { StudentListingsModule } from '../modules/student-listings/student-listings.module';
import { CallReconciliationCron } from './call-reconciliation.cron';
import { ExpiryReminderCron } from './expiry-reminder.cron';
import { JobDigestCron } from './job-digest.cron';
import { ListingStatusCron } from './listing-status.cron';
import { MessagePurgeCron } from './message-purge.cron';
import { NotificationRetentionCron } from './notification-retention.cron';
import { PushFlushCron } from './push-flush.cron';
import { OrphanMediaCron } from './orphan-media.cron';
import { StoryCleanupCron } from './story-cleanup.cron';
import { StudentListingStatusCron } from './student-listing-status.cron';
import { UploadSessionCron } from './upload-session.cron';

/**
 * Scheduled jobs. Imports ListingsModule for the business listing status sweep (BACKEND_PROMPT §7),
 * StudentListingsModule for the student-listing one (STUDENT_LISTINGS_BACKEND.md §6),
 * CallsModule for `CALL_REPOSITORY` (the call reconciliation sweep) and NotificationsModule for the
 * 90-day notification retention sweep. The `ScheduleModule.forRoot()` that powers `@Cron` is
 * registered once in AppModule.
 */
@Module({
  imports: [
    CallsModule,
    ChatModule,
    ListingsModule,
    MediaModule,
    NotificationsModule,
    StoriesModule,
    StudentListingsModule,
  ],
  providers: [
    CallReconciliationCron,
    ExpiryReminderCron,
    JobDigestCron,
    ListingStatusCron,
    MessagePurgeCron,
    NotificationRetentionCron,
    OrphanMediaCron,
    PushFlushCron,
    StoryCleanupCron,
    StudentListingStatusCron,
    UploadSessionCron,
  ],
})
export class CronModule {}
