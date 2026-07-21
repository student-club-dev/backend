/**
 * How a listing's discount is expressed (LISTINGS.md §4). Wire values match DiscountTypeDto in the
 * OpenAPI contract and the Prisma `DiscountType` enum.
 */
export enum DiscountType {
  PERCENT = 'PERCENT',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  SPECIAL_PRICE = 'SPECIAL_PRICE',
  FREE_ITEM = 'FREE_ITEM',
}
