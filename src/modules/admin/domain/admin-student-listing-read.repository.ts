import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { StudentListing } from '../../student-listings/domain/entities/student-listing.entity';
import { StudentListingKind } from '../../student-listings/domain/enums/student-listing-kind.enum';

/** Injection token for the admin student-listing read port. */
export const ADMIN_STUDENT_LISTING_READ_REPOSITORY = Symbol(
  'ADMIN_STUDENT_LISTING_READ_REPOSITORY',
);

/**
 * Filters for the admin student-listing list. Every field narrows (AND); `null` / empty means "no
 * constraint". `page`/`size` are 1-based and already defaulted by the presentation layer.
 */
export interface AdminStudentListingListFilter {
  /** Free text against title / description (case-insensitive contains). */
  q: string | null;
  kind: StudentListingKind | null;
  /** Empty means every status — DRAFT and ARCHIVED included, unlike the student-facing search. */
  statuses: ListingStatus[];
  ownerId: string | null;
  /**
   * Whether to include listings their owner already deleted. Off by default: the admin is normally
   * looking for something to act on, and a deleted row cannot be acted on twice.
   */
  includeDeleted: boolean;
  page: number;
  size: number;
}

/** One page, plus the total for the pager. */
export interface AdminStudentListingPage {
  items: StudentListing[];
  total: number;
}

/**
 * Cross-owner reads over student listings (admin-panel 15-deletion.md §5.2).
 *
 * The student-facing repository cannot serve this: every one of its reads is scoped to an owner or
 * to what a viewer may see, and both filters are exactly what an admin must not have. It also hides
 * DRAFT, ARCHIVED and soft-deleted rows — which are precisely the ones worth looking at when
 * something has been reported.
 */
export interface AdminStudentListingReadRepository {
  list(filter: AdminStudentListingListFilter): Promise<AdminStudentListingPage>;

  /** One listing whatever its status, or `null`. Soft-deleted rows are returned too. */
  getById(id: string): Promise<StudentListing | null>;
}
