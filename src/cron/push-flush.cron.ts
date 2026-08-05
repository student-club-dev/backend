import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationDispatcher } from '../modules/notifications/application/notification-dispatcher.service';

/**
 * Sends the pushes that quiet hours held back (push catalogue §5.3).
 *
 * Every ten minutes rather than once at 08:00. A single daily tick would mean that a restart, a
 * deploy or one failed run at exactly the wrong minute costs a whole night's notifications — and
 * they would never be retried, because nothing else looks at that column. Ten minutes makes the
 * flush self-healing at the cost of a query that almost always returns nothing: the index covers
 * only the handful of rows that are actually waiting.
 *
 * A held push is never *lost* in any case. The in-app row was written the moment the event
 * happened; this only decides when the phone lights up.
 */
@Injectable()
export class PushFlushCron {
  private readonly logger = new Logger(PushFlushCron.name);

  constructor(private readonly dispatcher: NotificationDispatcher) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async flush(): Promise<void> {
    try {
      const sent = await this.dispatcher.flushDeferredPushes();
      if (sent > 0) {
        this.logger.log(`Sent ${sent} push(es) held over quiet hours`);
      }
    } catch (error) {
      // `cron` invokes a tick unguarded and this app installs no global unhandledRejection handler,
      // so an escaping rejection would kill the process. Swallow and let the next tick retry.
      this.logger.error({ err: error }, 'deferred push flush failed');
    }
  }
}
