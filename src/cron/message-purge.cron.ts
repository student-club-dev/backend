import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatService } from '../modules/chat/application/chat.service';

/**
 * Physically removes chat messages every member has already cleared past (§B1).
 *
 * Clearing history only raises a watermark, because `seq` has to stay gapless while the other member
 * still reads through it. Once *both* members are above a row, nothing can reach it again and the
 * bytes are pure cost — this is the only place a message row is ever really deleted.
 *
 * The uploads attached to those messages are not deleted here: the FK nulls their `message_id`,
 * which turns them into orphans, and `OrphanMediaCron` already sweeps those nightly. Reports keep
 * their `content_snapshot`, taken at report time, so moderation evidence survives the purge even
 * though the link to the row does not.
 *
 * Weekly, not nightly: the rows are invisible either way, so urgency buys nothing. The sweep issues
 * one delete per affected conversation rather than a single table-wide statement, so its cost tracks
 * the rows it removes and no lock is held across the whole of `messages`.
 */
@Injectable()
export class MessagePurgeCron {
  private readonly logger = new Logger(MessagePurgeCron.name);

  constructor(private readonly chat: ChatService) {}

  @Cron(CronExpression.EVERY_WEEK)
  async purge(): Promise<void> {
    try {
      const removed = await this.chat.purgeClearedMessages();
      if (removed > 0) {
        this.logger.log(`Purged ${removed} fully-cleared chat message(s)`);
      }
    } catch (error) {
      // Never rethrow: a failed sweep must not take the scheduler down with it. The rows stay
      // invisible in the meantime, so the only cost of waiting a week is disk.
      this.logger.error('Message purge failed', error);
    }
  }
}
