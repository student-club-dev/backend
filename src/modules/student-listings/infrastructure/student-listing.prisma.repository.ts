import { Injectable } from '@nestjs/common';
import {
  ListingStatus as PrismaListingStatus,
  Prisma,
  StudentStatus,
  StudentListingKind as PrismaStudentListingKind,
  StudentPriceUnit as PrismaStudentPriceUnit,
  ListingAudience as PrismaListingAudience,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import type { StudentListing } from '../domain/entities/student-listing.entity';
import type {
  CreateStudentListingData,
  DuplicateProbe,
  OwnListingsQuery,
  StudentListingBranchData,
  StatusTransitionCounts,
  StudentListingPage,
  StudentListingRepository,
  UpdateStudentListingData,
} from '../domain/student-listing.repository';
import type { CursorPosition } from '../domain/search/cursor';
import type { SearchCriteria, SearchPage } from '../domain/search/search-criteria';
import { searchCountQuery, searchQuery } from './search/search.sql';
import { toDetailColumns, toListingEntity } from './student-listing.mapper';

/** Pins always travel with their listing — nothing reads one on its own. */
const LISTING_INCLUDE = { branches: { orderBy: { createdAt: 'asc' } } } as const;

/**
 * Prisma-backed store for student listings.
 *
 * Soft deletion is enforced here rather than by callers: every read adds `deletedAt: null`, so a
 * deleted listing is invisible to the whole application and the service never has to remember.
 */
@Injectable()
export class StudentListingPrismaRepository implements StudentListingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateStudentListingData): Promise<StudentListing> {
    const row = await this.prisma.studentListing.create({
      data: {
        ownerId: data.ownerId,
        kind: data.kind as PrismaStudentListingKind,
        ...this.writableColumns(data),
        status: data.status as PrismaListingStatus,
        publishedAt: data.publishedAt,
        idempotencyKey: data.idempotencyKey,
        branches: { create: data.branches.map(toBranchCreate) },
      },
      include: LISTING_INCLUDE,
    });
    return toListingEntity(row);
  }

  async findByIdempotencyKey(ownerId: string, key: string): Promise<StudentListing | null> {
    const row = await this.prisma.studentListing.findFirst({
      where: { ownerId, idempotencyKey: key, deletedAt: null },
      include: LISTING_INCLUDE,
    });
    return row === null ? null : toListingEntity(row);
  }

  async findById(id: string): Promise<StudentListing | null> {
    const row = await this.prisma.studentListing.findFirst({
      where: { id, deletedAt: null },
      include: LISTING_INCLUDE,
    });
    return row === null ? null : toListingEntity(row);
  }

  /**
   * Pins are replaced wholesale rather than diffed: they carry no identity a client can reference,
   * so "the same pin, moved" and "a different pin" are indistinguishable — and a partial failure
   * mid-replace would leave the listing pointing at a place it does not describe, hence one
   * transaction.
   */
  async update(id: string, data: UpdateStudentListingData): Promise<StudentListing> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.studentListingBranch.deleteMany({ where: { listingId: id } });
      return tx.studentListing.update({
        where: { id },
        data: {
          ...this.writableColumns(data),
          branches: { create: data.branches.map(toBranchCreate) },
        },
        include: LISTING_INCLUDE,
      });
    });
    return toListingEntity(row);
  }

  async setStatus(
    id: string,
    status: ListingStatus,
    publishedAt: Date | null,
  ): Promise<StudentListing> {
    const row = await this.prisma.studentListing.update({
      where: { id },
      // Only stamped when supplied, so re-activating a paused listing keeps its first publish time.
      data: {
        status: status as PrismaListingStatus,
        ...(publishedAt !== null ? { publishedAt } : {}),
      },
      include: LISTING_INCLUDE,
    });
    return toListingEntity(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.studentListing.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findPageByOwner(ownerId: string, query: OwnListingsQuery): Promise<StudentListingPage> {
    const where: Prisma.StudentListingWhereInput = { ownerId, deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.studentListing.findMany({
        where,
        include: LISTING_INCLUDE,
        // `id` breaks ties so a page boundary cannot repeat or skip a listing updated in the
        // same millisecond as its neighbour.
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.size,
        take: query.size,
      }),
      this.prisma.studentListing.count({ where }),
    ]);
    return { items: rows.map((row) => toListingEntity(row)), total };
  }

  async incrementViews(id: string): Promise<void> {
    await this.prisma.studentListing.update({
      where: { id },
      data: { viewsCount: { increment: 1 } },
    });
  }

  async countActiveByOwner(ownerId: string): Promise<number> {
    return this.prisma.studentListing.count({
      where: { ownerId, status: PrismaListingStatus.ACTIVE, deletedAt: null },
    });
  }

  async countPublishedSince(ownerId: string, since: Date): Promise<number> {
    return this.prisma.studentListing.count({
      where: { ownerId, publishedAt: { gte: since }, deletedAt: null },
    });
  }

  async existsDuplicate(probe: DuplicateProbe): Promise<boolean> {
    const count = await this.prisma.studentListing.count({
      where: {
        ownerId: probe.ownerId,
        kind: probe.kind as PrismaStudentListingKind,
        title: probe.title,
        price: BigInt(probe.price),
        createdAt: { gte: probe.since },
        deletedAt: null,
        ...(probe.excludeId !== null ? { id: { not: probe.excludeId } } : {}),
      },
    });
    return count > 0;
  }

  /** Either direction counts: a block hides both parties from each other (§7.2.0). */
  async isBlockedBetween(studentA: string, studentB: string): Promise<boolean> {
    const count = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: studentA, blockedId: studentB },
          { blockerId: studentB, blockedId: studentA },
        ],
      },
    });
    return count > 0;
  }

  async isOwnerActive(ownerId: string): Promise<boolean> {
    const row = await this.prisma.student.findUnique({
      where: { id: ownerId },
      select: { status: true },
    });
    return row?.status === StudentStatus.ACTIVE;
  }

  /**
   * The feed query. One extra row is fetched beyond the page size so `hasNext` is known without a
   * second COUNT — on a growing table that count is the most expensive part of a cheap query.
   */
  async search(
    criteria: SearchCriteria,
    position: CursorPosition | null,
    offset = 0,
  ): Promise<SearchPage> {
    const rows = await this.prisma.$queryRaw<
      { id: string; distance_meters: number | null; sort_value: string | null }[]
    >(searchQuery(criteria, position, offset));

    const hasNext = rows.length > criteria.size;
    return {
      hits: rows.slice(0, criteria.size).map((row) => ({
        id: row.id,
        distanceMeters: row.distance_meters === null ? null : Math.round(row.distance_meters),
        sortValue: row.sort_value,
      })),
      hasNext,
    };
  }

  async countSearch(criteria: SearchCriteria): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ total: number }[]>(searchCountQuery(criteria));
    return row?.total ?? 0;
  }

  async findManyByIds(ids: string[]): Promise<StudentListing[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.studentListing.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: LISTING_INCLUDE,
    });
    return rows.map((row) => toListingEntity(row));
  }

  /**
   * Upserts the viewer's row and reports whether the counter should move.
   *
   * A single statement rather than read-then-write: two students opening the same listing at once
   * would both read "not seen" and both increment. `ON CONFLICT ... WHERE` lets Postgres decide,
   * and `RETURNING` tells us whether it did.
   */
  async registerView(listingId: string, viewerId: string, since: Date): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ listing_id: string }[]>`
      INSERT INTO student_listing_views (listing_id, viewer_id, viewed_at)
      VALUES (${listingId}, ${viewerId}, now())
      ON CONFLICT (listing_id, viewer_id) DO UPDATE
        SET viewed_at = now()
        WHERE student_listing_views.viewed_at < ${since}
      RETURNING listing_id
    `;
    return rows.length > 0;
  }

  /**
   * §6 — the sweep. Three set-based updates rather than a read-then-write loop: the whole point is
   * to move however many listings crossed a date, and fetching them first would scale with the
   * table instead of with the number that actually changed.
   *
   * Each is guarded by its source status, so running twice (or two instances overlapping) is safe.
   */
  async applyStatusTransitions(now: Date): Promise<StatusTransitionCounts> {
    const [windowClosed, deadlinePassed, activated] = await this.prisma.$transaction([
      // The advertised period ended.
      this.prisma.studentListing.updateMany({
        where: {
          status: { in: [PrismaListingStatus.ACTIVE, PrismaListingStatus.SCHEDULED] },
          validTo: { lte: now },
          deletedAt: null,
        },
        data: { status: PrismaListingStatus.EXPIRED },
      }),
      // A task nobody could still deliver, even though its advert has not run out.
      this.prisma.studentListing.updateMany({
        where: {
          status: PrismaListingStatus.ACTIVE,
          kind: PrismaStudentListingKind.TASK,
          taskDeadline: { lte: now },
          deletedAt: null,
        },
        data: { status: PrismaListingStatus.EXPIRED },
      }),
      // A scheduled listing whose start has arrived and whose window is still open.
      this.prisma.studentListing.updateMany({
        where: {
          status: PrismaListingStatus.SCHEDULED,
          validFrom: { lte: now },
          validTo: { gt: now },
          deletedAt: null,
        },
        data: { status: PrismaListingStatus.ACTIVE },
      }),
    ]);

    return {
      expired: windowClosed.count + deadlinePassed.count,
      activated: activated.count,
    };
  }

  /** The columns a create and an update both write, so the two cannot drift apart. */
  private writableColumns(data: CreateStudentListingData | UpdateStudentListingData): Omit<
    Prisma.StudentListingUncheckedCreateInput,
    'kind' | 'ownerId' | 'details'
  > & {
    details: Prisma.InputJsonValue;
  } {
    return {
      title: data.title,
      description: data.description,
      images: data.images,
      priceUnit: data.priceUnit === null ? null : (data.priceUnit as PrismaStudentPriceUnit),
      price: BigInt(data.price),
      priceMax: data.priceMax === null ? null : BigInt(data.priceMax),
      isNegotiable: data.isNegotiable,
      contactPhone: data.contactPhone,
      universityId: data.universityId,
      audience: data.audience as PrismaListingAudience,
      validFrom: data.validFrom,
      validTo: data.validTo,
      attributes: data.attributes as Prisma.InputJsonValue,
      optionGroups: data.optionGroups as unknown as Prisma.InputJsonValue,
      details: data.details as unknown as Prisma.InputJsonValue,
      searchText: data.searchText,
      ...toDetailColumns(data.details),
    };
  }
}

function toBranchCreate(
  branch: StudentListingBranchData,
): Prisma.StudentListingBranchCreateWithoutListingInput {
  return {
    lat: branch.lat,
    lng: branch.lng,
    address: branch.address,
    name: branch.name,
    landmark: branch.landmark,
    regionId: branch.regionId,
    districtId: branch.districtId,
  };
}
