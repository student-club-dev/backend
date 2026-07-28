import { Business } from '../../../business/domain/entities/business.entity';
import { BusinessStatus } from '../../../business/domain/enums/business-status.enum';

/**
 * A business row as the admin list shows it. `ownerFullName` comes from the joined owner (null when
 * the owner has no name set); `listingsCount`/`branchesCount` are Prisma `_count`s. Pure domain type.
 */
export interface AdminBusinessSummary {
  id: string;
  name: string;
  type: string;
  ownerId: string;
  ownerFullName: string | null;
  status: BusinessStatus;
  listingsCount: number;
  branchesCount: number;
  createdAt: Date;
}

/** The joined owner of a business, as the admin business-detail view shows it (display fields only). */
export interface AdminBusinessOwnerRef {
  ownerId: string;
  ownerFullName: string | null;
  ownerPhone: string | null;
}

/**
 * The full business record for the admin detail view — every business field (via the shared
 * {@link Business} entity) plus the joined `owner` summary and `branchesCount`. Admin sees any
 * business regardless of owner or status (including ARCHIVED).
 */
export interface AdminBusiness {
  business: Business;
  owner: AdminBusinessOwnerRef;
  branchesCount: number;
}
