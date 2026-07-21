import { TradeCenterFieldType } from '../enums/trade-center-field-type.enum';

/**
 * A trade center (savdo markazi) — additional structured location metadata a branch can sit in.
 * Pure domain type: the presentation layer projects it to TradeCenterDto and the infrastructure
 * layer maps it from the Prisma row.
 */
export interface TradeCenter {
  id: string;
  name: string;
  slug: string;
}

/** One dynamic field of a trade center (e.g. "Qator", "Pavilon"), used to build the branch form. */
export interface TradeCenterField {
  id: string;
  label: string;
  type: TradeCenterFieldType;
  required: boolean;
  sortOrder: number;
}

/** A trade center together with its fields (ordered by sortOrder). */
export type TradeCenterWithFields = TradeCenter & { fields: TradeCenterField[] };
