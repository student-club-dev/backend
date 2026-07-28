import { Prisma } from '@prisma/client';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { BusinessMapper } from '../../business/infrastructure/business.mapper';
import { AdminBusiness, AdminBusinessSummary } from '../domain/entities/admin-business.entity';

// Summary projects only the columns the list renders, plus the owner name and the two counts.
export const ADMIN_BUSINESS_SUMMARY_SELECT = {
  id: true,
  name: true,
  type: true,
  ownerId: true,
  status: true,
  createdAt: true,
  owner: { select: { firstName: true, lastName: true } },
  _count: { select: { listings: true, branches: true } },
} satisfies Prisma.BusinessSelect;

// Detail reads the whole business row (via `include`, so BusinessMapper.toDomain gets every scalar)
// plus the owner display fields and the branch count.
export const ADMIN_BUSINESS_DETAIL_INCLUDE = {
  owner: { select: { firstName: true, lastName: true, phoneNumber: true } },
  _count: { select: { branches: true } },
} satisfies Prisma.BusinessInclude;

type AdminBusinessSummaryRow = Prisma.BusinessGetPayload<{
  select: typeof ADMIN_BUSINESS_SUMMARY_SELECT;
}>;
type AdminBusinessDetailRow = Prisma.BusinessGetPayload<{
  include: typeof ADMIN_BUSINESS_DETAIL_INCLUDE;
}>;

/** Joins first/last name into one display string, or null when the owner has neither. */
function fullName(firstName: string | null, lastName: string | null): string | null {
  const name = [firstName, lastName].filter((part) => part !== null && part !== '').join(' ');
  return name === '' ? null : name;
}

/** Maps admin business read rows to plain domain objects. Prisma is used ONLY in the repository. */
export class AdminBusinessMapper {
  static toSummary(row: AdminBusinessSummaryRow): AdminBusinessSummary {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      ownerId: row.ownerId,
      ownerFullName: fullName(row.owner.firstName, row.owner.lastName),
      // The Prisma enum carries the same wire value as the domain enum (looked up by key).
      status: BusinessStatus[row.status],
      listingsCount: row._count.listings,
      branchesCount: row._count.branches,
      createdAt: row.createdAt,
    };
  }

  static toDetail(row: AdminBusinessDetailRow): AdminBusiness {
    return {
      // The detail row carries every business scalar, so the shared mapper handles contacts + status.
      business: BusinessMapper.toDomain(row),
      owner: {
        ownerId: row.ownerId,
        ownerFullName: fullName(row.owner.firstName, row.owner.lastName),
        ownerPhone: row.owner.phoneNumber,
      },
      branchesCount: row._count.branches,
    };
  }
}
