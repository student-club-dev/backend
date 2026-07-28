import { GeoBox } from '../../../common/geo/geo-box';
import { GeoScope } from '../../../common/geo/geo-scope';
import { AdminBranch, AdminBranchSummary } from './entities/admin-branch.entity';
import { AdminBranchSort } from './enums/admin-branch-sort.enum';

/** Injection token for the admin branch read port (bound to the Prisma impl). */
export const ADMIN_BRANCH_READ_REPOSITORY = Symbol('ADMIN_BRANCH_READ_REPOSITORY');

/**
 * The optional proximity constraint on the branch list — either a bounding box (map viewport) or a
 * point + radius. Mutually exclusive; the presentation layer validates that exactly one arrives
 * complete. Both are evaluated against the PostGIS `geo_point` column (`geography`, SRID 4326).
 */
export type AdminBranchGeoFilter =
  { mode: 'BBOX'; box: GeoBox } | { mode: 'RADIUS'; scope: GeoScope };

/**
 * Filters for the admin branch list. Every field narrows (AND); `null` means "no constraint".
 * `page`/`size` are 1-based and already defaulted by the presentation layer.
 */
export interface AdminBranchListFilter {
  /** Free text against name / address (case-insensitive contains). */
  q: string | null;
  businessId: string | null;
  /** Keep only branches whose parent business belongs to this owner. */
  ownerId: string | null;
  regionId: string | null;
  districtId: string | null;
  tradeCenterId: string | null;
  isActive: boolean | null;
  /** Keep only branches whose `deliveryZone.enabled` is true. */
  hasDelivery: boolean | null;
  /** Optional bbox OR radius proximity constraint; `null` means no geo filter. */
  geo: AdminBranchGeoFilter | null;
  sort: AdminBranchSort;
  page: number;
  size: number;
}

/** A page of admin branch summaries plus the unpaginated total (the DTO derives `hasNext`). */
export interface AdminBranchPage {
  items: AdminBranchSummary[];
  total: number;
}

/** Read-only, unscoped access to every `branches` row for the admin panel. Prisma-backed. */
export interface AdminBranchReadRepository {
  /** The filtered, paginated branch list across all businesses. */
  list(filter: AdminBranchListFilter): Promise<AdminBranchPage>;

  /** The full branch record plus business / region / district names, or `null` if none. */
  findById(id: string): Promise<AdminBranch | null>;
}
