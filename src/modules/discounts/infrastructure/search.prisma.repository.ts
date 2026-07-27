import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { MatchedVia } from '../domain/discount-card.model';
import { tashkentClock } from '../domain/feed-time';
import type {
  MapCriteria,
  MapMarkerPage,
  SearchCriteria,
  SearchFilter,
  SearchPage,
  SearchRepository,
} from '../domain/search.repository';
import { DiscountCardMapper } from './discount-card.mapper';
import { cardSelect, type DiscountCardRow } from './discount-card.sql';
import { MapMarkerMapper } from './map-marker.mapper';
import {
  markerCountQuery,
  markerInView,
  markerSelect,
  MARKER_ORDER_BY,
  type MapMarkerRow,
} from './map-marker.sql';
import {
  countQuery,
  hasSearchableText,
  searchOrderBy,
  searchWhere,
  synonymPairQuery,
  type SynonymPair,
} from './search-filter.sql';

/** The type-wide category: "the whole menu" answers a request for any category of its type. */
const ALL_CATEGORY_KEY = 'ALL';

/**
 * Prisma implementation of the search port. The projection comes from `discount-card.sql.ts` and
 * the predicates from `search-filter.sql.ts`, so search, favourites and detail can never drift into
 * showing different numbers for the same listing. Prisma is used ONLY here.
 */
@Injectable()
export class SearchPrismaRepository implements SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(criteria: SearchCriteria): Promise<SearchPage> {
    const filter = effectiveFilter(criteria.filter);
    const synonyms = await this.findSynonyms(filter);
    const where = searchWhere(filter, criteria.studentId, synonyms);
    const offset = criteria.page.number * criteria.page.size;

    const rowsQuery = Prisma.sql`
      ${cardSelect(filter.geo.point, tashkentClock(criteria.now), criteria.studentId)}
      WHERE ${where}
      ORDER BY ${searchOrderBy(criteria.sort.by, criteria.sort.direction, filter.query)}
      LIMIT ${criteria.page.size} OFFSET ${offset}
    `;

    // The count runs beside the page rather than after it: `hasNext` needs the total, and the two
    // share every predicate, so serialising them would only add a round-trip.
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<DiscountCardRow[]>(rowsQuery),
      this.prisma.$queryRaw<{ count: number }[]>(countQuery(where)),
    ]);

    const matched = new Set(synonyms.map(pairKey));
    return {
      items: rows.map((row) =>
        DiscountCardMapper.toCard(row, matchedVia(row, filter, matched), criteria.now),
      ),
      total: totals[0]?.count ?? 0,
    };
  }

  async count(filter: SearchFilter, studentId: string | null): Promise<number> {
    const effective = effectiveFilter(filter);
    const synonyms = await this.findSynonyms(effective);
    const rows = await this.prisma.$queryRaw<{ count: number }[]>(
      countQuery(searchWhere(effective, studentId, synonyms)),
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * §8.2 — the same predicates as LIST, projected one row per (listing, branch) in view.
   *
   * Three queries rather than one: D15 asks for two different counts (listings and markers), and
   * neither can be derived from a page of rows that `limit` may have cut. They share every
   * predicate, so they run together.
   */
  async searchMarkers(criteria: MapCriteria): Promise<MapMarkerPage> {
    const filter = effectiveFilter(criteria.filter);
    const synonyms = await this.findSynonyms(filter);
    const where = searchWhere(filter, criteria.studentId, synonyms);
    const inView = markerInView(filter.geo);

    const markersQuery = Prisma.sql`
      ${markerSelect(criteria.studentId)}
      WHERE ${where} AND ${inView}
      ORDER BY ${MARKER_ORDER_BY}
      LIMIT ${criteria.limit}
    `;

    const [rows, listingTotals, markerTotals] = await Promise.all([
      this.prisma.$queryRaw<MapMarkerRow[]>(markersQuery),
      this.prisma.$queryRaw<{ count: number }[]>(countQuery(where)),
      this.prisma.$queryRaw<{ count: number }[]>(markerCountQuery(where, inView)),
    ]);

    return {
      markers: rows.map(MapMarkerMapper.toMarker),
      total: listingTotals[0]?.count ?? 0,
      markersTotal: markerTotals[0]?.count ?? 0,
    };
  }

  /** Category keys the query text reaches through the synonym table (§7); empty without a query. */
  private async findSynonyms(filter: SearchFilter): Promise<SynonymPair[]> {
    if (filter.query === null) {
      return [];
    }
    return this.prisma.$queryRaw<SynonymPair[]>(synonymPairQuery(filter.types, filter.query));
  }
}

/**
 * Drops a query string that cannot produce a lexeme ("???"): `to_tsquery` would return NULL and
 * `search_vector @@ NULL` silently matches nothing, so the student would get an empty feed instead
 * of the unfiltered one they asked for.
 */
function effectiveFilter(filter: SearchFilter): SearchFilter {
  if (filter.query === null || hasSearchableText(filter.query)) {
    return filter;
  }
  return { ...filter, query: null };
}

/**
 * Why this listing is in the result set (§8.1). Text beats catalog: with a query the row is here
 * because of the text, either through the synonym table or through `search_vector`.
 */
function matchedVia(row: DiscountCardRow, filter: SearchFilter, synonyms: Set<string>): MatchedVia {
  if (filter.query !== null) {
    return synonyms.has(pairKey({ businessType: row.business_type, categoryKey: row.category_key }))
      ? 'SYNONYM'
      : 'TEXT';
  }
  if (filter.categoryKeys.length > 0) {
    return row.category_key === ALL_CATEGORY_KEY ? 'ALL' : 'CATEGORY';
  }
  return 'TYPE';
}

function pairKey(pair: SynonymPair): string {
  return `${pair.businessType}|${pair.categoryKey}`;
}
