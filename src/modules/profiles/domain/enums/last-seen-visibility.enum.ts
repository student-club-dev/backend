/**
 * Who may see a student's `online` / `lastSeenAt` (C7 privacy, Telegram-style).
 * Wire values match LastSeenVisibilityDto in the OpenAPI contract.
 * Domain enum (pure TS) — mapped from the Prisma enum inside the infrastructure layer.
 */
export enum LastSeenVisibility {
  EVERYONE = 'EVERYONE',
  CONNECTIONS = 'CONNECTIONS',
  NOBODY = 'NOBODY',
}
