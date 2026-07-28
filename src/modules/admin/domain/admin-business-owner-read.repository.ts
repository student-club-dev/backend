import {
  AdminBusinessOwner,
  AdminBusinessOwnerSummary,
  AdminOwnerBusinessSummary,
} from './entities/admin-business-owner.entity';
import { AdminUserSort } from './enums/admin-user-sort.enum';

/** Injection token for the admin business-owner read port (bound to the Prisma impl). */
export const ADMIN_BUSINESS_OWNER_READ_REPOSITORY = Symbol('ADMIN_BUSINESS_OWNER_READ_REPOSITORY');

/**
 * Filters for the admin business-owner list. Every field narrows (AND); `null` means "no
 * constraint". `page`/`size` are 1-based and already defaulted by the presentation layer.
 */
export interface AdminOwnerListFilter {
  /** Free text against firstName / lastName / phoneNumber / email (case-insensitive). */
  q: string | null;
  phoneVerified: boolean | null;
  createdFrom: Date | null;
  createdTo: Date | null;
  sort: AdminUserSort;
  page: number;
  size: number;
}

/** A page of admin business-owner summaries plus the unpaginated total. */
export interface AdminBusinessOwnerPage {
  items: AdminBusinessOwnerSummary[];
  total: number;
}

/** Read-only, unscoped access to every `business_owners` row for the admin panel. Prisma-backed. */
export interface AdminBusinessOwnerReadRepository {
  /** The filtered, paginated business-owner list across all owners. */
  list(filter: AdminOwnerListFilter): Promise<AdminBusinessOwnerPage>;

  /** The full owner record (minus `passwordHash`) plus `businessesCount`, or `null` if none. */
  findById(id: string): Promise<AdminBusinessOwner | null>;

  /** Whether an owner with this id exists. */
  exists(id: string): Promise<boolean>;

  /** Every business belonging to the owner (all statuses — admin sees everything). */
  listBusinesses(ownerId: string): Promise<AdminOwnerBusinessSummary[]>;
}
