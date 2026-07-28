import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { RedemptionStatus } from '../../redemptions/domain/enums/redemption-status.enum';

/** Injection token for the admin dashboard read port (bound to the Prisma impl). */
export const ADMIN_DASHBOARD_READ_REPOSITORY = Symbol('ADMIN_DASHBOARD_READ_REPOSITORY');

/** One `{ status, count }` row from a Prisma `groupBy` over a status column. */
export interface StatusCount<S extends string> {
  status: S;
  count: number;
}

/**
 * Raw dashboard counts straight from the DB — total rows per table and per-status groupBy rows
 * (only the statuses that actually occur). The service folds these into the fixed-key breakdowns
 * (every enum key present, 0 default) that {@link AdminDashboardStats} exposes.
 */
export interface AdminDashboardCounts {
  students: number;
  studentsBanned: number;
  businessOwners: number;
  businessOwnersBanned: number;
  businessesByStatus: StatusCount<BusinessStatus>[];
  listingsByStatus: StatusCount<ListingStatus>[];
  redemptionsByStatus: StatusCount<RedemptionStatus>[];
  openReports: number;
}

/** Read-only, unscoped dashboard aggregates for the admin panel. Prisma-backed. */
export interface AdminDashboardReadRepository {
  /** Every count the dashboard needs, read in one pass. */
  counts(): Promise<AdminDashboardCounts>;
}
