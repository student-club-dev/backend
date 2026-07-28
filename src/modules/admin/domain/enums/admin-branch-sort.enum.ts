/**
 * Result order for the admin branch list (`GET /v1/admin/branches`). Pure TS enum — the
 * infrastructure repository maps it to the Prisma `orderBy`. `NEWEST` (the default) is newest first,
 * `NAME` alphabetical by branch name.
 */
export enum AdminBranchSort {
  NEWEST = 'NEWEST',
  NAME = 'NAME',
}
