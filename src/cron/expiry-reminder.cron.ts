import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env';
import { ExpiryReminderService } from '../modules/notifications/application/expiry-reminder.service';
import { NotificationDedupService } from '../modules/notifications/application/notification-dedup.service';

/**
 * "Closing soon" reminders (push catalogue §3.3 №8/№10) and the ledger that keeps them to one each.
 *
 * The reminder sweep is safe to run often because every send is claimed first — a tick that finds
 * the same listing again simply loses the claim and does nothing. Hourly is enough resolution for a
 * three-day warning and keeps the query off the ten-minute schedule everything else is on.
 */
@Injectable()
export class ExpiryReminderCron {
  private readonly logger = new Logger(ExpiryReminderCron.name);

  constructor(
    private readonly reminders: ExpiryReminderService,
    private readonly dedup: NotificationDedupService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    try {
      const sent = await this.reminders.sweep();
      if (sent > 0) {
        this.logger.log(`Raised ${sent} expiry reminder(s)`);
      }
    } catch (error) {
      // An escaping rejection from a cron tick would take the process with it.
      this.logger.error({ err: error }, 'expiry reminder sweep failed');
    }
  }

  /**
   * Trims the send-once ledger.
   *
   * The retention is deliberately tied to the notification window: a key older than that is about
   * a listing whose reminder has itself already been deleted, so keeping it protects nothing.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeLedger(): Promise<void> {
    try {
      const days = this.config.get('NOTIFICATION_RETENTION_DAYS', { infer: true });
      const removed = await this.dedup.purgeOlderThan(days);
      if (removed > 0) {
        this.logger.log(`Purged ${removed} send-once ledger entr(ies)`);
      }
    } catch (error) {
      this.logger.error({ err: error }, 'dedup ledger purge failed');
    }
  }
}
