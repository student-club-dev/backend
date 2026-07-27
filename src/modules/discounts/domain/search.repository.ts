import type { GeoBox } from '../../../common/geo/geo-box';
import type { GeoScope } from '../../../common/geo/geo-scope';
import type { DiscountCard } from './discount-card.model';
import type { FeedClock } from './feed-time';
import type { MapMarker } from './map-marker.model';

/** Injection token for the search repository port (bound to the Prisma impl in the module). */
export const SEARCH_REPOSITORY = Symbol('SEARCH_REPOSITORY');

/** The three answers the one search endpoint gives: cards, pins, or aggregates (§8). */
export type SearchMode = 'LIST' | 'COUNT' | 'MAP';

/** STUDENT_FEED.md §6. */
export type SortBy =
  | 'DISTANCE'
  | 'DISCOUNT_PERCENT'
  | 'PRICE_FINAL'
  | 'PRICE_ORIGINAL'
  | 'SAVED_AMOUNT'
  | 'NEWEST'
  | 'ENDING_SOON'
  | 'POPULAR'
  | 'RELEVANCE';

export type SortDirection = 'ASC' | 'DESC';

/** Q0 — the feed carries discounted and plain listings alike; this picks one or both. */
export type ListingKind = 'ALL' | 'DISCOUNT' | 'REGULAR';

/** Which price column `filter.price.min/max` compares against. */
export type PriceBasis = 'FINAL' | 'ORIGINAL';

/** STUDENT_FEED.md §5. Operators are generic over `listings.attributes` — never per key (Q6). */
export type AttributeOp =
  | 'EQ'
  | 'NEQ'
  | 'IN'
  | 'NOT_IN'
  | 'BETWEEN'
  | 'GTE'
  | 'LTE'
  | 'CONTAINS'
  | 'ANY'
  | 'ALL'
  | 'EXISTS';

/** Whether several attribute conditions must all hold, or any one of them. */
export type AttributesMatch = 'ALL' | 'ANY';

/**
 * One attribute condition. Which operand a given `op` reads is fixed by §5; the others are null.
 * Values are stored as TEXT in the jsonb, so numeric operators cast — see `search-filter.sql.ts`.
 */
export interface AttributeFilter {
  key: string;
  op: AttributeOp;
  text: string | null;
  number: number | null;
  boolean: boolean | null;
  values: string[];
  min: number | null;
  max: number | null;
}

/**
 * Location narrowing. `point` also drives `distanceMeters` and the DISTANCE sort; `bbox` is the map
 * viewport (§4) and narrows every mode, not only MAP — accepting it and then ignoring it would
 * silently return a nationwide feed. Region/district filter on the listing's branches;
 * `onlineOnly` reads `business.is_online_only`.
 */
export interface GeoFilter {
  point: GeoScope | null;
  bbox: GeoBox | null;
  regionIds: string[];
  districtIds: string[];
  onlineOnly: boolean;
}

export interface PriceFilter {
  min: number | null;
  max: number | null;
  basis: PriceBasis;
  units: string[];
}

export interface DiscountFilter {
  types: string[];
  minPercent: number | null;
  maxPercent: number | null;
  minSavedAmount: number | null;
}

export interface RedemptionFilter {
  methods: string[];
  /** null = no filter; true/false = must / must not carry a promo code. */
  hasPromoCode: boolean | null;
  onlyAvailable: boolean;
}

export interface FlagsFilter {
  withImagesOnly: boolean;
  favoritesOnly: boolean;
  hasDeliveryOnly: boolean;
  newOnly: boolean;
}

/**
 * Time and opening hours (§4 `availability`, D11). Every field is optional; an absent one is no
 * filter at all.
 *
 * `openNow` and `openAt` are two different questions ("open right now" vs "open on Saturday at
 * 19:30"), so both apply when both are asked. The request's `onDay` + `atTime` pair is already
 * resolved into `openAt` — a half-specified pair cannot be represented here, because the DTO
 * refuses it with a 422.
 */
export interface AvailabilityFilter {
  /** Open at the moment the request is served, Tashkent time (UTC+5). */
  openNow: boolean;
  /** Open at the named weekday and time; null = not asked. */
  openAt: FeedClock | null;
  /** The instant the validity window is tested at instead of now(); null = now(). */
  validAt: Date | null;
  /** "Ends within N hours" — `valid_to <= now() + N hours`; null = no filter. */
  endingWithinHours: number | null;
}

/**
 * A fully resolved filter: `types` is the expansion of the request's `groupKeys`/`types` (Q3), and
 * every optional field has been defaulted. Empty array = "no filter on this dimension".
 */
export interface SearchFilter {
  types: string[];
  categoryKeys: string[];
  /** `categoryKey = 'ALL'` listings answer any category request (§12.18). */
  includeAllCategory: boolean;
  /** false → listings carrying a free-text `customCategoryName` are excluded. */
  includeCustomCategories: boolean;
  businessIds: string[];
  branchIds: string[];
  listingIds: string[];
  excludeListingIds: string[];
  query: string | null;
  geo: GeoFilter;
  price: PriceFilter;
  listingKind: ListingKind;
  discount: DiscountFilter;
  redemption: RedemptionFilter;
  flags: FlagsFilter;
  availability: AvailabilityFilter;
  attributes: AttributeFilter[];
  attributesMatch: AttributesMatch;
}

/** Everything one LIST run needs: what to match, how to order it, and who is asking. */
export interface SearchCriteria {
  filter: SearchFilter;
  sort: { by: SortBy; direction: SortDirection };
  /** Zero-based page number (§8.1). */
  page: { number: number; size: number };
  /** Set only for a signed-in student — drives `isFavorite` and `flags.favoritesOnly`. */
  studentId: string | null;
  now: Date;
}

export interface SearchPage {
  items: DiscountCard[];
  total: number;
}

/**
 * One MAP read (§8.2). There is no pagination: the viewport is the page, and `limit` is the hard
 * cap on how many marker rows one read may pull.
 */
export interface MapCriteria {
  filter: SearchFilter;
  studentId: string | null;
  limit: number;
  /** Same role as {@link SearchCriteria.now} — the instant `availability.openNow` is asked about. */
  now: Date;
}

/** The markers a viewport holds, with both counts D15 distinguishes. */
export interface MapMarkerPage {
  /** At most `criteria.limit` rows; `markersTotal` says whether that cut anything. */
  markers: MapMarker[];
  /** Matching LISTINGS — exactly the `total` LIST and COUNT report for the same filter (D15). */
  total: number;
  /** Matching MARKERS (listing × branch). Legitimately larger than `total` (D15). */
  markersTotal: number;
}

/**
 * Read-only search over visible listings (Q4). The application layer depends on this interface
 * only; every SQL detail lives in the infrastructure layer.
 */
export interface SearchRepository {
  /** One page of cards plus the total matching count. */
  search(criteria: SearchCriteria): Promise<SearchPage>;

  /** Matching count only — COUNT mode never loads rows (§8.3). */
  count(filter: SearchFilter, studentId: string | null, now: Date): Promise<number>;

  /** One marker per (listing, branch) inside the viewport, plus both D15 counts. */
  searchMarkers(criteria: MapCriteria): Promise<MapMarkerPage>;
}
