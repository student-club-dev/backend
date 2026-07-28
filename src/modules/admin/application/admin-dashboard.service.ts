import { Inject, Injectable } from '@nestjs/common';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { RedemptionStatus } from '../../redemptions/domain/enums/redemption-status.enum';
import {
  ADMIN_DASHBOARD_READ_REPOSITORY,
  AdminDashboardReadRepository,
  StatusCount,
} from '../domain/admin-dashboard-read.repository';
import { AdminDashboardStats } from '../domain/entities/admin-dashboard-stats.entity';

/**
 * Admin dashboard summary (Faza 1). Reads the raw counts from the repository and folds the per-status
 * groupBy rows into fixed-key breakdowns — every enum key present with a 0 default, so the panel never
 * has to guess which statuses are missing. Read-only; depends on the repository interface only.
 */
@Injectable()
export class AdminDashboardService {
  constructor(
    @Inject(ADMIN_DASHBOARD_READ_REPOSITORY)
    private readonly dashboard: AdminDashboardReadRepository,
  ) {}

  async stats(): Promise<AdminDashboardStats> {
    const counts = await this.dashboard.counts();

    const businessesByStatus = fold(counts.businessesByStatus, Object.values(BusinessStatus));
    const listingsByStatus = fold(counts.listingsByStatus, Object.values(ListingStatus));
    const redemptionsByStatus = fold(counts.redemptionsByStatus, Object.values(RedemptionStatus));

    return {
      students: { total: counts.students },
      businessOwners: { total: counts.businessOwners },
      businesses: { total: sum(businessesByStatus), byStatus: businessesByStatus },
      listings: { total: sum(listingsByStatus), byStatus: listingsByStatus },
      redemptions: {
        total: sum(redemptionsByStatus),
        confirmed: redemptionsByStatus[RedemptionStatus.CONFIRMED],
        pending: redemptionsByStatus[RedemptionStatus.PENDING],
      },
      moderation: {
        pendingBusinesses: businessesByStatus[BusinessStatus.PENDING_REVIEW],
        pendingListings: listingsByStatus[ListingStatus.PENDING_REVIEW],
        openReports: counts.openReports,
      },
    };
  }
}

/** Folds groupBy rows into a record keyed by every `keys` value (0 default for absent statuses). */
function fold<S extends string>(rows: StatusCount<S>[], keys: S[]): Record<S, number> {
  const result = {} as Record<S, number>;
  for (const key of keys) {
    result[key] = 0;
  }
  for (const row of rows) {
    result[row.status] = row.count;
  }
  return result;
}

function sum(record: Record<string, number>): number {
  return Object.values(record).reduce((total, count) => total + count, 0);
}
