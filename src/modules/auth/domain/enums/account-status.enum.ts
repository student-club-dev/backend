/**
 * Account lifecycle state (D6 — both `students` and `business_owners` carry it). Only ACTIVE
 * accounts may log in or refresh; BANNED is set by the admin ban action. Wire values match the
 * Prisma `StudentStatus` / `BusinessOwnerStatus` enums.
 *
 * DELETED is no longer reachable — account deletion removes the row (15-deletion.md), so there is
 * no account left to carry a status. It is kept because legacy soft-deleted rows may still hold it,
 * and the `!== ACTIVE` login check below keeps locking those out either way.
 */
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
  DELETED = 'DELETED',
}
