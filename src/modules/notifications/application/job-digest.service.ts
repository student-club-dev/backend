import { Inject, Injectable } from '@nestjs/common';
import { NotificationCatalog } from '../domain/events/notification-catalog';
import { tashkentDayOf } from '../domain/events/quiet-hours';
import { JOB_DIGEST_REPOSITORY, JobDigestRepository } from '../domain/job-digest.repository';
import {
  DedupKey,
  NOTIFICATION_DEDUP_REPOSITORY,
  NotificationDedupRepository,
} from '../domain/notification-dedup.repository';
import { NotificationDispatcher } from './notification-dispatcher.service';

/** How far back a digest looks. One day, matching how often it runs. */
const WINDOW_HOURS = 24;

/** Ceiling per run, so one morning cannot fan out unboundedly. */
const DIGEST_LIMIT = 2000;

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The daily "new jobs for you" digest (§3.3 №9, §5.1).
 *
 * §5.1 is the rule that shapes this: **one push a day**, however many listings matched. Twelve
 * separate notifications on a weekday morning is how an app earns having its notifications switched
 * off entirely — and that would take the user's chat notifications with it, which is the real cost.
 *
 * The ledger claim is per student per Tashkent day, so a retry, a second replica or a manual re-run
 * cannot produce a second one.
 */
@Injectable()
export class JobDigestService {
  constructor(
    @Inject(JOB_DIGEST_REPOSITORY) private readonly matches: JobDigestRepository,
    @Inject(NOTIFICATION_DEDUP_REPOSITORY) private readonly sent: NotificationDedupRepository,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  /** Returns how many students were actually notified. */
  async run(now: Date = new Date()): Promise<number> {
    const since = new Date(now.getTime() - WINDOW_HOURS * MS_PER_HOUR);
    const rows = await this.matches.findMatchesSince(since, DIGEST_LIMIT);
    const day = tashkentDayOf(now);

    let sent = 0;
    for (const row of rows) {
      if (!(await this.sent.claim(DedupKey.jobDigest(row.studentId, day)))) {
        continue;
      }
      await this.dispatcher.dispatch(
        NotificationCatalog.jobDigest({
          recipientId: row.studentId,
          count: row.count,
          firstTitle: row.firstTitle,
          firstSubtitle: subtitleOf(row.firstPrice, row.firstCompany),
          firstListingId: row.firstListingId,
        }),
        now,
      );
      sent += 1;
    }
    return sent;
  }
}

/**
 * "<pay> or <company>" (§3.3's wording table). Pay wins when the listing named one — it is the
 * thing a student actually decides on.
 */
export function subtitleOf(price: string | null, company: string | null): string | null {
  if (price !== null && price.length > 0) {
    return `${formatSom(price)} so‘m`;
  }
  return company === null || company.trim().length === 0 ? null : company.trim();
}

/** Thousands separated with a space, the way prices are written locally. */
function formatSom(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
