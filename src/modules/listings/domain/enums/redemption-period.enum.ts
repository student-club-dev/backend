/**
 * The window a per-user redemption limit applies over. Wire values match RedemptionPeriodDto in the
 * OpenAPI contract and the Prisma `RedemptionPeriod` enum.
 */
export enum RedemptionPeriod {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  TOTAL = 'TOTAL',
}
