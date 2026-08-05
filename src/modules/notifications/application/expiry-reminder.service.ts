import { Inject, Injectable } from '@nestjs/common';
import { NotificationCatalog } from '../domain/events/notification-catalog';
import {
  EXPIRY_REMINDER_REPOSITORY,
  ExpiryReminderRepository,
} from '../domain/expiry-reminder.repository';
import {
  DedupKey,
  NOTIFICATION_DEDUP_REPOSITORY,
  NotificationDedupRepository,
} from '../domain/notification-dedup.repository';
import { NotificationDispatcher } from './notification-dispatcher.service';

/** How long before it closes the warning goes out (§5.2's worked example). */
export const EXPIRY_REMINDER_DAYS = 3;

/** One sweep's ceiling, so a backlog is worked through over several ticks rather than in one. */
const SWEEP_LIMIT = 500;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The "closing soon" reminders — §3.3 №8 (the student's own listing) and №10 (a discount they
 * saved).
 *
 * The rule that shapes this is §5.2: **once in a listing's life**, not once a day. The sweep runs
 * every ten minutes and the window is three days wide, so without the ledger a student would be
 * told the same listing is expiring roughly four hundred times. Every send is therefore claimed
 * first, and only the claim that wins produces a notification.
 */
@Injectable()
export class ExpiryReminderService {
  constructor(
    @Inject(EXPIRY_REMINDER_REPOSITORY) private readonly listings: ExpiryReminderRepository,
    @Inject(NOTIFICATION_DEDUP_REPOSITORY) private readonly sent: NotificationDedupRepository,
    private readonly dispatcher: NotificationDispatcher,
  ) {}

  /** Runs both sweeps. Returns how many reminders were actually raised. */
  async sweep(now: Date = new Date()): Promise<number> {
    const until = new Date(now.getTime() + EXPIRY_REMINDER_DAYS * MS_PER_DAY);
    const [own, saved] = await Promise.all([
      this.sweepOwnListings(now, until),
      this.sweepSavedDiscounts(now, until),
    ]);
    return own + saved;
  }

  private async sweepOwnListings(now: Date, until: Date): Promise<number> {
    const rows = await this.listings.findExpiringStudentListings(now, until, SWEEP_LIMIT);
    let sent = 0;
    for (const row of rows) {
      if (!(await this.sent.claim(DedupKey.studentListingExpiry(row.listingId)))) {
        continue;
      }
      await this.dispatcher.dispatch(
        NotificationCatalog.listingExpiring({
          recipientId: row.ownerId,
          listingTitle: row.title,
          days: daysUntil(row.validTo, now),
        }),
      );
      sent += 1;
    }
    return sent;
  }

  private async sweepSavedDiscounts(now: Date, until: Date): Promise<number> {
    const rows = await this.listings.findExpiringSavedDiscounts(now, until, SWEEP_LIMIT);
    let sent = 0;
    for (const row of rows) {
      if (!(await this.sent.claim(DedupKey.discountExpiry(row.listingId, row.studentId)))) {
        continue;
      }
      await this.dispatcher.dispatch(
        NotificationCatalog.discountExpiring({
          recipientId: row.studentId,
          listingId: row.listingId,
          merchant: row.merchant,
          discount: row.discount,
          days: daysUntil(row.validTo, now),
        }),
      );
      sent += 1;
    }
    return sent;
  }
}

/**
 * Whole days left, rounded **up** and never below one.
 *
 * Rounding down would say "0 kundan keyin yopiladi" for anything closing later today, which reads
 * as a bug to the person holding the phone.
 */
export function daysUntil(validTo: Date, now: Date): number {
  return Math.max(1, Math.ceil((validTo.getTime() - now.getTime()) / MS_PER_DAY));
}
