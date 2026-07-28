/**
 * Account lifecycle state as the admin panel sees it — shared by students and business owners.
 * Mirrors the Prisma `StudentStatus` / `BusinessOwnerStatus` wire values. DELETED is reserved for
 * the account-delete run; the ban/unban actions toggle ACTIVE <-> BANNED.
 */
export enum AdminUserStatus {
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
  DELETED = 'DELETED',
}
