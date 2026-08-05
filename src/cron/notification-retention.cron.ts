import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env';
import { NotificationListService } from '../modules/notifications/application/notification-list.service';

/**
 * Deletes notifications past the retention window (spec §1.3).
 *
 * Unlike the story sweeps this one is the *only* thing bounding the table: nothing filters on age
 * at read time, because a 90-day-old notification is still a perfectly good notification right up
 * until it is deleted. A stalled cron therefore costs rows, never correctness — the list simply
 * keeps more history than promised.
 *
 * Daily at 4am: the boundary moves a day at a time, and it stays clear of the 3am story sweep.
 */
@Injectable()
export class NotificationRetentionCron {
  private readonly logger = new Logger(NotificationRetentionCron.name);

  constructor(
    private readonly notifications: NotificationListService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweep(): Promise<void> {
    const days = this.config.get('NOTIFICATION_RETENTION_DAYS', { infer: true });
    const removed = await this.notifications.purgeOlderThan(days);
    if (removed > 0) {
      this.logger.log(`Purged ${removed} notification(s) older than ${days} days`);
    }
  }
}
