/**
 * Account lifecycle state (D6 — both `students` and `business_owners` carry it). Only ACTIVE
 * accounts may log in or refresh; BANNED is set by the admin ban action. DELETED is reserved for
 * the account-delete run. Wire values match the Prisma `StudentStatus` / `BusinessOwnerStatus` enums.
 */
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
  DELETED = 'DELETED',
}
