import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UploadSessionService } from '../modules/media/application/upload-session.service';

/**
 * Removes resumable uploads that were started and never finished (parity spec §7).
 *
 * The counterpart to the 24-hour TTL. A session is deliberately long-lived so that a send
 * interrupted on the metro can be resumed after it, which also means every abandoned pick leaves its
 * parts on disk until something clears them. Runs hourly rather than daily: parts are whole files
 * rather than the thumbnails the orphan sweep deals with, so leaving a day's worth of them lying
 * around is a real amount of disk.
 */
@Injectable()
export class UploadSessionCron {
  private readonly logger = new Logger(UploadSessionCron.name);

  constructor(private readonly uploads: UploadSessionService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    const removed = await this.uploads.sweepExpired();
    if (removed > 0) {
      this.logger.log(`Removed ${removed} expired upload session(s)`);
    }
  }
}
