import { Prisma } from '@prisma/client';
import { PriceUnit } from '../../catalog/domain/enums/price-unit.enum';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { LISTING_INCLUDE, ListingMapper } from '../../listings/infrastructure/listing.mapper';
import { AdminListing, AdminListingSummary } from '../domain/entities/admin-listing.entity';

// Summary projects only the columns the list renders, plus the business name.
export const ADMIN_LISTING_SUMMARY_SELECT = {
  id: true,
  businessId: true,
  title: true,
  images: true,
  categoryKey: true,
  priceUnit: true,
  originalPrice: true,
  finalPrice: true,
  status: true,
  isDiscount: true,
  viewsCount: true,
  validTo: true,
  createdAt: true,
  business: { select: { name: true } },
} satisfies Prisma.ListingSelect;

// Detail reads the whole listing aggregate (the shared LISTING_INCLUDE relations, so
// ListingMapper.toDomain gets every scalar + branches + option groups) plus the business name.
export const ADMIN_LISTING_DETAIL_INCLUDE = {
  ...LISTING_INCLUDE,
  business: { select: { name: true } },
} satisfies Prisma.ListingInclude;

type AdminListingSummaryRow = Prisma.ListingGetPayload<{
  select: typeof ADMIN_LISTING_SUMMARY_SELECT;
}>;
type AdminListingDetailRow = Prisma.ListingGetPayload<{
  include: typeof ADMIN_LISTING_DETAIL_INCLUDE;
}>;

/** Maps admin listing read rows to plain domain objects. Prisma is used ONLY in the repository. */
export class AdminListingMapper {
  static toSummary(row: AdminListingSummaryRow): AdminListingSummary {
    return {
      id: row.id,
      businessId: row.businessId,
      businessName: row.business.name,
      title: row.title,
      imageUrl: row.images[0] ?? null,
      categoryKey: row.categoryKey,
      // The Prisma enum carries the same wire value as the domain enum (looked up by key).
      priceUnit: PriceUnit[row.priceUnit],
      // Money columns are BigInt in Prisma (whole so'm) → number in the domain.
      originalPrice: Number(row.originalPrice),
      finalPrice: Number(row.finalPrice),
      status: ListingStatus[row.status],
      isDiscount: row.isDiscount,
      viewsCount: row.viewsCount,
      validTo: row.validTo,
      createdAt: row.createdAt,
    };
  }

  static toDetail(row: AdminListingDetailRow): AdminListing {
    return {
      // The detail row is a superset of LISTING_INCLUDE, so the shared mapper handles the aggregate.
      listing: ListingMapper.toDomain(row),
      businessName: row.business.name,
    };
  }
}
