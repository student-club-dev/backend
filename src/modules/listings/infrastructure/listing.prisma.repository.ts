import { Injectable } from '@nestjs/common';
import {
  ListingStatus as PrismaListingStatus,
  Prisma,
  RedemptionStatus as PrismaRedemptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Listing } from '../domain/entities/listing.entity';
import { ListingStatus } from '../domain/enums/listing-status.enum';
import {
  CreateListingData,
  ListingPage,
  ListingPageQuery,
  ListingRepository,
  ListingStats,
  StatusTransitionCounts,
  SubmitTransitionData,
  UpdateListingData,
} from '../domain/listing.repository';
import { LISTING_INCLUDE, ListingMapper } from './listing.mapper';

/** Prisma implementation of the listing repository port. Prisma is used ONLY here. */
@Injectable()
export class ListingPrismaRepository implements ListingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists the whole aggregate — listing, its ListingBranch associations, option groups and their
   * options — in one transaction via a single nested `create`, then reads it back with its relations.
   */
  async create(data: CreateListingData): Promise<Listing> {
    const row = await this.prisma.$transaction((tx) =>
      tx.listing.create({ data: ListingMapper.toCreateData(data), include: LISTING_INCLUDE }),
    );
    return ListingMapper.toDomain(row);
  }

  /** Loads the full aggregate (with its relations) by id; `null` when it does not exist. */
  async findById(id: string): Promise<Listing | null> {
    const row = await this.prisma.listing.findUnique({ where: { id }, include: LISTING_INCLUDE });
    return row === null ? null : ListingMapper.toDomain(row);
  }

  /**
   * A page of a business's listings (newest first) plus the unpaginated total, read in one
   * transaction. A `null` status excludes ARCHIVED; an explicit one matches exactly. `categoryKey`
   * narrows further when present.
   */
  async findPageByBusiness(businessId: string, query: ListingPageQuery): Promise<ListingPage> {
    const where: Prisma.ListingWhereInput = {
      businessId,
      status:
        query.status === null
          ? { not: PrismaListingStatus.ARCHIVED }
          : PrismaListingStatus[query.status],
      ...(query.categoryKey === null ? {} : { categoryKey: query.categoryKey }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        include: LISTING_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.size,
        take: query.size,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return { items: rows.map(ListingMapper.toDomain), total };
  }

  /**
   * Applies the submit transition: the service's target `status` and, when a branch snapshot is
   * supplied, a wholesale replace of the ListingBranch rows — both in one transaction — then
   * returns the updated aggregate.
   */
  async submitTransition(id: string, data: SubmitTransitionData): Promise<Listing> {
    const row = await this.prisma.$transaction(async (tx) => {
      if (data.branchIds !== undefined) {
        await tx.listingBranch.deleteMany({ where: { listingId: id } });
        if (data.branchIds.length > 0) {
          await tx.listingBranch.createMany({
            data: data.branchIds.map((branchId) => ({ listingId: id, branchId })),
          });
        }
      }
      return tx.listing.update({
        where: { id },
        data: { status: PrismaListingStatus[data.status] },
        include: LISTING_INCLUDE,
      });
    });
    return ListingMapper.toDomain(row);
  }

  /**
   * Full-replace update of a listing's editable columns in one transaction — scalars plus a
   * wholesale replace of its ListingBranch and OptionGroup rows (options cascade-delete with their
   * group). `status`, `usedCount` and `viewsCount` are left untouched. Returns the updated aggregate.
   */
  async update(id: string, data: UpdateListingData): Promise<Listing> {
    const row = await this.prisma.$transaction((tx) =>
      tx.listing.update({
        where: { id },
        data: ListingMapper.toUpdateData(data),
        include: LISTING_INCLUDE,
      }),
    );
    return ListingMapper.toDomain(row);
  }

  /** Soft-delete: set the listing to ARCHIVED. */
  async archive(id: string): Promise<void> {
    await this.prisma.listing.update({
      where: { id },
      data: { status: PrismaListingStatus.ARCHIVED },
    });
  }

  /** Sets the listing's status (pause/activate/withdraw) and returns the updated aggregate. */
  async setStatus(id: string, status: ListingStatus): Promise<Listing> {
    const row = await this.prisma.listing.update({
      where: { id },
      data: { status: PrismaListingStatus[status] },
      include: LISTING_INCLUDE,
    });
    return ListingMapper.toDomain(row);
  }

  /**
   * Clones the listing's content into a fresh DRAFT: read the source with its relations, then create
   * a new aggregate from the cloned payload (branches + option groups recreated) in one transaction.
   */
  async duplicate(id: string): Promise<Listing> {
    const source = await this.prisma.listing.findUniqueOrThrow({
      where: { id },
      include: LISTING_INCLUDE,
    });
    const row = await this.prisma.$transaction((tx) =>
      tx.listing.create({ data: ListingMapper.toDuplicateData(source), include: LISTING_INCLUDE }),
    );
    return ListingMapper.toDomain(row);
  }

  /**
   * Owner analytics, read in one transaction: the stored view counter, the favourite count, and the
   * count + summed revenue of CONFIRMED redemptions (`amount` is null where a cashier confirmed
   * without an amount, so the sum treats it as 0).
   */
  async stats(id: string): Promise<ListingStats> {
    const [listing, favoritesCount, redemptions] = await this.prisma.$transaction([
      this.prisma.listing.findUniqueOrThrow({ where: { id }, select: { viewsCount: true } }),
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

  /**
   * Runs the three time/limit-driven sweeps (BACKEND_PROMPT §7) in one transaction, ordered so each
   * is disjoint: expire closed windows first, then start due SCHEDULED listings, then sell-out those
   * that hit their limit. SOLD_OUT needs a column-to-column comparison (`used_count >= total_limit`),
   * which `updateMany` can't express — so it's raw SQL (which also sets `updated_at`, since the
   * Prisma `@updatedAt` hook does not apply to raw statements).
   */
  async applyStatusTransitions(now: Date): Promise<StatusTransitionCounts> {
    return this.prisma.$transaction(async (tx) => {
      const expired = await tx.listing.updateMany({
        where: {
          status: {
            in: [
              PrismaListingStatus.ACTIVE,
              PrismaListingStatus.PAUSED,
              PrismaListingStatus.SCHEDULED,
            ],
          },
          validTo: { lte: now },
        },
        data: { status: PrismaListingStatus.EXPIRED },
      });

      const activated = await tx.listing.updateMany({
        where: {
          status: PrismaListingStatus.SCHEDULED,
          validFrom: { lte: now },
          validTo: { gt: now },
        },
        data: { status: PrismaListingStatus.ACTIVE },
      });

      const soldOut = await tx.$executeRaw`
        UPDATE listings
        SET status = 'SOLD_OUT', updated_at = ${now}
        WHERE status = 'ACTIVE' AND total_limit IS NOT NULL AND used_count >= total_limit`;

      return { expired: expired.count, activated: activated.count, soldOut };
    });
  }
}
