import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE, type ErrorCode } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { GeoBox } from '../../../common/geo/geo-box';
import { isWithinUzbekistan } from '../../../common/geo/uzbekistan-bounds';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../catalog/domain/catalog.repository';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import { FACET_REPOSITORY, FacetRepository } from '../domain/facet.repository';
import type { ListingFacets } from '../domain/facets.model';
import {
  SEARCH_REPOSITORY,
  SearchRepository,
  type AttributeFilter,
  type SearchFilter,
} from '../domain/search.repository';
import { clusterMarkers, mapBounds } from './marker-cluster.shaper';
import {
  ALLOWED_ATTRIBUTE_OPS,
  ATTRIBUTE_OPERAND,
  DEFAULT_MAP_VIEW,
  defaultDirection,
  type CountFacets,
  type SearchQuery,
  type SearchResult,
} from './search-query.model';

/** STUDENT_FEED.md §10 "Chegaralar". The rest are enforced by the request DTO. */
const MAX_GROUPS = 3;
const MAX_EXPLICIT_TYPES = 10;
const MAX_PAGE_SIZE = 50;
const MAX_MARKERS = 2000;

/** The type-wide category every business type declares; used to pull the type-level specs. */
const ALL_CATEGORY_KEY = 'ALL';

/** One category of a selected type, keyed by its catalog key. */
interface CategoryInfo {
  nameUz: string;
  typeKey: string;
  gender: string | null;
}

/**
 * `POST /v1/discounts/search` — the feed's single read (Q1). Resolves the request against the
 * catalog (Q3: groups expand to types, and "everything" is never an answer), enforces the §10
 * limits, then lists cards, pins them on a map, or counts them with their facets.
 *
 * Visibility (Q4) is not decided here: it is baked into every SQL the repositories issue.
 */
@Injectable()
export class SearchService {
  constructor(
    @Inject(SEARCH_REPOSITORY) private readonly listings: SearchRepository,
    @Inject(FACET_REPOSITORY) private readonly facets: FacetRepository,
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
  ) {}

  async search(query: SearchQuery): Promise<SearchResult> {
    this.validateRequest(query);

    const types = await this.resolveTypes(query);
    // Fetched once and reused: the same map validates `categoryKeys` and labels the COUNT facets.
    const categories =
      query.filter.categoryKeys.length > 0 || query.mode === 'COUNT'
        ? await this.loadCategories(types)
        : new Map<string, CategoryInfo>();

    this.validateCategories(query.filter.categoryKeys, categories);
    await this.validateAttributes(types, query.filter.attributes);

    const filter: SearchFilter = { ...query.filter, types };
    switch (query.mode) {
      case 'COUNT':
        return this.count(filter, query.studentId, categories);
      case 'MAP':
        return this.map(filter, query);
      case 'LIST':
        return this.list(filter, query);
    }
  }

  /**
   * The student's saved listings, using the very same filter model (§9 `favorites/search`).
   *
   * Two deliberate differences from {@link search}:
   *  - `typeScope: 'OPTIONAL'` lifts Q3 — favourites are already bounded by what this student
   *    saved, so "everything I saved" is a legitimate request. The §10 caps go with it: they exist
   *    to bound the OPEN feed's query, and would reject the full catalog this then stands in.
   *  - `favoritesOnly` is forced on, so the endpoint cannot be talked into returning the open feed.
   */
  async searchFavorites(query: SearchQuery): Promise<SearchResult> {
    return this.search({
      ...query,
      typeScope: 'OPTIONAL',
      filter: {
        ...query.filter,
        flags: { ...query.filter.flags, favoritesOnly: true },
      },
    });
  }

  /** §8.1 — exactly `{items, page, size, total, hasNext}`; no cursor, no meta, no facets (D3). */
  private async list(filter: SearchFilter, query: SearchQuery): Promise<SearchResult> {
    const { number, size } = query.page;
    const page = await this.listings.search({
      filter,
      sort: {
        by: query.sort.by,
        direction: query.sort.direction ?? defaultDirection(query.sort.by),
      },
      page: query.page,
      studentId: query.studentId,
      now: new Date(),
    });

    return {
      mode: 'LIST',
      items: page.items,
      page: number,
      size,
      total: page.total,
      hasNext: (number + 1) * size < page.total,
    };
  }

