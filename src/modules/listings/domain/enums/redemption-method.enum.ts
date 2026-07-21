/**
 * How a student redeems a listing's discount (LISTINGS.md §7). Wire values match RedemptionMethodDto
 * in the OpenAPI contract and the Prisma `RedemptionMethod` enum.
 */
export enum RedemptionMethod {
  QR = 'QR',
  PROMO_CODE = 'PROMO_CODE',
  STUDENT_ID = 'STUDENT_ID',
  ONLINE_LINK = 'ONLINE_LINK',
}
