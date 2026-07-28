import { TradeCenterField } from '../../../trade-centers/domain/entities/trade-center.entity';
import { TradeCenterStatus } from '../enums/trade-center-status.enum';

/**
 * A trade center as the admin panel sees it — including `status` (so INACTIVE centers are visible)
 * and `sortOrder`, unlike the public {@link TradeCenter} projection. Pure domain type.
 */
export interface AdminTradeCenter {
  id: string;
  name: string;
  slug: string;
  status: TradeCenterStatus;
  sortOrder: number;
}

/** An admin trade center together with its fields (ordered by sortOrder). */
export type AdminTradeCenterDetail = AdminTradeCenter & { fields: TradeCenterField[] };
