/**
 * Result order for the admin listing list (`GET /v1/admin/listings`). Pure TS enum — the
 * infrastructure repository maps it to the Prisma `orderBy`. `NEWEST` (the default) is newest first,
 * `OLDEST` oldest first, `PRICE_FINAL` cheapest final price first, `VIEWS` most-viewed first,
 * `ENDING_SOON` by the soonest `validTo`.
 */
export enum AdminListingSort {
  NEWEST = 'NEWEST',
  OLDEST = 'OLDEST',
  PRICE_FINAL = 'PRICE_FINAL',
  VIEWS = 'VIEWS',
  ENDING_SOON = 'ENDING_SOON',
}
