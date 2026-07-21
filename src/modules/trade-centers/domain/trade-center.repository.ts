import { TradeCenter, TradeCenterWithFields } from './entities/trade-center.entity';

/** Injection token for the trade-center repository port (bound to the Prisma impl in the module). */
export const TRADE_CENTER_REPOSITORY = Symbol('TRADE_CENTER_REPOSITORY');

/**
 * Trade-center data-access port (read-only reference data). The application layer depends on this
 * interface only; the Prisma implementation lives in the infrastructure layer.
 */
export interface TradeCenterRepository {
  /** ACTIVE centers only, ordered by sortOrder then name. Fields are not included. */
  findActive(): Promise<TradeCenter[]>;

  /**
   * One ACTIVE center with its fields (ordered by sortOrder). Returns `null` when the center
   * does not exist or is INACTIVE.
   */
  findActiveByIdWithFields(id: string): Promise<TradeCenterWithFields | null>;
}