  /**
   * §8.3 — aggregates only, never rows.
   *
   * `total` comes from the search repository so it is exactly the LIST total for the same body
   * (§12.15). The facets come from the shared facet port, which is scoped by type, category and
   * location only: a bucket can therefore exceed `total` once a price, attribute or text filter is
   * also set. Level 1 accepts that — narrowing the facets to the full filter means a second family
   * of aggregate SQL, and the client uses them to label the filter screen, not to add up.
   */
  private async count(
    filter: SearchFilter,
    studentId: string | null,
    categories: Map<string, CategoryInfo>,
  ): Promise<SearchResult> {
    const [total, facets] = await Promise.all([
      this.listings.count(filter, studentId),
      this.facets.findFacets({
        types: filter.types,
        categoryKeys: filter.categoryKeys,
        geo: filter.geo.point,
      }),
    ]);

    return { mode: 'COUNT', total, facets: shapeFacets(facets, categories) };
  }

  /**
   * §8.2 — one pin per (listing, branch) in the viewport, so a listing offered at three branches is
   * three markers sharing one `listingId` (§12.11). No pagination: `maxMarkers` is the only bound.
   *
   * D15 keeps the two counts apart: `total` is LISTINGS, identical to what LIST and COUNT answer
   * for the same filter, while `markersTotal` counts MARKERS and may exceed it.
   *
   * Clustering reads the markers in memory, so the scan is bounded by the spec's own ceiling rather
   * than by `maxMarkers` — with `maxMarkers: 500` a cluster then still counts the offers of up to
   * 2000 pins instead of the first 500. Whatever the scan or the cap left out, `truncated` says so.
   */
  private async map(filter: SearchFilter, query: SearchQuery): Promise<SearchResult> {
    const { zoom, clusterize, maxMarkers } = query.map ?? DEFAULT_MAP_VIEW;
    const view = await this.listings.searchMarkers({
      filter,
      studentId: query.studentId,
      limit: clusterize ? MAX_MARKERS : maxMarkers,
    });

    const shaped =
      clusterize && view.markersTotal > maxMarkers
        ? clusterMarkers(view.markers, zoom)
        : { markers: view.markers, clusters: [] };
    // Clustering can leave more lone markers than were asked for; the cut is already declared.
    const markers = shaped.markers.slice(0, maxMarkers);

    return {
      mode: 'MAP',
      markers,
      clusters: shaped.clusters,
      bounds: mapBounds(markers, shaped.clusters),
      total: view.total,
      markersTotal: view.markersTotal,
      // Every marker present on its own → nothing was dropped and nothing was folded.
      truncated: markers.length < view.markersTotal,
    };
  }

