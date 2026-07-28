import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { AdminBusiness, AdminBusinessSummary } from './entities/admin-business.entity';
import { AdminBusinessSort } from './enums/admin-business-sort.enum';

/** Injection token for the admin business read port (bound to the Prisma impl). */
export const ADMIN_BUSINESS_READ_REPOSITORY = Symbol('ADMIN_BUSINESS_READ_REPOSITORY');

/**
 * Filters for the admin business list. Every field narrows (AND); `null` / empty means "no
 * constraint". `page`/`size` are 1-based and already defaulted by the presentation layer.
 */
export interface AdminBusinessListFilter {
  /** Free text against name / legalName / inn / phone (case-insensitive contains). */
  q: string | null;
  ownerId: string | null;
  /** One or more statuses to keep; empty means every status (admin sees ARCHIVED too). */
  statuses: BusinessStatus[];
  /** Business type key (FK to business_types). */
  type: string | null;
  /** Keep businesses that have at least one branch in this region. */
  regionId: string | null;
  isOnlineOnly: boolean | null;
  createdFrom: Date | null;
  createdTo: Date | null;
  sort: AdminBusinessSort;
  page: number;
  size: number;
}

/** A page of admin business summaries plus the unpaginated total (the DTO derives `hasNext`). */
export interface AdminBusinessPage {
  items: AdminBusinessSummary[];
  total: number;
}

/** Read-only, unscoped access to every `businesses` row for the admin panel. Prisma-backed. */
export interface AdminBusinessReadRepository {
  /** The filtered, paginated business list across all owners. */
  list(filter: AdminBusinessListFilter): Promise<AdminBusinessPage>;

  /** The full business record plus owner summary and branch count, or `null` if none. */
  findById(id: string): Promise<AdminBusiness | null>;
}
