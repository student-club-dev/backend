import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StoriesService } from '../modules/stories/application/stories.service';

/**
 * Reclaims the disk behind expired stories.
 *
 * This job is **not** what makes a story disappear — every read filters on `expiresAt > now()`, so a
 * story is invisible the instant it expires whether or not this has run. That separation is the
 * point: a stalled cron can cost disk, but it can never resurface something a user expected to be
 * gone.
 *
 * Runs on a ten-minute tick with a one-day grace period after expiry, so a copy still sitting in a
 * CDN or an in-flight request has somewhere to point.
 */
@Injectable()
export class StoryCleanupCron {
  private readonly logger = new Logger(StoryCleanupCron.name);

  constructor(private readonly stories: StoriesService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    const removed = await this.stories.purgeExpired();
    if (removed > 0) {
      this.logger.log(`Purged ${removed} expired stor${removed === 1 ? 'y' : 'ies'}`);
    }
  }
}
