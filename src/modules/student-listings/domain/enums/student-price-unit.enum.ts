/**
 * Price units for a student listing (§2.3).
 *
 * Deliberately not the shared `PriceUnit`: the two extra values this contract needs (PER_DAY for
 * daily rent, PER_PAGE for printing) would, if added there, silently widen the business listing
 * API too — its generated provider client would then be out of sync with what the server accepts.
 * The wire strings are identical, so the mobile contract is met either way.
 */
export enum StudentPriceUnit {
  PER_ITEM = 'PER_ITEM',
  PER_HOUR = 'PER_HOUR',
  PER_KG = 'PER_KG',
  PER_DAY = 'PER_DAY',
  PER_MONTH = 'PER_MONTH',
  PER_COURSE = 'PER_COURSE',
  PER_LESSON = 'PER_LESSON',
  PER_TICKET = 'PER_TICKET',
  PER_PERSON = 'PER_PERSON',
  PER_SESSION = 'PER_SESSION',
  PER_PAGE = 'PER_PAGE',
}
