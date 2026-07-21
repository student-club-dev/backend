/**
 * The input type of a trade-center dynamic field. Wire values match the Prisma
 * `TradeCenterFieldType` enum (mapped in infrastructure). Extensible later
 * (SELECT, BOOLEAN, DATE, PHONE) — see docs/api/provider/TRADE_CENTERS.md §8.
 */
export enum TradeCenterFieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
}
