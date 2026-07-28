/**
 * Result order for the admin business list (`GET /v1/admin/businesses`). Pure TS enum — the
 * infrastructure repository maps it to the Prisma `orderBy`. `NEWEST` (the default) is newest first,
 * `OLDEST` oldest first, `NAME` alphabetical by business name.
 */
export enum AdminBusinessSort {
  NEWEST = 'NEWEST',
  OLDEST = 'OLDEST',
  NAME = 'NAME',
}
