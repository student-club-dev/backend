import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { RedemptionStatus } from '../../redemptions/domain/enums/redemption-status.enum';
import {
  AdminDashboardCounts,
  AdminDashboardReadRepository,
} from '../domain/admin-dashboard-read.repository';
import { AdminDashboardService } from './admin-dashboard.service';

function makeRepo(counts: AdminDashboardCounts): AdminDashboardReadRepository {
  return { counts: jest.fn().mockResolvedValue(counts) };
}

const EMPTY: AdminDashboardCounts = {
  students: 0,
  businessOwners: 0,
  businessesByStatus: [],
  listingsByStatus: [],
  redemptionsByStatus: [],
  openReports: 0,
};

describe('AdminDashboardService', () => {
  it('folds groupBy rows into every enum key with a 0 default', async () => {
    const service = new AdminDashboardService(
      makeRepo({
        ...EMPTY,
        businessesByStatus: [{ status: BusinessStatus.APPROVED, count: 3 }],
        listingsByStatus: [{ status: ListingStatus.ACTIVE, count: 7 }],
      }),
    );

    const stats = await service.stats();

    expect(stats.businesses.byStatus).toEqual({
      DRAFT: 0,
      PENDING_REVIEW: 0,
      APPROVED: 3,
      REJECTED: 0,
      BLOCKED: 0,
      ARCHIVED: 0,
    });
    expect(stats.listings.byStatus).toEqual({
      DRAFT: 0,
      PENDING_REVIEW: 0,
      REJECTED: 0,
      SCHEDULED: 0,
      ACTIVE: 7,
      PAUSED: 0,
      EXPIRED: 0,
      SOLD_OUT: 0,
      ARCHIVED: 0,
    });
  });

  it('derives totals, redemption confirmed/pending and moderation queues from the folded counts', async () => {
    const service = new AdminDashboardService(
      makeRepo({
        students: 42,
        businessOwners: 9,
        businessesByStatus: [
          { status: BusinessStatus.APPROVED, count: 3 },
          { status: BusinessStatus.PENDING_REVIEW, count: 2 },
        ],
        listingsByStatus: [
          { status: ListingStatus.ACTIVE, count: 7 },
          { status: ListingStatus.PENDING_REVIEW, count: 4 },
        ],
        redemptionsByStatus: [
          { status: RedemptionStatus.CONFIRMED, count: 10 },
          { status: RedemptionStatus.PENDING, count: 5 },
          { status: RedemptionStatus.EXPIRED, count: 1 },
        ],
        openReports: 6,
      }),
    );

    const stats = await service.stats();

    expect(stats.students.total).toBe(42);
    expect(stats.businessOwners.total).toBe(9);
    expect(stats.businesses.total).toBe(5);
    expect(stats.listings.total).toBe(11);
    expect(stats.redemptions).toEqual({ total: 16, confirmed: 10, pending: 5 });
    expect(stats.moderation).toEqual({
      pendingBusinesses: 2,
      pendingListings: 4,
      openReports: 6,
    });
  });
});
