import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { FacetRepository } from '../domain/facet.repository';
import { FacetScope, ListingFacets } from '../domain/facets.model';
import {
  AttributeCountRow,
  KeyCountRow,
  KindRow,
  RangeRow,
  attributeFacet,
  categoryFacet,
  discountPercentRangeFacet,
  discountTypeFacet,
  listingKindFacet,
  locationFacet,
  priceRangeFacet,
  priceUnitFacet,
  redemptionFacet,
  totalFacet,
} from './facet.sql';

/** Facets change as slowly as the listings behind them; 5 minutes matches the catalog counts. */
const CACHE_TTL_SECONDS = 300;

const EMPTY: ListingFacets = {
  total: 0,
  categories: [],
  attributes: [],
  priceUnits: [],
  priceRange: null,
  discountTypes: [],
  discountPercentRange: null,
  redemptionMethods: [],
  listingKind: { discount: 0, regular: 0 },
  regions: [],
  districts: [],
  tradeCenters: [],
};

/** Prisma implementation of the facet port. SQL lives in `facet.sql.ts`; Prisma is used ONLY here. */
@Injectable()
export class FacetPrismaRepository implements FacetRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findFacets(scope: FacetScope): Promise<ListingFacets> {
    if (scope.types.length === 0) {
      return EMPTY;
    }

    const key = cacheKey(scope);
    const cached = await this.redis.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as ListingFacets;
    }

    const [
      total,
      categories,
      attributes,
      priceUnits,
      priceRange,
      discountTypes,
      discountPercentRange,
      redemptionMethods,
      kind,
      regions,
      districts,
      tradeCenters,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ count: number }[]>(totalFacet(scope)),
      this.prisma.$queryRaw<KeyCountRow[]>(categoryFacet(scope)),
      this.prisma.$queryRaw<AttributeCountRow[]>(attributeFacet(scope)),
      this.prisma.$queryRaw<KeyCountRow[]>(priceUnitFacet(scope)),
      this.prisma.$queryRaw<RangeRow[]>(priceRangeFacet(scope)),
      this.prisma.$queryRaw<KeyCountRow[]>(discountTypeFacet(scope)),
      this.prisma.$queryRaw<RangeRow[]>(discountPercentRangeFacet(scope)),
      this.prisma.$queryRaw<KeyCountRow[]>(redemptionFacet(scope)),
      this.prisma.$queryRaw<KindRow[]>(listingKindFacet(scope)),
      this.prisma.$queryRaw<KeyCountRow[]>(locationFacet(scope, 'region_id')),
      this.prisma.$queryRaw<KeyCountRow[]>(locationFacet(scope, 'district_id')),
      this.prisma.$queryRaw<KeyCountRow[]>(locationFacet(scope, 'trade_center_id')),
    ]);

    const facets: ListingFacets = {
      total: total[0]?.count ?? 0,
      categories,
      attributes,
      priceUnits,
      priceRange: toRange(priceRange[0]),
      discountTypes,
      discountPercentRange: toRange(discountPercentRange[0]),
      redemptionMethods,
      listingKind: { discount: kind[0]?.discount ?? 0, regular: kind[0]?.regular ?? 0 },
      regions,
      districts,
      tradeCenters,
    };

    await this.redis.set(key, JSON.stringify(facets), CACHE_TTL_SECONDS);
    return facets;
  }
}

/** `MIN`/`MAX` over an empty set return NULL — that is "no range", not zero. */
function toRange(row: RangeRow | undefined): { min: number; max: number } | null {
  if (row === undefined || row.min === null || row.max === null) {
    return null;
  }
  return { min: row.min, max: row.max };
}

/**
 * Cache key. Types and categories are sorted so two requests differing only in order share an
 * entry; coordinates are rounded to ~1 km for the same reason as the catalog counts.
 */
function cacheKey(scope: FacetScope): string {
  const types = [...scope.types].sort().join(',');
  const categories = [...scope.categoryKeys].sort().join(',');
  const geo =
    scope.geo === null
      ? 'nogeo'
      : `${scope.geo.lat.toFixed(2)}:${scope.geo.lng.toFixed(2)}:${scope.geo.radiusMeters}`;
  return `discounts:facets:${types}|${categories}|${geo}`;
}
