import { Module } from '@nestjs/common';
import { ListingsModule } from '../modules/listings/listings.module';
import { MediaModule } from '../modules/media/media.module';
import { StoriesModule } from '../modules/stories/stories.module';
import { ListingStatusCron } from './listing-status.cron';
import { OrphanMediaCron } from './orphan-media.cron';
import { StoryCleanupCron } from './story-cleanup.cron';

/**
 * Scheduled jobs. Imports ListingsModule for the listing status sweep (BACKEND_PROMPT §7). The
 * `ScheduleModule.forRoot()` that powers `@Cron` is registered once in AppModule.
 */
@Module({
  imports: [ListingsModule, MediaModule, StoriesModule],
  providers: [ListingStatusCron, OrphanMediaCron, StoryCleanupCron],
})
export class CronModule {}
