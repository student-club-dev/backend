import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatService } from '../modules/chat/application/chat.service';

/**
 * Physically removes chat messages every member has already cleared past (§B1) — the only place a
 * message row is ever really deleted. Weekly, since the rows are invisible either way.
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
      // Never rethrow — a failed sweep must not take the scheduler down.
      this.logger.error('Message purge failed', error);
    }
  }
}
