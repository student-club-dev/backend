/**
 * `details.categoryKey` values for a JOB listing (§4.4).
 *
 * Permanent keys — stored listings and client-side filters both depend on them. Labels live on the
 * client and later in the §7.3 catalog endpoint.
 */
export const JOB_CATEGORY_KEYS: readonly string[] = [
  'COURIER',
  'WAITER',
  'BARISTA',
  'COOK_HELPER',
  'CASHIER',
  'SALES',
  'PROMOTER',
  'CALL_CENTER',
  'LOADER',
  'WAREHOUSE',
  'CLEANER',
  'ANIMATOR',
  'TUTOR_JOB',
  'ADMIN',
  'SMM',
  'IT',
  'DESIGNER',
  'DRIVER',
  'SECURITY',
  'BUILDER',
  'OTHER',
];

export function isKnownJobCategoryKey(key: string): boolean {
  return JOB_CATEGORY_KEYS.includes(key);
}
