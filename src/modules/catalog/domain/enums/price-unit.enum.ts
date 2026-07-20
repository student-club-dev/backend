/**
 * Price unit for a business type. Wire values match PriceUnitDto in the OpenAPI contract.
 */
export enum PriceUnit {
  PER_ITEM = 'PER_ITEM',
  PER_HOUR = 'PER_HOUR',
  PER_KG = 'PER_KG',
  PER_MONTH = 'PER_MONTH',
  PER_COURSE = 'PER_COURSE',
  PER_LESSON = 'PER_LESSON',
  PER_TICKET = 'PER_TICKET',
  PER_PERSON = 'PER_PERSON',
  PER_SESSION = 'PER_SESSION',
}
