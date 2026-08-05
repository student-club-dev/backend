import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobDigestService } from '../modules/notifications/application/job-digest.service';

/**
 * The daily job digest (push catalogue §3.3 №9, §5.1).
 *
 * 09:00 Tashkent, stated as a timezone rather than a UTC offset so it stays 09:00 to the student
 * whatever the server is set to. An hour after quiet hours end (§5.3), so the digest goes out as a
 * push straight away instead of being held and flushed — the one notification of the day that is
 * *meant* to arrive in the morning should not depend on the mechanism for ones that were held back.
 */
@Injectable()
export class JobDigestCron {
  private readonly logger = new Logger(JobDigestCron.name);

  constructor(private readonly digest: JobDigestService) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Tashkent' })
  async run(): Promise<void> {
    try {
      const sent = await this.digest.run();
      if (sent > 0) {
        this.logger.log(`Sent ${sent} job digest(s)`);
      }
    } catch (error) {
      // An escaping rejection from a cron tick would take the process with it.
      this.logger.error({ err: error }, 'job digest failed');
    }
  }
}
