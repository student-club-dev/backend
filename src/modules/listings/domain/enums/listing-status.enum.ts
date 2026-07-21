/**
 * Lifecycle status of a listing. Wire values match ListingStatusDto in the OpenAPI contract and the
 * Prisma `ListingStatus` enum. Create persists a listing as DRAFT.
 */
export enum ListingStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED',
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  EXPIRED = 'EXPIRED',
  SOLD_OUT = 'SOLD_OUT',
  ARCHIVED = 'ARCHIVED',
}
