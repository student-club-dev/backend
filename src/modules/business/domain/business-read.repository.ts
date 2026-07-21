import { BusinessStatus } from './enums/business-status.enum';

/** Injection token for the Business context's canonical read port (bound to the Prisma impl). */
export const BUSINESS_READ = Symbol('BUSINESS_READ');

/**
 * Minimal cross-context projection of a business, exposed by the Business read port — everything a
 * consuming context (branches, listings) needs to resolve ownership and the publish gates, never
 * the full aggregate.
 */
export interface BusinessSummary {
  id: string;
  ownerId: string;
  type: string;
  status: BusinessStatus;
  isOnlineOnly: boolean;
}

/**
 * The Business bounded context's official read API. Other modules depend on this interface only,
 * never on the Business Prisma tables. The Prisma implementation lives in infrastructure.
 */
export interface BusinessReadRepository {
  /** Cross-context summary by id; `null` when the business does not exist or is archived. */
  findSummaryById(id: string): Promise<BusinessSummary | null>;
}
