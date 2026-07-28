import { Injectable } from '@nestjs/common';
import {
  BusinessOwnerStatus,
  ReportStatus as PrismaReportStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { RedemptionStatus } from '../../redemptions/domain/enums/redemption-status.enum';
import {
  AdminDashboardCounts,
  AdminDashboardReadRepository,
} from '../domain/admin-dashboard-read.repository';

/** Prisma read port for the admin dashboard aggregates. Prisma is used ONLY here. */
@Injectable()
export class AdminDashboardReadPrismaRepository implements AdminDashboardReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every dashboard count in one transaction: total rows for students / business owners, per-status
   * groupBy for businesses / listings / redemptions, and the OPEN report count. The Prisma enums map
   * to the domain enums by key; the service folds the groupBy rows into all-keys-present breakdowns.
   */
  async counts(): Promise<AdminDashboardCounts> {
    // Interactive transaction: the array form of `$transaction` erases the precise groupBy `_count`
    // typing, so the queries run inside one interactive transaction where the types stay exact.
    const {
      students,
      studentsBanned,
      businessOwners,
      businessOwnersBanned,
      businesses,
      listings,
      redemptions,
      openReports,
    } = await this.prisma.$transaction(async (tx) => ({
      students: await tx.student.count(),
      studentsBanned: await tx.student.count({ where: { status: StudentStatus.BANNED } }),
      businessOwners: await tx.businessOwner.count(),
      businessOwnersBanned: await tx.businessOwner.count({
        where: { status: BusinessOwnerStatus.BANNED },
      }),
      businesses: await tx.business.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      listings: await tx.listing.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      redemptions: await tx.redemption.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      openReports: await tx.report.count({ where: { status: PrismaReportStatus.OPEN } }),
    }));

    return {
      students,
      studentsBanned,
      businessOwners,
      businessOwnersBanned,
      businessesByStatus: businesses.map((row) => ({
        status: BusinessStatus[row.status],
        count: row._count._all,
      })),
      listingsByStatus: listings.map((row) => ({
        status: ListingStatus[row.status],
        count: row._count._all,
      })),
      redemptionsByStatus: redemptions.map((row) => ({
        status: RedemptionStatus[row.status],
        count: row._count._all,
      })),
      openReports,
    };
  }
}
