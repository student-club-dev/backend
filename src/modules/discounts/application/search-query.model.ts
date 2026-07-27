import type { GeoBox } from '../../../common/geo/geo-box';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import type { DiscountCard } from '../domain/discount-card.model';
import type { MapMarker } from '../domain/map-marker.model';
import type {
  AttributeOp,
  SearchFilter,
  SearchMode,
  SortBy,
  SortDirection,
} from '../domain/search.repository';

/**
 * The search request as it arrives from the controller: `groupKeys` is still unexpanded and
 * `filter.types` still holds the client's explicit list. {@link SearchService} resolves the two
 * into the `types` of a domain `SearchCriteria` (Q3), which is why this model reuses
 * {@link SearchFilter} instead of restating twenty filter fields.
 */
export interface SearchQuery {
  mode: SearchMode;
  filter: SearchFilter & { groupKeys: string[] };
  /** `direction` null → the per-sort default below. */
  sort: { by: SortBy; direction: SortDirection | null };
  page: { number: number; size: number };
  /** Non-null only for a signed-in student (D5). */
  studentId: string | null;
  /**
   * Whether Q3 applies. 'REQUIRED' (the default) on the open feed — "everything" must never be
   * reachable. 'OPTIONAL' only for favourites, which are already bounded by the student's own set.
   */
  typeScope?: 'REQUIRED' | 'OPTIONAL';
  /** How to draw the map; MAP mode only. Absent → {@link DEFAULT_MAP_VIEW}. */
  map?: MapView;
}

/** The request's `map` block (§4). */
export interface MapView {
  /** Web-Mercator zoom — how coarsely markers may be grouped (§8.2). */
  zoom: number;
  clusterize: boolean;
  maxMarkers: number;
}

/**
 * §10 "Chegaralar": `maxMarkers` default 500. The zoom default is the spec's own example (§4) —
 * a city-level view, which is what a map opens on.
 */
export const DEFAULT_MAP_VIEW: MapView = { zoom: 13, clusterize: false, maxMarkers: 500 };

/** Nearby markers collapsed into one pin (§8.2). */
export interface MapCluster {
  lat: number;
  lng: number;
  count: number;
  bbox: GeoBox;
  minPrice: number;
  /** Null when no member of the cluster is discounted (Q0). */
  maxDiscountPercent: number | null;
}

/**
 * STUDENT_FEED.md §6: DISTANCE and PRICE_* read best ascending, the rest descending.
 *
 * ENDING_SOON is the one deliberate departure. §6's blanket "everything else → DESC" would put the
 * listings that expire LAST at the top of a sort literally named "ending soon"; the client always
 * means the opposite, and it can still send `direction: "DESC"` explicitly.
 */
export function defaultDirection(by: SortBy): SortDirection {
  return by === 'DISTANCE' ||
    by === 'PRICE_FINAL' ||
    by === 'PRICE_ORIGINAL' ||
    by === 'ENDING_SOON'
    ? 'ASC'
    : 'DESC';
}

/** Which operators each attribute kind accepts (§5). Anything else → 422 ATTRIBUTE_OP_MISMATCH. */
export const ALLOWED_ATTRIBUTE_OPS: Record<AttributeFieldType, AttributeOp[]> = {
  [AttributeFieldType.TEXT]: ['EQ', 'NEQ', 'CONTAINS', 'EXISTS'],
  [AttributeFieldType.NUMBER]: ['EQ', 'NEQ', 'BETWEEN', 'GTE', 'LTE', 'EXISTS'],
  [AttributeFieldType.BOOLEAN]: ['EQ', 'EXISTS'],
  [AttributeFieldType.SELECT]: ['EQ', 'NEQ', 'IN', 'NOT_IN', 'EXISTS'],
  [AttributeFieldType.MULTI_SELECT]: ['ANY', 'ALL', 'EXISTS'],
  [AttributeFieldType.TAGS]: ['ANY', 'ALL', 'EXISTS'],
};

/** Which operand an operator reads (§5) — an operator without its operand cannot be built. */
export const ATTRIBUTE_OPERAND: Record<
  AttributeOp,
  'VALUE' | 'VALUES' | 'RANGE' | 'NUMBER' | 'TEXT' | 'NONE'
> = {
  EQ: 'VALUE',
  NEQ: 'VALUE',
  IN: 'VALUES',
  NOT_IN: 'VALUES',
  BETWEEN: 'RANGE',
  GTE: 'NUMBER',
  LTE: 'NUMBER',
  CONTAINS: 'TEXT',
  ANY: 'VALUES',
  ALL: 'VALUES',
  EXISTS: 'NONE',
};

/** COUNT facets, already shaped for the wire (§8.3). */
export interface CountFacets {
  byCategory: { key: string; label: string; count: number }[];
  byType: { key: string; count: number }[];
  byDistrict: { key: string; count: number }[];
  byDiscountType: { key: string; count: number }[];
  byListingKind: { key: string; count: number }[];
  byAttribute: Record<string, { value: string; count: number }[]>;
  priceRange: { min: number; max: number } | null;
  discountRange: { minPercent: number; maxPercent: number } | null;
}

/**
 * The three response shapes, discriminated by mode. LIST is exactly `{items, page, size, total,
 * hasNext}` — no cursor, no meta, no facets (D3).
 */
export type SearchResult =
  | {
      mode: 'LIST';
      items: DiscountCard[];
      page: number;
      size: number;
      total: number;
      hasNext: boolean;
    }
  | { mode: 'COUNT'; total: number; facets: CountFacets }
  | {
      mode: 'MAP';
      markers: MapMarker[];
      clusters: MapCluster[];
      /** Extent of what is actually returned; null when the viewport holds nothing. */
      bounds: GeoBox | null;
      /** LISTINGS — the very number LIST and COUNT report for the same filter (D15). */
      total: number;
      /** MARKERS (listing × branch); larger than `total` whenever a listing spans branches (D15). */
      markersTotal: number;
      /** True whenever a marker was dropped or folded into a cluster — never a silent cut. */
      truncated: boolean;
    };
