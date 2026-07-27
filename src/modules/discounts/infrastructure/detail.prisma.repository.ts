import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BRANCH_INCLUDE, BranchMapper } from '../../branches/infrastructure/branch.mapper';
import { BusinessMapper } from '../../business/infrastructure/business.mapper';
import { LISTING_INCLUDE, ListingMapper } from '../../listings/infrastructure/listing.mapper';
import { DetailRepository, ListingDetailLookup } from '../domain/detail.repository';
import { tashkentClock } from '../domain/feed-time';
import { DetailBranch, ListingDetail } from '../domain/listing-detail.model';
import { DiscountCardMapper } from './discount-card.mapper';
import type { DiscountCardRow } from './discount-card.sql';
import { BranchDistanceRow, branchDistances, visibleCardById } from './detail.sql';

/**
 * One student's view of one listing counts once an hour. Long enough that scrolling back to an
 * offer is not a second view, short enough that genuine return visits still register.
 */
const VIEW_WINDOW_SECONDS = 3600;

/**
 * A listing reached by id was not matched by a filter or a query, so there is no honest
 * `matchedVia`; `ALL` is the card's neutral value and is what the feed reports for an unfiltered
 * result.
 */
const DETAIL_MATCHED_VIA = 'ALL';

/**
 * Prisma implementation of the detail port. Prisma is used ONLY here.
 *
 * The card half comes from the shared `cardSelect` projection (raw SQL — PostGIS distance and the
 * open-now check are unreachable through the client); everything the detail screen adds is read
 * through the Prisma client and mapped by the owner-side mappers, so a listing, a branch and a
 * business describe themselves identically on both sides of the product.
 */
@Injectable()
export class DetailPrismaRepository implements DetailRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findVisibleById(lookup: ListingDetailLookup): Promise<ListingDetail | null> {
    const clock = tashkentClock(lookup.now);
    const rows = await this.prisma.$queryRaw<DiscountCardRow[]>(
      visibleCardById(lookup.listingId, lookup.geo, clock, lookup.studentId),
    );
    const cardRow = rows[0];
    // No row = not visible per Q4, or no such listing. The two are deliberately indistinguishable.
    if (cardRow === undefined) {
      return null;
    }

    const [aggregate, branches, distances] = await Promise.all([
      this.prisma.listing.findUnique({
        where: { id: lookup.listingId },
        include: { ...LISTING_INCLUDE, business: true },
      }),
      this.prisma.branch.findMany({
        where: { isActive: true, listingBranches: { some: { listingId: lookup.listingId } } },
        include: BRANCH_INCLUDE,
        // Stable tie-break, matching the card's nearest-branch rule (STUDENT_FEED.md D14).
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      lookup.geo === null
        ? Promise.resolve<BranchDistanceRow[]>([])
        : this.prisma.$queryRaw<BranchDistanceRow[]>(branchDistances(lookup.listingId, lookup.geo)),
    ]);
    // Only reachable if the listing was deleted between the two reads; treat it as gone.
    if (aggregate === null) {
      return null;
    }

    const listing = ListingMapper.toDomain(aggregate);
    const business = BusinessMapper.toDomain(aggregate.business);
    const distanceByBranch = new Map(
      distances.map((row) => [row.branch_id, toMeters(row.distance_meters)]),
    );

    return {
      ...DiscountCardMapper.toCard(cardRow, DETAIL_MATCHED_VIA, lookup.now),
      description: listing.description,
      images: listing.images,
      optionGroups: listing.optionGroups,
      redemption: {
        ...listing.redemption,
        // Filled by the service: it depends on who is asking, which the repository does not judge.
        remainingForUser: null,
      },
      branches: sortByDistance(branches.map((branch) => toDetailBranch(branch, distanceByBranch))),
      business: {
        id: business.id,
        name: business.name,
        logoUrl: business.logoUrl,
        phone: business.phone,
        contacts: business.contacts,
        rating: business.rating,
      },
      validFrom: listing.validFrom.toISOString(),
      createdAt: listing.createdAt.toISOString(),
    };
  }

  async countRedemptions(
    listingId: string,
    studentId: string,
    since: Date | null,
  ): Promise<number> {
    return this.prisma.redemption.count({
      where: {
        listingId,
        studentId,
        ...(since === null ? {} : { redeemedAt: { gte: since } }),
      },
    });
  }

  /**
   * Increments `listings.views_count`, at most once per student per hour. The Redis key IS the
   * idempotency record: if setting it finds one already there the view has been counted, and if
   * Redis loses the key the worst case is one extra view — cheap next to keeping a row per view.
   */
  async registerView(listingId: string, studentId: string): Promise<void> {
    const key = `discounts:detail:viewed:${studentId}:${listingId}`;
    // Atomic claim: `SET NX` returns true to exactly one caller, so two simultaneous opens of the
    // same listing cannot both increment. `exists` then `set` would leave that race open.
    if (!(await this.redis.setIfAbsent(key, '1', VIEW_WINDOW_SECONDS))) {
      return;
    }
    await this.prisma.listing.update({
      where: { id: listingId },
      data: { viewsCount: { increment: 1 } },
    });
  }
}

type BranchRow = Prisma.BranchGetPayload<{ include: typeof BRANCH_INCLUDE }>;

/** Flattens the owner-side branch entity into what the detail screen shows, plus the distance. */
function toDetailBranch(row: BranchRow, distances: Map<string, number | null>): DetailBranch {
  const branch = BranchMapper.toDomain(row);
  return {
    branchId: branch.id,
    name: branch.name,
    address: branch.location.address,
    landmark: branch.location.landmark,
    lat: branch.location.lat,
    lng: branch.location.lng,
    distanceMeters: distances.get(branch.id) ?? null,
    tradeCenter: branch.tradeCenter,
    tradeCenterFields: branch.tradeCenterFields,
    workingHours: branch.workingHours,
    deliveryZone: branch.deliveryZone,
  };
}

/**
 * Nearest first when distances are known. `sort` is stable, so branches without a distance — and
 * every branch when the request carried no coordinates — keep the `(createdAt, id)` order they
 * arrived in.
 */
function sortByDistance(branches: DetailBranch[]): DetailBranch[] {
  return [...branches].sort((a, b) => {
    if (a.distanceMeters === null || b.distanceMeters === null) {
      return Number(a.distanceMeters === null) - Number(b.distanceMeters === null);
    }
    return a.distanceMeters - b.distanceMeters;
  });
}

/** Metres come back fractional from PostGIS; the contract shows whole metres. */
function toMeters(distance: number | null): number | null {
  return distance === null ? null : Math.round(distance);
}
