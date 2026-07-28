/**
 * Discount/regular facet for the admin listing list. `ALL` (the default) keeps every listing;
 * `DISCOUNT` keeps only discounted ones (`isDiscount = true`); `REGULAR` only plain offers.
 */
export enum AdminListingKind {
  ALL = 'ALL',
  DISCOUNT = 'DISCOUNT',
  REGULAR = 'REGULAR',
}
