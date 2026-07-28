import { BusinessStatus } from '../../../business/domain/enums/business-status.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { AdminUserStatus } from '../enums/admin-user-status.enum';

/**
 * A business-owner row as the admin list shows it. `businessesCount` is the number of businesses the
 * owner has (Prisma `_count`). Pure domain type; mapped from the Prisma row (never `passwordHash`).
 */
export interface AdminBusinessOwnerSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  email: string | null;
  businessesCount: number;
  status: AdminUserStatus;
  bannedAt: Date | null;
  banReason: string | null;
  createdAt: Date;
}

/**
 * The full business-owner record for the admin detail view — every `business_owners` column EXCEPT
 * `passwordHash`, plus `businessesCount`.
 */
export interface AdminBusinessOwner {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  gender: Gender | null;
  businessesCount: number;
  status: AdminUserStatus;
  bannedAt: Date | null;
  banReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A business belonging to an owner, as the admin owner-detail view lists them. */
export interface AdminOwnerBusinessSummary {
  id: string;
  name: string;
  type: string;
  status: BusinessStatus;
  listingsCount: number;
  createdAt: Date;
}
