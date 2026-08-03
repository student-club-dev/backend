import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StoriesService } from '../modules/stories/application/stories.service';

/**
 * Reclaims the disk behind stories nobody can reach any more.
 *
 * Neither job is what makes a story disappear. Every feed read filters on `expiresAt > now()` and
 * every read filters on `deletedAt`, so a story leaves the feed the instant it expires and leaves
 * everything the instant it is deleted, whether or not these have run. That separation is the point:
 * a stalled cron can cost disk, but it can never resurface something a user expected to be gone.
 */
@Injectable()
export class StoryCleanupCron {
  private readonly logger = new Logger(StoryCleanupCron.name);

  constructor(private readonly stories: StoriesService) {}

  /**
   * Stories the author deleted, bytes and rows. Ten-minute tick with a one-day grace period, so a
   * copy still sitting in a CDN or an in-flight request has somewhere to point.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepDeleted(): Promise<void> {
    const removed = await this.stories.purgeDeleted();
    if (removed > 0) {
      this.logger.log(`Purged ${removed} deleted stor${removed === 1 ? 'y' : 'ies'}`);
    }
  }

  /**
   * Files behind archived stories past the retention window. The rows stay — the author keeps the
   * post as an empty cell — so this only ever frees bytes.
   *
   * Daily rather than every ten minutes: the boundary it sweeps moves by a day at a time, and at
   * 3am it competes with nothing.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweepArchive(): Promise<void> {
    const purged = await this.stories.purgeArchivedMedia();
    if (purged > 0) {
      this.logger.log(
        `Reclaimed the files of ${purged} archived stor${purged === 1 ? 'y' : 'ies'}`,
      );
    }
  }
}
