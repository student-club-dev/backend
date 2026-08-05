import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_DEDUP_REPOSITORY,
  NotificationDedupRepository,
} from '../domain/notification-dedup.repository';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Housekeeping for the send-once ledger. Claiming happens where the decision is made, not here. */
@Injectable()
export class NotificationDedupService {
  constructor(
    @Inject(NOTIFICATION_DEDUP_REPOSITORY) private readonly ledger: NotificationDedupRepository,
  ) {}

  purgeOlderThan(retentionDays: number, now: Date = new Date()): Promise<number> {
    return this.ledger.purgeOlderThan(new Date(now.getTime() - retentionDays * MS_PER_DAY));
  }
}