  /**
   * Q3 — `groupKeys` expand to their member types and explicit `types` narrow that expansion.
   * Neither given is a 422, not an empty result: "everything" must never be reachable.
   */
  private async resolveTypes(query: SearchQuery): Promise<string[]> {
    const { groupKeys, types } = query.filter;

    if (groupKeys.length === 0 && types.length === 0) {
      // Favourites are the documented Q3 exception (§9): the set is already bounded by what this
      // student saved, so "everything I saved" is a legitimate request. The caps below exist to
      // bound the OPEN feed's query and would otherwise reject the full catalog we stand in.
      if (query.typeScope === 'OPTIONAL') {
        const groups = await this.catalog.findGroups();
        return groups.flatMap((group) => group.typeKeys);
      }
      throw feedError(ERROR_CODE.TYPE_REQUIRED, 'Yo‘nalish yoki turni tanlang', {
        'filter.types': 'Kamida bitta tur yoki guruh tanlanishi shart',
      });
    }
    // D1: the cap is on groups, not on what they expand to — three groups may be 30 types.
    if (groupKeys.length > MAX_GROUPS) {
      throw feedError(ERROR_CODE.TOO_MANY_GROUPS, 'Juda ko‘p guruh tanlandi', {
        'filter.groupKeys': `Ko‘pi bilan ${MAX_GROUPS} ta guruh tanlanadi`,
      });
    }
    if (types.length > MAX_EXPLICIT_TYPES) {
      throw feedError(ERROR_CODE.TOO_MANY_TYPES, 'Juda ko‘p tur tanlandi', {
        'filter.types': `Ko‘pi bilan ${MAX_EXPLICIT_TYPES} ta tur tanlanadi`,
      });
    }

    const groups = await this.catalog.findGroups();
    const byGroup = new Map(groups.map((group) => [group.key, group.typeKeys]));

    const unknownGroups = groupKeys.filter((key) => !byGroup.has(key));
    if (unknownGroups.length > 0) {
      throw feedError(ERROR_CODE.UNKNOWN_GROUP, 'Noma’lum katalog guruhi', {
        'filter.groupKeys': `Katalogda bunday guruh yo‘q: ${unknownGroups.join(', ')}`,
      });
    }

    const catalogTypes = new Set(groups.flatMap((group) => group.typeKeys));
    const unknownTypes = types.filter((type) => !catalogTypes.has(type));
    if (unknownTypes.length > 0) {
      throw feedError(ERROR_CODE.UNKNOWN_TYPE, 'Noma’lum biznes turi', {
        'filter.types': `Katalogda bunday tur yo‘q: ${unknownTypes.join(', ')}`,
      });
    }

    const expanded = groupKeys.flatMap((key) => byGroup.get(key) ?? []);
    if (types.length === 0) {
      return [...new Set(expanded)];
    }

    const outside = types.filter((type) => !expanded.includes(type));
    if (groupKeys.length > 0 && outside.length > 0) {
      throw feedError(ERROR_CODE.TYPE_GROUP_MISMATCH, 'Tur va guruh mos kelmadi', {
        'filter.types': `Tanlangan guruhlarga kirmaydigan tur: ${outside.join(', ')}`,
      });
    }
    return [...new Set(types)];
  }

  /** Category key → label and owning type, across every selected type. */
  private async loadCategories(types: string[]): Promise<Map<string, CategoryInfo>> {
    const perType = await Promise.all(types.map((type) => this.catalog.findCategoriesByType(type)));
    const categories = new Map<string, CategoryInfo>();

    perType.forEach((list, index) => {
      for (const category of list ?? []) {
        // CLOTHING repeats keys per gender; a filter may use either, but the base list carries the
        // canonical label.
        const known = categories.get(category.key);
        if (known === undefined || (known.gender !== null && category.gender === null)) {
          categories.set(category.key, {
            nameUz: category.nameUz,
            typeKey: types[index],
            gender: category.gender,
          });
        }
      }
    });
    return categories;
  }

  private validateCategories(categoryKeys: string[], categories: Map<string, CategoryInfo>): void {
    const unknown = categoryKeys.filter((key) => !categories.has(key));
    if (unknown.length > 0) {
      throw feedError(ERROR_CODE.UNKNOWN_CATEGORY, 'Kategoriya tanlangan turlarga tegishli emas', {
        'filter.categoryKeys': `Tanlangan turlarda bunday kategoriya yo‘q: ${unknown.join(', ')}`,
      });
    }
  }

