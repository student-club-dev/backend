/** Injection token for the business-owner lookup port (bound to the Prisma impl in the module). */
export const BUSINESS_OWNER_REPOSITORY = Symbol('BUSINESS_OWNER_REPOSITORY');

/**
 * Read-only access to the owning `business_owners` account — just what the business use-cases
 * need (the D1 phone-verification gate). The account aggregate itself is owned by auth/profiles.
 */
export interface BusinessOwnerRepository {
  /** The owner's `phoneVerified` flag; `null` when the account does not exist. */
  findPhoneVerified(ownerId: string): Promise<boolean | null>;
}
