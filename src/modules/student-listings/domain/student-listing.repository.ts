import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import type { CursorPosition } from './search/cursor';
import type { SearchCriteria, SearchPage } from './search/search-criteria';
import type {
  ListingOptionGroup,
  StudentListing,
  StudentListingDetails,
} from './entities/student-listing.entity';
import { ListingAudience } from './enums/listing-audience.enum';
import { StudentListingKind } from './enums/student-listing-kind.enum';
import { StudentPriceUnit } from './enums/student-price-unit.enum';

/** Injection token for the student-listing repository port (bound to the Prisma impl). */
export const STUDENT_LISTING_REPOSITORY = Symbol('STUDENT_LISTING_REPOSITORY');

/** A pin to persist. The DB assigns the id and derives `geo_point` from lat/lng by trigger. */
export interface StudentListingBranchData {
  lat: number;
  lng: number;
  address: string;
  name: string | null;
  landmark: string | null;
  regionId: string | null;
  districtId: string | null;
}

/**
 * The whole aggregate to persist. `ownerId`, `status`, `publishedAt` and `searchText` are decided
 * by the service, never by the client; `idempotencyKey` is the request's `Idempotency-Key` header,
 * or null when it sent none.
 */
export interface CreateStudentListingData {
  ownerId: string;
  kind: StudentListingKind;
  title: string;
  description: string | null;
  images: string[];
  priceUnit: StudentPriceUnit | null;
  price: number;
  priceMax: number | null;
  isNegotiable: boolean;
  contactPhone: string | null;
  universityId: string | null;
  audience: ListingAudience;
  branches: StudentListingBranchData[];
  validFrom: Date | null;
  validTo: Date | null;
  attributes: Record<string, string>;
  optionGroups: ListingOptionGroup[];
  details: StudentListingDetails;
  status: ListingStatus;
  publishedAt: Date | null;
  /** Search haystack built by the service; the DB derives `search_vector` from it. */
  searchText: string;
  idempotencyKey: string | null;
}

/**
 * The editable columns. `kind` is immutable after creation, and `ownerId`, `status`, `publishedAt`
 * and `viewsCount` are lifecycle or identity concerns an edit must not touch.
 */
export type UpdateStudentListingData = Omit<
  CreateStudentListingData,
  'ownerId' | 'kind' | 'status' | 'publishedAt' | 'idempotencyKey'
>;

/** `GET /mine` — 1-based page across every status and kind the student owns. */
export interface OwnListingsQuery {
  page: number;
  size: number;
}

export interface StudentListingPage {
  items: StudentListing[];
  total: number;
}

/** The §6 duplicate probe: the same student re-posting the same thing inside the window. */
export interface DuplicateProbe {
  ownerId: string;
  kind: StudentListingKind;
  title: string;
  price: number;
  since: Date;
  /**
   * The listing being published, excluded from its own probe. Publishing an existing DRAFT would
   * otherwise match that same draft — identical owner, kind, title and price — and every submit
   * would fail as a duplicate of itself. Null when the listing does not exist yet.
   */
  excludeId: string | null;
}

/**
 * Data-access port. The application layer depends on this interface only; the Prisma
 * implementation lives in infrastructure.
 *
 * Every read excludes soft-deleted rows — `deletedAt` is an implementation detail of this
 * repository and never reaches the service.
 */
export interface StudentListingRepository {
  /** Persists listing and pins atomically. Returns the stored aggregate. */
  create(data: CreateStudentListingData): Promise<StudentListing>;

  /**
   * The listing a previous request with this `Idempotency-Key` created, or null. Scoped to the
   * owner so one student's key can never surface another student's listing.
   */
  findByIdempotencyKey(ownerId: string, key: string): Promise<StudentListing | null>;

  /** Loads by id with its pins. Null when missing or soft-deleted. */
  findById(id: string): Promise<StudentListing | null>;

  /** Replaces the editable columns and the whole pin set in one transaction. */
  update(id: string, data: UpdateStudentListingData): Promise<StudentListing>;

  /**
   * Sets the status. `publishedAt` is written only when non-null, so re-activating a paused
   * listing keeps the timestamp of its original publication.
   */
  setStatus(id: string, status: ListingStatus, publishedAt: Date | null): Promise<StudentListing>;

  /** Soft delete — stamps `deletedAt`, after which every read here ignores the row. */
  softDelete(id: string): Promise<void>;

  /** A page of the student's own listings, `updatedAt DESC, id DESC`. */
  findPageByOwner(ownerId: string, query: OwnListingsQuery): Promise<StudentListingPage>;

  /** Increments `viewsCount` by one. */
  incrementViews(id: string): Promise<void>;

  /** How many ACTIVE listings the student currently has (§6 cap of 20). */
  countActiveByOwner(ownerId: string): Promise<number>;

  /** How many listings the student published since `since` (§6 cap of 10 a day). */
  countPublishedSince(ownerId: string, since: Date): Promise<number>;

  /** Whether an identical listing already exists inside the window (§6 LISTING_DUPLICATE). */
  existsDuplicate(probe: DuplicateProbe): Promise<boolean>;

  /**
   * Whether either student has blocked the other. Reads the shared `blocks` table in both
   * directions — a blocked pair must not see each other's listings (§7.2.0).
   */
  isBlockedBetween(studentA: string, studentB: string): Promise<boolean>;

  /** Whether the owner's account is ACTIVE. A banned owner's listings disappear (§7.2.0). */
  isOwnerActive(ownerId: string): Promise<boolean>;

  /**
   * The feed query (§7.2). Returns ids in order plus what the query computed — not entities —
   * because the ranking is done in SQL and hydrating rows the caller may discard is wasted work.
   */
  search(
    criteria: SearchCriteria,
    position: CursorPosition | null,
    offset?: number,
  ): Promise<SearchPage>;

  /** The unpaginated total. Only called in page-number mode — see `searchCountQuery`. */
  countSearch(criteria: SearchCriteria): Promise<number>;

  /** Hydrates search hits. Order is not guaranteed; the caller restores the ranking. */
  findManyByIds(ids: string[]): Promise<StudentListing[]>;

  /**
   * Records that `viewerId` looked at `listingId`, returning true only when this is their first
   * view inside the window — which is when `viewsCount` should move (§7.2.0).
   */
  registerView(listingId: string, viewerId: string, since: Date): Promise<boolean>;

  /**
   * The time-driven transitions of §6, applied in one pass as of `now`. Idempotent — each update
   * is guarded by its source status, so a repeated or overlapping run changes nothing extra.
   */
  applyStatusTransitions(now: Date): Promise<StatusTransitionCounts>;
}

/** How many listings each transition moved on one sweep. */
export interface StatusTransitionCounts {
  expired: number;
  activated: number;
}
