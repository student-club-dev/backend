/**
 * Lifecycle status of a trade center (savdo markazi). Wire values match the Prisma
 * `TradeCenterStatus` enum (mapped in infrastructure). The public read serves ACTIVE only; the
 * admin panel sees and manages both.
 */
export enum TradeCenterStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
