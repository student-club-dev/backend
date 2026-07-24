import { Injectable } from '@nestjs/common';
import { ListingStatus as PrismaListingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Listing } from '../domain/entities/listing.entity';
import {
  CreateListingData,
  ListingPage,
  ListingPageQuery,
  ListingRepository,
  SubmitTransitionData,
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
   * Sets `status = PENDING_REVIEW` and, when a branch snapshot is supplied, replaces the
   * ListingBranch rows with it — both in one transaction — then returns the updated aggregate.
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
        data: { status: PrismaListingStatus.PENDING_REVIEW },
        include: LISTING_INCLUDE,
      });
    });
    return ListingMapper.toDomain(row);
  }
}
