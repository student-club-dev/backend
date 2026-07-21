import {
  type TradeCenter as TradeCenterRow,
  type TradeCenterField as TradeCenterFieldRow,
} from '@prisma/client';
import {
  TradeCenter,
  TradeCenterField,
  TradeCenterWithFields,
} from '../domain/entities/trade-center.entity';
import { TradeCenterFieldType } from '../domain/enums/trade-center-field-type.enum';

/**
 * Maps Prisma trade-center rows to domain entities. The Prisma `TradeCenterFieldType` enum carries
 * the same wire values as the domain enum, so it is looked up by key.
 */
export class TradeCenterMapper {
  static toDomain(row: TradeCenterRow): TradeCenter {
    return { id: row.id, name: row.name, slug: row.slug };
  }

  static toDomainWithFields(
    row: TradeCenterRow & { fields: TradeCenterFieldRow[] },
  ): TradeCenterWithFields {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      fields: row.fields.map((field) => TradeCenterMapper.toField(field)),
    };
  }

  static toField(row: TradeCenterFieldRow): TradeCenterField {
    return {
      id: row.id,
      label: row.label,
      type: TradeCenterFieldType[row.type],
      required: row.required,
      sortOrder: row.sortOrder,
    };
  }
}
