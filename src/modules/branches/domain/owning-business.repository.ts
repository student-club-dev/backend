/** Injection token for the owning-business lookup port (bound to the Prisma impl in the module). */
export const OWNING_BUSINESS_REPOSITORY = Symbol('OWNING_BUSINESS_REPOSITORY');

/**
 * Read-only access to the owning `businesses` aggregate — just what the branch use-cases need to
 * resolve ownership. The business aggregate itself is owned by the business module.
 */
export interface OwningBusinessRepository {
  /** The business owner's account id; `null` when the business does not exist or is archived. */
  findOwnerId(businessId: string): Promise<string | null>;
}