  /**
   * §5 — the catalog decides which operators an attribute accepts, so the client never has to infer
   * them from a kind it hard-coded. Technical keys (`_regular`, `_gender`, `_phone`) are not in the
   * catalog by design (D18) and pass through untouched.
   */
  private async validateAttributes(types: string[], attributes: AttributeFilter[]): Promise<void> {
    const named = attributes.filter((attribute) => !attribute.key.startsWith('_'));
    if (named.length === 0) {
      return;
    }

    const specs = await Promise.all(
      types.map((type) => this.catalog.findAttributeSpecs(type, ALL_CATEGORY_KEY)),
    );
    const kinds = new Map<string, AttributeFieldType[]>();
    for (const spec of specs.flat()) {
      kinds.set(spec.key, [...(kinds.get(spec.key) ?? []), spec.kind]);
    }

    attributes.forEach((attribute, index) => {
      if (attribute.key.startsWith('_')) {
        return;
      }
      const declared = kinds.get(attribute.key);
      if (declared === undefined) {
        throw feedError(ERROR_CODE.UNKNOWN_ATTRIBUTE, 'Noma’lum atribut', {
          [`filter.attributes[${index}].key`]: `Tanlangan turlarda "${attribute.key}" atributi yo‘q`,
        });
      }
      // A key shared by several types keeps its own kind in each; one accepting kind is enough.
      const allowed = declared.some((kind) => ALLOWED_ATTRIBUTE_OPS[kind].includes(attribute.op));
      if (!allowed) {
        throw feedError(ERROR_CODE.ATTRIBUTE_OP_MISMATCH, 'Atribut sharti mos kelmadi', {
          [`filter.attributes[${index}].op`]: `"${attribute.key}" atributiga ${attribute.op} sharti qo‘llanmaydi`,
        });
      }
    });
  }

  /** The checks that need no catalog round-trip, so a bad request fails before any query. */
  private validateRequest(query: SearchQuery): void {
    if (query.mode === 'MAP') {
      this.validateMapRequest(query);
    }
    // Any mode may narrow by a viewport, so an unusable one is rejected in all three.
    if (query.filter.geo.bbox !== null) {
      validateBbox(query.filter.geo.bbox);
    }

    if (query.page.size > MAX_PAGE_SIZE) {
      throw feedError(ERROR_CODE.PAGE_SIZE_EXCEEDED, 'Sahifa hajmi juda katta', {
        'page.size': `Bir sahifada ko‘pi bilan ${MAX_PAGE_SIZE} ta e’lon`,
      });
    }

    const { min, max } = query.filter.price;
    if (min !== null && max !== null && min > max) {
      throw feedError(ERROR_CODE.INVALID_PRICE_RANGE, 'Narx oralig‘i noto‘g‘ri', {
        'filter.price.min': 'Eng kam narx eng yuqori narxdan katta bo‘lmasin',
      });
    }

    if (query.sort.by === 'DISTANCE' && query.filter.geo.point === null) {
      throw feedError(
        ERROR_CODE.GEO_REQUIRED_FOR_SORT,
        'Yaqinlik bo‘yicha saralash uchun joylashuv kerak',
        { 'sort.by': 'Yaqinlik bo‘yicha saralash uchun lat/lng yuboring' },
      );
    }

    // The feed itself is public (D5), but "only my favourites" cannot be answered anonymously.
    if (query.filter.flags.favoritesOnly && query.studentId === null) {
      throw AppException.unauthorized('Sevimlilarni ko‘rish uchun tizimga kiring');
    }

    query.filter.attributes.forEach((attribute, index) => {
      if (!hasOperand(attribute)) {
        throw AppException.validation({
          [`filter.attributes[${index}].op`]: `${attribute.op} sharti uchun qiymat yuborilmadi`,
        });
      }
    });
  }

  /**
   * MAP's own §10 limits. A map is a viewport, so it is answered for a place and never for the
   * whole country: without a box or a point there is nothing to draw, and the request is a 422
   * rather than a nationwide scan.
   */
  private validateMapRequest(query: SearchQuery): void {
    const { maxMarkers } = query.map ?? DEFAULT_MAP_VIEW;
    if (maxMarkers > MAX_MARKERS) {
      throw feedError(ERROR_CODE.PAGE_SIZE_EXCEEDED, 'Xarita belgilari soni juda ko‘p', {
        'map.maxMarkers': `Xaritada ko‘pi bilan ${MAX_MARKERS} ta belgi ko‘rsatiladi`,
      });
    }

    const { point, bbox } = query.filter.geo;
    if (point === null && bbox === null) {
      throw feedError(ERROR_CODE.GEO_REQUIRED, 'Xarita uchun joylashuv kerak', {
        'filter.geo': 'Xarita rejimida bbox yoki lat/lng yuborilishi shart',
      });
    }
  }
}

