import { Branch } from '../../../branches/domain/entities/branch.entity';

/**
 * A branch row as the admin list shows it. Names are resolved from the joined business / region /
 * district / trade center (nullable when the branch is not in a center). Pure domain type.
 */
export interface AdminBranchSummary {
  id: string;
  businessId: string;
  businessName: string;
  name: string;
  regionId: string;
  regionName: string;
  districtName: string;
  address: string;
  lat: number;
  lng: number;
  isActive: boolean;
  tradeCenterName: string | null;
}

/**
 * The full branch record for the admin detail view — every branch field (via the shared
 * {@link Branch} entity) plus the joined business name and the location's region / district names.
 * Admin sees any branch across businesses.
 */
export interface AdminBranch {
  branch: Branch;
  businessName: string;
  regionName: string;
  districtName: string;
}
