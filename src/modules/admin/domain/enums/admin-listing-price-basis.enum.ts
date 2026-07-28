/**
 * Which price column the `priceMin`/`priceMax` filter compares against on the admin listing list.
 * `FINAL` (the default) compares the server-computed `finalPrice`; `ORIGINAL` the pre-discount price.
 */
export enum AdminListingPriceBasis {
  FINAL = 'FINAL',
  ORIGINAL = 'ORIGINAL',
}
