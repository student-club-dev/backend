import { Module } from '@nestjs/common';
import { ListingsModule } from '../modules/listings/listings.module';
import { MediaModule } from '../modules/media/media.module';
import { ListingStatusCron } from './listing-status.cron';
import { OrphanMediaCron } from './orphan-media.cron';

/**
 * Scheduled jobs. Imports ListingsModule for the listing status sweep (BACKEND_PROMPT §7). The
 * `ScheduleModule.forRoot()` that powers `@Cron` is registered once in AppModule.
 */
@Module({
  imports: [ListingsModule, MediaModule],
  providers: [ListingStatusCron, OrphanMediaCron],
})
export class CronModule {}