/** §10 — a box that cannot be drawn, or one that cannot hold an Uzbek branch (D: lat 37..46). */
function validateBbox(bbox: GeoBox): void {
  if (bbox.minLat > bbox.maxLat) {
    throw feedError(ERROR_CODE.INVALID_BBOX, 'Xarita chegarasi noto‘g‘ri', {
      'filter.geo.bbox.minLat': 'Quyi kenglik yuqori kenglikdan katta bo‘lmasin',
    });
  }
  if (bbox.minLng > bbox.maxLng) {
    throw feedError(ERROR_CODE.INVALID_BBOX, 'Xarita chegarasi noto‘g‘ri', {
      'filter.geo.bbox.minLng': 'Quyi uzunlik yuqori uzunlikdan katta bo‘lmasin',
    });
  }
  if (
    !isWithinUzbekistan(bbox.minLat, bbox.minLng) ||
    !isWithinUzbekistan(bbox.maxLat, bbox.maxLng)
  ) {
    throw feedError(ERROR_CODE.INVALID_BBOX, 'Xarita chegarasi noto‘g‘ri', {
      'filter.geo.bbox': 'Chegara O‘zbekiston hududidan tashqarida',
    });
  }
}

/** A 422 with a code specific enough to act on (D4); `error.fields` is always filled. */
function feedError(code: ErrorCode, message: string, fields: Record<string, string>): AppException {
  return new AppException(code, 422, message, fields);
}

/** Whether the operator's operand (§5) actually arrived — `IN` without `values` builds nothing. */
function hasOperand(attribute: AttributeFilter): boolean {
  switch (ATTRIBUTE_OPERAND[attribute.op]) {
    case 'VALUE':
      return attribute.text !== null || attribute.number !== null || attribute.boolean !== null;
    case 'VALUES':
      return attribute.values.length > 0;
    case 'RANGE':
      return attribute.min !== null || attribute.max !== null;
    case 'NUMBER':
      return attribute.number !== null;
    case 'TEXT':
      return attribute.text !== null;
    case 'NONE':
      return true;
  }
}

/** Facet buckets → the §8.3 wire shape, with catalog labels folded in. */
function shapeFacets(facets: ListingFacets, categories: Map<string, CategoryInfo>): CountFacets {
  const typeCounts = new Map<string, number>();
  for (const category of facets.categories) {
    // A type's count is the sum of its categories' — the same listings, grouped one level up.
    const typeKey = categories.get(category.key)?.typeKey;
    if (typeKey !== undefined) {
      typeCounts.set(typeKey, (typeCounts.get(typeKey) ?? 0) + category.count);
    }
  }

  const byAttribute: Record<string, { value: string; count: number }[]> = {};
  for (const attribute of facets.attributes) {
    byAttribute[attribute.key] = [
      ...(byAttribute[attribute.key] ?? []),
      { value: attribute.value, count: attribute.count },
    ];
  }

  return {
    byCategory: facets.categories.map((category) => ({
      key: category.key,
      label: categories.get(category.key)?.nameUz ?? category.key,
      count: category.count,
    })),
    byType: [...typeCounts].map(([key, count]) => ({ key, count })),
    byDistrict: facets.districts,
    byDiscountType: facets.discountTypes,
    byListingKind: [
      { key: 'DISCOUNT', count: facets.listingKind.discount },
      { key: 'REGULAR', count: facets.listingKind.regular },
    ],
    byAttribute,
    priceRange: facets.priceRange,
    discountRange:
      facets.discountPercentRange === null
        ? null
        : {
            minPercent: facets.discountPercentRange.min,
            maxPercent: facets.discountPercentRange.max,
          },
  };
}
