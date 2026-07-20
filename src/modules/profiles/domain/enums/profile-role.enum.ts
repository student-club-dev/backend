/**
 * Profile role. Wire values match ProfileRoleDto in the OpenAPI contract.
 * The two account tables only ever produce STUDENT or BUSINESS (derived from the account
 * type); EMPLOYER / UNIVERSITY exist in the contract and are accepted on input but never
 * persisted — role is read-only and always reflects the authenticated account.
 */
export enum ProfileRole {
  STUDENT = 'STUDENT',
  BUSINESS = 'BUSINESS',
  EMPLOYER = 'EMPLOYER',
  UNIVERSITY = 'UNIVERSITY',
}
