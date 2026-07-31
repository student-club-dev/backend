/**
 * Who may see a student's `phoneNumber` on their summary.
 *
 * Defaults to `NOBODY`, which is the one place this differs from `LastSeenVisibility`: a student
 * handed us their number to sign in with, not to publish. Anything else would opt every existing
 * account into spam calls without ever asking them.
 *
 * Domain enum (pure TS) — mapped from the Prisma enum inside the infrastructure layer.
 */
export enum PhoneVisibility {
  EVERYONE = 'EVERYONE',
  CONNECTIONS = 'CONNECTIONS',
  NOBODY = 'NOBODY',
}
