import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MAX_DURATION_MS } from '../modules/calls/application/calls.service';
import { CALL_REPOSITORY, CallRepository } from '../modules/calls/domain/call.repository';

/**
 * Backstop for calls Redis or BullMQ lost.
 *
 * The design rejected a cron sweeper as the PRIMARY timer — 45 seconds of ringing must be 45, not
 * 50. This is the other thing: a safety net at cron granularity. Without it a call whose live state
 * vanished stays RINGING in Postgres forever, and the user sees a call that never ends in their
 * history.
 *
 * ⚠️ `expireStale` is a bulk `updateMany`: it does NOT go through `CallsService.closeCall`, so a
 * call closed here publishes nothing to `CallEndedBus` and gets no CALL message in the conversation,
 * and emits no `call:ended`. Accepted: this only ever touches calls already past the 4-hour cap,
 * whose sockets are long gone and whose "missing" chat row would be a message about a call that
 * ended hours ago. The history row itself is corrected, which is what this sweep is for.
 */
@Injectable()
export class CallReconciliationCron {
  private readonly logger = new Logger(CallReconciliationCron.name);

  constructor(@Inject(CALL_REPOSITORY) private readonly calls: CallRepository) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    // This cron exists to protect availability, so it must never be the thing that ends it: the
    // underlying `cron` package invokes this tick unguarded (no `.catch()`), and this repo has no
    // global unhandledRejection handler, so an uncaught throw here would crash the whole process.
    try {
      const closed = await this.calls.expireStale(new Date(Date.now() - MAX_DURATION_MS));
      if (closed > 0) {
        this.logger.warn(
          `Reconciliation closed ${closed} call(s) left live past the duration cap — ` +
            'this means live state or a timer job was lost. Check Redis persistence.',
        );
      }
    } catch (error) {
      this.logger.error('Call reconciliation sweep failed', error);
    }
  }
}
