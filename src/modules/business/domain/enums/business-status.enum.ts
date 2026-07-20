/**
 * Business lifecycle status. Wire values match BusinessStatusDto in the OpenAPI contract
 * (DRAFT → PENDING_REVIEW → APPROVED | REJECTED, plus BLOCKED). ARCHIVED is the soft-delete
 * terminal state (DELETE /business/:id) — it is never surfaced over the wire (archived
 * businesses are excluded from list responses and 404 on read).
 */
export enum BusinessStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  BLOCKED = 'BLOCKED',
  ARCHIVED = 'ARCHIVED',
}
