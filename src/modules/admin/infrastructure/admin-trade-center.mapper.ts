import {
  type TradeCenter as TradeCenterRow,
  type TradeCenterField as TradeCenterFieldRow,
} from '@prisma/client';
import { TradeCenterMapper } from '../../trade-centers/infrastructure/trade-center.mapper';
import {
  AdminTradeCenter,
  AdminTradeCenterDetail,
} from '../domain/entities/admin-trade-center.entity';
import { TradeCenterStatus } from '../domain/enums/trade-center-status.enum';

/**
 * Maps Prisma trade-center rows to the admin domain entities (which carry `status` + `sortOrder`).
 * Field rows are mapped by the shared {@link TradeCenterMapper.toField}. The Prisma
 * `TradeCenterStatus` enum carries the same wire values as the domain enum, so it is looked up by key.
 */
export class AdminTradeCenterMapper {
  static toDomain(row: TradeCenterRow): AdminTradeCenter {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: TradeCenterStatus[row.status],
      sortOrder: row.sortOrder,
    };
  }

  static toDomainWithFields(
    row: TradeCenterRow & { fields: TradeCenterFieldRow[] },
  ): AdminTradeCenterDetail {
    return {
      ...AdminTradeCenterMapper.toDomain(row),
      fields: row.fields.map((field) => TradeCenterMapper.toField(field)),
    };
  }
}
