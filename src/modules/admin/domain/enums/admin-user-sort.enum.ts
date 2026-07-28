/**
 * Result order for the admin cross-user lists (`GET /v1/admin/students`,
 * `GET /v1/admin/business-owners`). Pure TS enum — the infrastructure repository maps it to the
 * Prisma `orderBy`. `NEWEST` (the default) is newest accounts first.
 */
export enum AdminUserSort {
  NEWEST = 'NEWEST',
  OLDEST = 'OLDEST',
}
