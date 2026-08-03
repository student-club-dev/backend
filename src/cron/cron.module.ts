import { Module } from '@nestjs/common';
import { CallsModule } from '../modules/calls/calls.module';
import { ChatModule } from '../modules/chat/chat.module';
import { ListingsModule } from '../modules/listings/listings.module';
import { MediaModule } from '../modules/media/media.module';
import { StoriesModule } from '../modules/stories/stories.module';
import { CallReconciliationCron } from './call-reconciliation.cron';
import { ListingStatusCron } from './listing-status.cron';
import { MessagePurgeCron } from './message-purge.cron';
import { OrphanMediaCron } from './orphan-media.cron';
import { StoryCleanupCron } from './story-cleanup.cron';
import { UploadSessionCron } from './upload-session.cron';

/**
 * Scheduled jobs. Imports ListingsModule for the listing status sweep (BACKEND_PROMPT §7) and
 * CallsModule for `CALL_REPOSITORY` (the call reconciliation sweep). The `ScheduleModule.forRoot()`
 * that powers `@Cron` is registered once in AppModule.
 */
@Module({
  imports: [CallsModule, ChatModule, ListingsModule, MediaModule, StoriesModule],
  providers: [
    CallReconciliationCron,
    ListingStatusCron,
    MessagePurgeCron,
    OrphanMediaCron,
    StoryCleanupCron,
    UploadSessionCron,
  ],
})
export class CronModule {}
