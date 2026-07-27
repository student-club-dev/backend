import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ListingsService } from '../modules/listings/application/listings.service';

/**
 * Drives the time/limit-based listing status transitions (BACKEND_PROMPT §7). Every minute: closed
 * windows expire, due SCHEDULED listings go live, and those that hit their redemption limit sell out
 * — keeping the owner's view and the student feed (which shows only ACTIVE, in-window listings)
 * honest. Each sweep is a status-guarded bulk UPDATE, so a missed, slow or overlapping tick is a
 * no-op rather than a double-apply.
 *
 * The MVP runs a single app instance (docker-compose), so there is no distributed lock. With
 * multiple instances every tick would run on each; that stays correct (idempotent) but does
 * redundant work — add a Redis lock here before scaling out.
 */
@Injectable()
export class ListingStatusCron {
  private readonly logger = new Logger(ListingStatusCron.name);

  constructor(private readonly listings: ListingsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    try {
      const { expired, activated, soldOut } = await this.listings.runStatusTransitions();
      if (expired + activated + soldOut > 0) {
        this.logger.log(
          `Listing status sweep: ${activated} activated, ${expired} expired, ${soldOut} sold out`,
        );
      }
    } catch (error) {
      // Log, don't crash the scheduler — the next tick retries.
      this.logger.error(
        `Listing status sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
