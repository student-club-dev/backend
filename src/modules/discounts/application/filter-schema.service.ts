import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception';
import { CATALOG_REPOSITORY, CatalogRepository } from '../../catalog/domain/catalog.repository';
import { AttributeSpec } from '../../catalog/domain/entities/attribute-spec.entity';
import { FACET_REPOSITORY, FacetRepository } from '../domain/facet.repository';
import { FacetCount, GeoScope } from '../domain/facets.model';
import { ShapedAttributeFacet, shapeAttributeFacets } from './attribute-facet.shaper';

/** The type-wide category every business type declares; used to pull the type-level specs. */
const ALL_CATEGORY_KEY = 'ALL';

/** A category's display label, and whether it was only found in a per-gender list. */
interface CategoryLabel {
  nameUz: string;
  typeKey: string;
  fromGenderedList: boolean;
}

/** What the client asked to build a filter screen for. */
export interface FilterSchemaQuery {
  groupKeys: string[];
  types: string[];
  categoryKeys: string[];
  geo: GeoScope | null;
}

export interface SortOption {
  key: string;
  label: string;
  requiresGeo: boolean;
}

/** Sorts the feed offers, and whether each needs coordinates (STUDENT_FEED.md §6). */
const SORTS: SortOption[] = [
  { key: 'DISTANCE', label: 'Yaqinlik', requiresGeo: true },
  { key: 'PRICE_FINAL', label: 'Arzon', requiresGeo: false },
  { key: 'DISCOUNT_PERCENT', label: 'Chegirma %', requiresGeo: false },
  { key: 'NEWEST', label: 'Yangi', requiresGeo: false },
  { key: 'ENDING_SOON', label: 'Tugayapti', requiresGeo: false },
  { key: 'POPULAR', label: 'Ommabop', requiresGeo: false },
];

export interface FilterSchema {
  types: { key: string; nameUz: string; emoji: string | null; listingsCount: number }[];
  categories: { key: string; label: string; typeKey: string; count: number }[];
  attributes: ShapedAttributeFacet[];
  listingKind: FacetCount[];
  priceUnits: FacetCount[];
  priceRange: { min: number; max: number } | null;
  discountTypes: FacetCount[];
  discountPercentRange: { min: number; max: number } | null;
  redemptionMethods: FacetCount[];
  regions: FacetCount[];
  districts: FacetCount[];
  tradeCenters: FacetCount[];
  sorts: SortOption[];
  total: number;
}

/**
 * Builds the filter screen's schema (STUDENT_FEED.md §9, Q6): the catalog says what *could* be
 * filtered, the facets say what *actually occurs*, and only their intersection is returned — so
 * the user can never pick a filter that yields nothing.
 */
@Injectable()
export class FilterSchemaService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(FACET_REPOSITORY) private readonly facets: FacetRepository,
  ) {}

  async getSchema(query: FilterSchemaQuery): Promise<FilterSchema> {
    const types = await this.resolveTypes(query);
    const scope = { types, categoryKeys: query.categoryKeys, geo: query.geo };

    const [facets, typeInfos, specs, categoryLabels] = await Promise.all([
      this.facets.findFacets(scope),
      this.catalog.findBusinessTypesByGroups(query.groupKeys),
      this.collectSpecs(types),
      this.collectCategoryLabels(types),
    ]);

    const categories = facets.categories
      .filter((category) => categoryLabels.has(category.key))
      .map((category) => {
        const label = categoryLabels.get(category.key);
        return {
          key: category.key,
          label: label?.nameUz ?? category.key,
          typeKey: label?.typeKey ?? '',
          count: category.count,
        };
      });

    // A type's count is the sum of its categories' — the same listings, grouped one level up.
    const typeCounts = new Map<string, number>();
    for (const category of categories) {
      typeCounts.set(category.typeKey, (typeCounts.get(category.typeKey) ?? 0) + category.count);
    }

    return {
      types: typeInfos
        .filter((info) => types.includes(info.type))
        .map((info) => ({
          key: info.type,
          nameUz: info.nameUz,
          emoji: info.emoji,
          listingsCount: typeCounts.get(info.type) ?? 0,
        })),
      categories,
      attributes: shapeAttributeFacets(facets.attributes, specs),
      listingKind: [
        { key: 'ALL', count: facets.total },
        { key: 'DISCOUNT', count: facets.listingKind.discount },
        { key: 'REGULAR', count: facets.listingKind.regular },
      ],
      priceUnits: facets.priceUnits,
      priceRange: facets.priceRange,
      discountTypes: facets.discountTypes,
      discountPercentRange: facets.discountPercentRange,
      redemptionMethods: facets.redemptionMethods,
      regions: facets.regions,
      districts: facets.districts,
      tradeCenters: facets.tradeCenters,
      sorts: SORTS,
      total: facets.total,
    };
  }

  /**
   * `groupKeys` expand to their member types; explicit `types` narrow that expansion. A type that
   * is not in the chosen groups is a client bug, not an empty result — hence 422.
   */
  private async resolveTypes(query: FilterSchemaQuery): Promise<string[]> {
    const groups = await this.catalog.findGroups();
    const known = new Map(groups.map((group) => [group.key, group.typeKeys]));

    const unknown = query.groupKeys.filter((key) => !known.has(key));
    if (unknown.length > 0) {
      throw AppException.validation(
        { groupKeys: `Katalogda bunday guruh yo‘q: ${unknown.join(', ')}` },
        'Noma’lum katalog guruhi',
      );
    }

    const expanded = query.groupKeys.flatMap((key) => known.get(key) ?? []);
    if (query.types.length === 0) {
      return expanded;
    }

    const outside = query.types.filter((type) => !expanded.includes(type));
    if (outside.length > 0) {
      throw AppException.validation(
        { types: `Tanlangan guruhlarga kirmaydigan tur: ${outside.join(', ')}` },
        'Tur va guruh mos kelmadi',
      );
    }
    return query.types;
  }

  /** Attribute specs of every selected type (type-level plus the ALL-category ones). */
  private async collectSpecs(types: string[]): Promise<AttributeSpec[]> {
    const perType = await Promise.all(
      types.map((type) => this.catalog.findAttributeSpecs(type, ALL_CATEGORY_KEY)),
    );
    return perType.flat();
  }

  /**
   * Category key → its label and owning type, for every selected type.
   *
   * A key can appear in both the base list and a per-gender one (CLOTHING). The base row is the
   * canonical label, but it cannot be the *filter* — six CLOTHING categories (DRESSES, SKIRTS,
   * BLOUSES, SHIRTS, PANTS, SUITS) exist ONLY under `categoriesByGender`. Keeping just
   * `gender === null` rows would drop them from the filter screen even though listings use them.
   */
  private async collectCategoryLabels(types: string[]): Promise<Map<string, CategoryLabel>> {
    const perType = await Promise.all(types.map((type) => this.catalog.findCategoriesByType(type)));
    const labels = new Map<string, CategoryLabel>();
    perType.forEach((categories, index) => {
      for (const category of categories ?? []) {
        const existing = labels.get(category.key);
        const isBase = category.gender === null;
        if (existing === undefined || (existing.fromGenderedList && isBase)) {
          labels.set(category.key, {
            nameUz: category.nameUz,
            typeKey: types[index],
            fromGenderedList: !isBase,
          });
        }
      }
    });
    return labels;
  }
}
