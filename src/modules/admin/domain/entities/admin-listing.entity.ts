import { PriceUnit } from '../../../catalog/domain/enums/price-unit.enum';
import { Listing } from '../../../listings/domain/entities/listing.entity';
import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';

/**
 * A listing row as the admin list shows it. `businessName` comes from the joined business,
 * `imageUrl` is the cover (`images[0]`, null when there is none); money fields are whole so'm
 * (BigInt in Prisma, `number` here). Pure domain type.
 */
export interface AdminListingSummary {
  id: string;
  businessId: string;
  businessName: string;
  title: string;
  imageUrl: string | null;
  categoryKey: string;
  priceUnit: PriceUnit;
  originalPrice: number;
  finalPrice: number;
  status: ListingStatus;
  isDiscount: boolean;
  viewsCount: number;
  validTo: Date;
  createdAt: Date;
}

/**
 * The full listing record for the admin detail view — every listing field (via the shared
 * {@link Listing} entity) plus the joined `businessName`. Admin sees any listing regardless of owner
 * or status (including DRAFT / PENDING_REVIEW / REJECTED / ARCHIVED).
 */
export interface AdminListing {
  listing: Listing;
  businessName: string;
}
