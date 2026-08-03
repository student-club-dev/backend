/**
 * How widely a listing is shown (§7.2.4). Phase 1 stores the value but always behaves as ALL —
 * enforcement needs the universities table, which does not exist yet.
 *
 * Deferring is safe in one direction only: a restricted listing would be MORE visible than its
 * owner asked. No such row can exist yet, because the client cannot offer the choice until the
 * university picker ships alongside the Phase 2 backend work.
 */
export enum ListingAudience {
  ALL = 'ALL',
  NEARBY_UNIVERSITIES = 'NEARBY_UNIVERSITIES',
  MY_UNIVERSITY = 'MY_UNIVERSITY',
}
