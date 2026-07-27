/**
 * Lifecycle of a redemption. A student's `start` creates a PENDING code; the cashier's `confirm`
 * moves it to CONFIRMED. A PENDING code past its `expiresAt` is treated as EXPIRED. Wire values
 * match the Prisma `RedemptionStatus` enum.
 */
export enum RedemptionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  EXPIRED = 'EXPIRED',
}
