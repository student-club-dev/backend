import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  STUDENT_LISTING_REPOSITORY,
  type StudentListingRepository,
} from '../modules/student-listings/domain/student-listing.repository';

/**
 * Time-driven status transitions for student listings (§6).
 *
 * Nothing else moves a listing when a date passes: the owner is not going to open the app to
 * archive an expired advert, so without this sweep the feed keeps serving flats already taken and
 * tasks whose deadline is gone — the two things that make a listings app feel abandoned.
 *
 * Every ten minutes, matching the spec. Finer would be pointless (a listing that expired eight
 * minutes ago is not a problem) and coarser starts to show.
 */
@Injectable()
export class StudentListingStatusCron {
  private readonly logger = new Logger(StudentListingStatusCron.name);

  constructor(
    @Inject(STUDENT_LISTING_REPOSITORY)
    private readonly repository: StudentListingRepository,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    try {
      const counts = await this.repository.applyStatusTransitions(new Date());
      if (counts.expired > 0 || counts.activated > 0) {
        this.logger.log(
          { expired: counts.expired, activated: counts.activated },
          'student listing status sweep',
        );
      }
    } catch (error) {
      // The `cron` package invokes a tick unguarded and this app installs no global
      // unhandledRejection handler, so an escaping rejection would kill the process this sweep
      // exists to serve. Swallow it and let the next tick retry.
      this.logger.error({ err: error }, 'student listing status sweep failed');
    }
  }
}
