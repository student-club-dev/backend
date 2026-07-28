/**
 * The two account types (D6) — students and business_owners live in separate tables.
 * The value is embedded in the access-token payload and disambiguates the route prefix
 * (`/auth/student` vs `/auth/business`) since the same email may exist in both tables.
 */
export enum AccountType {
  STUDENT = 'student',
  BUSINESS = 'business',
  ADMIN = 'admin',
}
