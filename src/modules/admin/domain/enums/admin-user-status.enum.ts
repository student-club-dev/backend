/**
 * Account lifecycle state as the admin panel sees it — shared by students and business owners.
 * Mirrors the Prisma `StudentStatus` / `BusinessOwnerStatus` wire values. The ban/unban actions
 * toggle ACTIVE <-> BANNED.
 *
 * DELETED is no longer reachable: account deletion is a row delete (15-deletion.md), so a deleted
 * account has no status because it has no row. The value is kept only because rows written by the
 * old soft-delete may still carry it; nothing sets it now, and `?status=DELETED` will match those
 * legacy rows and nothing else.
 */
export enum AdminUserStatus {
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
  DELETED = 'DELETED',
}
