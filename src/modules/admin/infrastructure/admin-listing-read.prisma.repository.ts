import { Injectable } from '@nestjs/common';
import {
  DiscountType as PrismaDiscountType,
  ListingStatus as PrismaListingStatus,
  Prisma,
  RedemptionMethod as PrismaRedemptionMethod,
  RedemptionStatus as PrismaRedemptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ListingStats } from '../../listings/domain/listing.repository';
import {
  AdminListingListFilter,
  AdminListingPage,
  AdminListingReadRepository,
} from '../domain/admin-listing-read.repository';
import { AdminListing } from '../domain/entities/admin-listing.entity';
import { AdminListingKind } from '../domain/enums/admin-listing-kind.enum';
import { AdminListingPriceBasis } from '../domain/enums/admin-listing-price-basis.enum';
import { AdminListingSort } from '../domain/enums/admin-listing-sort.enum';
import {
  ADMIN_LISTING_DETAIL_INCLUDE,
  ADMIN_LISTING_SUMMARY_SELECT,
  AdminListingMapper,
} from './admin-listing.mapper';

const ORDER_BY: Record<AdminListingSort, Prisma.ListingOrderByWithRelationInput[]> = {
  [AdminListingSort.NEWEST]: [{ createdAt: 'desc' }, { id: 'desc' }],
  [AdminListingSort.OLDEST]: [{ createdAt: 'asc' }, { id: 'asc' }],
  [AdminListingSort.PRICE_FINAL]: [{ finalPrice: 'asc' }, { id: 'asc' }],
  [AdminListingSort.VIEWS]: [{ viewsCount: 'desc' }, { id: 'desc' }],
  [AdminListingSort.ENDING_SOON]: [{ validTo: 'asc' }, { id: 'asc' }],
};

/** Prisma read port over the whole `listings` table for the admin panel. Prisma is used ONLY here. */
@Injectable()
export class AdminListingReadPrismaRepository implements AdminListingReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AdminListingListFilter): Promise<AdminListingPage> {
    const where = this.buildWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        select: ADMIN_LISTING_SUMMARY_SELECT,
        orderBy: ORDER_BY[filter.sort],
        skip: (filter.page - 1) * filter.size,
        take: filter.size,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return { items: rows.map(AdminListingMapper.toSummary), total };
  }

  async findById(id: string): Promise<AdminListing | null> {
    const row = await this.prisma.listing.findUnique({
      where: { id },
      include: ADMIN_LISTING_DETAIL_INCLUDE,
    });
    return row === null ? null : AdminListingMapper.toDetail(row);
  }

  /**
   * Aggregated analytics, mirroring the owner stats (LISTINGS.md §10) without the ownership gate:
   * the stored view counter, the favourite count, and the count + summed revenue of CONFIRMED
   * redemptions (`amount` is null where a cashier confirmed without one, so the sum treats it as 0).
   * Returns `null` when the listing does not exist, so the service can raise a clean 404.
   */
  async stats(id: string): Promise<ListingStats | null> {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: { viewsCount: true },
    });
    if (listing === null) {
      return null;
    }
    const [favoritesCount, redemptions] = await this.prisma.$transaction([
      this.prisma.studentFavorite.count({ where: { listingId: id } }),
      this.prisma.redemption.aggregate({
        where: { listingId: id, status: PrismaRedemptionStatus.CONFIRMED },
        _count: true,
        _sum: { amount: true },
      }),
    ]);
    return {
      viewsCount: listing.viewsCount,
      favoritesCount,
      redemptionsCount: redemptions._count,
      totalRevenue: Number(redemptions._sum.amount ?? 0n),
    };
  }

  /** Every filter narrows (AND); `q` ORs across title/description. */
  private buildWhere(filter: AdminListingListFilter): Prisma.ListingWhereInput {
    const where: Prisma.ListingWhereInput = {};
    if (filter.q !== null) {
      where.OR = [
        { title: { contains: filter.q, mode: 'insensitive' } },
        { description: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    if (filter.businessId !== null) {
      where.businessId = filter.businessId;
    }
    if (filter.statuses.length > 0) {
      where.status = { in: filter.statuses.map((status) => PrismaListingStatus[status]) };
    }
    if (filter.categoryKey !== null) {
      where.categoryKey = filter.categoryKey;
    }
    if (filter.discountType !== null) {
      where.discountType = PrismaDiscountType[filter.discountType];
    }
    if (filter.listingKind === AdminListingKind.DISCOUNT) {
      where.isDiscount = true;
    } else if (filter.listingKind === AdminListingKind.REGULAR) {
      where.isDiscount = false;
    }
    if (filter.redemptionMethod !== null) {
      where.redemptionMethod = PrismaRedemptionMethod[filter.redemptionMethod];
    }

    // owner / type / groupKey all narrow the listing's parent business.
    const business: Prisma.BusinessWhereInput = {};
    if (filter.ownerId !== null) {
      business.ownerId = filter.ownerId;
    }
    if (filter.type !== null) {
      business.type = filter.type;
    }
    if (filter.groupKey !== null) {
      business.businessTypeInfo = { groupKey: filter.groupKey };
    }
    if (Object.keys(business).length > 0) {
      where.business = business;
    }

    // A listing is "in" a region/district when at least one of its branches is there.
    const branch: Prisma.BranchWhereInput = {};
    if (filter.regionId !== null) {
      branch.regionId = filter.regionId;
    }
    if (filter.districtId !== null) {
      branch.districtId = filter.districtId;
    }
    if (Object.keys(branch).length > 0) {
      where.listingBranches = { some: { branch } };
    }

    if (filter.priceMin !== null || filter.priceMax !== null) {
      // BigInt columns (whole so'm) — the bounds are lifted to BigInt for the comparison.
      const range: { gte?: bigint; lte?: bigint } = {
        ...(filter.priceMin === null ? {} : { gte: BigInt(filter.priceMin) }),
        ...(filter.priceMax === null ? {} : { lte: BigInt(filter.priceMax) }),
      };
      if (filter.priceBasis === AdminListingPriceBasis.ORIGINAL) {
        where.originalPrice = range;
      } else {
        where.finalPrice = range;
      }
    }

    if (filter.createdFrom !== null || filter.createdTo !== null) {
      where.createdAt = {
        ...(filter.createdFrom === null ? {} : { gte: filter.createdFrom }),
        ...(filter.createdTo === null ? {} : { lte: filter.createdTo }),
      };
    }

    if (filter.validToAfter !== null || filter.validToBefore !== null) {
      where.validTo = {
        ...(filter.validToAfter === null ? {} : { gte: filter.validToAfter }),
        ...(filter.validToBefore === null ? {} : { lte: filter.validToBefore }),
      };
    }

    return where;
  }
}
