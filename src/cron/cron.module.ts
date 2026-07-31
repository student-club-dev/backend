import { Module } from '@nestjs/common';
import { ChatModule } from '../modules/chat/chat.module';
import { ListingsModule } from '../modules/listings/listings.module';
import { MediaModule } from '../modules/media/media.module';
import { StoriesModule } from '../modules/stories/stories.module';
import { ListingStatusCron } from './listing-status.cron';
import { MessagePurgeCron } from './message-purge.cron';
import { OrphanMediaCron } from './orphan-media.cron';
import { StoryCleanupCron } from './story-cleanup.cron';

/**
 * Scheduled jobs. Imports ListingsModule for the listing status sweep (BACKEND_PROMPT §7). The
 * `ScheduleModule.forRoot()` that powers `@Cron` is registered once in AppModule.
 */
@Module({
  imports: [ChatModule, ListingsModule, MediaModule, StoriesModule],
  providers: [ListingStatusCron, MessagePurgeCron, OrphanMediaCron, StoryCleanupCron],
})
export class CronModule {}
