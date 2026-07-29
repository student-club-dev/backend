import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatMediaService } from '../modules/media/application/chat-media.service';

/**
 * Deletes chat uploads that were never sent (chat media spec §1.4).
 *
 * Picking a photo uploads it before the message exists, so abandoning the send leaves bytes on disk
 * with nothing pointing at them. Without this the media directory grows forever on exactly the
 * files nobody ever saw.
 */
@Injectable()
export class OrphanMediaCron {
  private readonly logger = new Logger(OrphanMediaCron.name);

  constructor(private readonly media: ChatMediaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweep(): Promise<void> {
    const removed = await this.media.deleteOrphans();
    if (removed > 0) {
      this.logger.log(`Removed ${removed} unsent chat upload(s)`);
    }
  }
}
