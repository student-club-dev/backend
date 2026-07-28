import { Prisma } from '@prisma/client';
import { BRANCH_INCLUDE, BranchMapper } from '../../branches/infrastructure/branch.mapper';
import { AdminBranch, AdminBranchSummary } from '../domain/entities/admin-branch.entity';

// Summary projects only the columns the list renders, plus the joined display names.
export const ADMIN_BRANCH_SUMMARY_SELECT = {
  id: true,
  businessId: true,
  name: true,
  regionId: true,
  address: true,
  lat: true,
  lng: true,
  isActive: true,
  business: { select: { name: true } },
  region: { select: { nameUz: true } },
  district: { select: { nameUz: true } },
  tradeCenter: { select: { name: true } },
} satisfies Prisma.BranchSelect;

// Detail reads the full branch (BRANCH_INCLUDE lets BranchMapper.toDomain map it) plus the business
// name and the region / district names the location DTO surfaces.
export const ADMIN_BRANCH_DETAIL_INCLUDE = {
  ...BRANCH_INCLUDE,
  business: { select: { name: true } },
  region: { select: { nameUz: true } },
  district: { select: { nameUz: true } },
} satisfies Prisma.BranchInclude;

type AdminBranchSummaryRow = Prisma.BranchGetPayload<{
  select: typeof ADMIN_BRANCH_SUMMARY_SELECT;
}>;
type AdminBranchDetailRow = Prisma.BranchGetPayload<{
  include: typeof ADMIN_BRANCH_DETAIL_INCLUDE;
}>;

/** Maps admin branch read rows to plain domain objects. Prisma is used ONLY in the repository. */
export class AdminBranchMapper {
  static toSummary(row: AdminBranchSummaryRow): AdminBranchSummary {
    return {
      id: row.id,
      businessId: row.businessId,
      businessName: row.business.name,
      name: row.name,
      regionId: row.regionId,
      regionName: row.region.nameUz,
      districtName: row.district.nameUz,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      isActive: row.isActive,
      tradeCenterName: row.tradeCenter === null ? null : row.tradeCenter.name,
    };
  }

  static toDetail(row: AdminBranchDetailRow): AdminBranch {
    return {
      // The detail row carries every branch relation BRANCH_INCLUDE needs, so the shared mapper maps
      // location, working hours, delivery zone and trade-center fields for us.
      branch: BranchMapper.toDomain(row),
      businessName: row.business.name,
      regionName: row.region.nameUz,
      districtName: row.district.nameUz,
    };
  }
}
