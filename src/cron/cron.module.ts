import { Module } from '@nestjs/common';
import { ListingsModule } from '../modules/listings/listings.module';
import { ListingStatusCron } from './listing-status.cron';

/**
 * Scheduled jobs. Imports ListingsModule for the listing status sweep (BACKEND_PROMPT §7). The
 * `ScheduleModule.forRoot()` that powers `@Cron` is registered once in AppModule.
 */
@Module({
  imports: [ListingsModule],
  providers: [ListingStatusCron],
})
export class CronModule {}
