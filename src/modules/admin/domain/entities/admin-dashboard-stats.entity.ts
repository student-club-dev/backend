import { BusinessStatus } from '../../../business/domain/enums/business-status.enum';
import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';

/**
 * The admin dashboard summary (`GET /v1/admin/dashboard/stats`). `byStatus` records carry every
 * enum key (0 default), folded by the service from the repository's groupBy counts. Pure domain type.
 */
export interface AdminDashboardStats {
  students: { total: number };
  businessOwners: { total: number };
  businesses: { total: number; byStatus: Record<BusinessStatus, number> };
  listings: { total: number; byStatus: Record<ListingStatus, number> };
  redemptions: { total: number; confirmed: number; pending: number };
  moderation: { pendingBusinesses: number; pendingListings: number; openReports: number };
}
