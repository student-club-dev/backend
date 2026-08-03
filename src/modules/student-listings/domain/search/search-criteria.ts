import {
  EmploymentType,
  PropertyType,
  ServiceFormat,
  ServiceType,
  TaskCategory,
  TaskFormat,
  TenantGender,
  WorkShift,
} from '../enums/detail.enums';
import { StudentListingKind } from '../enums/student-listing-kind.enum';

/** §7.2.2 — sort orders. Every one ends in `id DESC` so pages cannot repeat or skip a row. */
export enum ListingSort {
  RELEVANCE = 'RELEVANCE',
  NEWEST = 'NEWEST',
  PRICE_ASC = 'PRICE_ASC',
  PRICE_DESC = 'PRICE_DESC',
  NEAREST = 'NEAREST',
  DEADLINE = 'DEADLINE',
}

export const PAGE_SIZE_DEFAULT = 20;
/** §7.2.2 — a larger request is clamped, not rejected. */
export const PAGE_SIZE_MAX = 50;
/** §7.2.3 — 200 km. Anything larger is effectively "the whole country" anyway. */
export const RADIUS_METERS_MAX = 200_000;

export interface GeoBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/**
 * §7.2.3 — three independent ways to narrow by place, intersected with AND when combined. All of
 * it optional: with nothing set the search covers the whole country.
 */
export interface GeoFilter {
  lat: number | null;
  lng: number | null;
  radiusMeters: number | null;
  regionIds: string[];
  districtIds: string[];
  bbox: GeoBox | null;
}

/**
 * §7.2.1 — the per-kind filters. One flat shape rather than a union: the client leaves stale
 * parameters behind when switching tabs, and §7.2.5 requires those to be ignored silently rather
 * than rejected. The SQL builder reads only the fields belonging to the requested `kind`.
 */
export interface KindFilter {
  // RENTAL
  gender: TenantGender | null;
  propertyType: PropertyType | null;
  minRooms: number | null;
  /** neededTenants > 0 */
  onlyAvailable: boolean;
  // SERVICE
  serviceType: ServiceType | null;
  serviceFormat: ServiceFormat | null;
  onlyFreeTrial: boolean;
  // JOB
  employment: EmploymentType | null;
  jobCategoryKey: string | null;
  shift: WorkShift | null;
  noExperienceOnly: boolean;
  // TASK
  taskCategory: TaskCategory | null;
  taskTypeKey: string | null;
  taskFormat: TaskFormat | null;
  /** deadline still in the future */
  onlyOpenDeadline: boolean;
}

export const EMPTY_KIND_FILTER: KindFilter = {
  gender: null,
  propertyType: null,
  minRooms: null,
  onlyAvailable: false,
  serviceType: null,
  serviceFormat: null,
  onlyFreeTrial: false,
  employment: null,
  jobCategoryKey: null,
  shift: null,
  noExperienceOnly: false,
  taskCategory: null,
  taskTypeKey: null,
  taskFormat: null,
  onlyOpenDeadline: false,
};

/**
 * A resolved search request. Both `POST /search` and `GET /student-listings` produce one of these,
 * so the two endpoints cannot drift in behaviour (§7.2.5).
 */
export interface SearchCriteria {
  /** Mandatory — kinds are never mixed in one list (§7.2.1). */
  kind: StudentListingKind;
  query: string | null;
  geo: GeoFilter | null;
  minPrice: number | null;
  maxPrice: number | null;
  filter: KindFilter;
  sort: ListingSort;
  size: number;
  cursor: string | null;
  /**
   * 1-based page number, for the "jump to page N" mode §7.2.2 also requires. Null selects cursor
   * mode, which is what the infinite scroll uses; a cursor always wins if both arrive.
   */
  page: number | null;
  /** The signed-in student; drives block filtering and `isMine`. */
  viewerId: string;
}

/** One row of the result: the listing plus what the query computed about it. */
export interface SearchHit {
  id: string;
  /** Metres to the nearest pin, or null for a listing with no address (an online TASK). */
  distanceMeters: number | null;
  /** The sort key's value for this row, used to build the next cursor. */
  sortValue: string | number | null;
}

export interface SearchPage {
  hits: SearchHit[];
  hasNext: boolean;
}

/** Offset-mode paging state, resolved from `page`/`size`. */
export interface OffsetWindow {
  page: number;
  offset: number;
}
