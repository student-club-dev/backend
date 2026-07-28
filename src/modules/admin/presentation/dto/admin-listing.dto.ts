import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PriceUnit } from '../../../catalog/domain/enums/price-unit.enum';
import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';
import { DiscountDto } from '../../../listings/presentation/dto/discount.dto';
import { OptionGroupDto } from '../../../listings/presentation/dto/option-group.dto';
import { RedemptionInfoDto } from '../../../listings/presentation/dto/redemption-info.dto';
import { AdminListingPage } from '../../domain/admin-listing-read.repository';
import { AdminListing, AdminListingSummary } from '../../domain/entities/admin-listing.entity';

/** One listing row in the admin list. Money is whole so'm. */
export class AdminListingSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  businessName!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, description: 'Cover image (images[0]), null when there is none.' })
  imageUrl!: string | null;

  @ApiProperty({ example: 'PIZZA' })
  categoryKey!: string;

  @ApiProperty({ enum: PriceUnit, enumName: 'PriceUnitDto' })
  priceUnit!: PriceUnit;

  @ApiProperty({ format: 'int64', example: 55000 })
  originalPrice!: number;

  @ApiProperty({ format: 'int64', example: 44000 })
  finalPrice!: number;

  @ApiProperty({ enum: ListingStatus, enumName: 'ListingStatusDto' })
  status!: ListingStatus;

  @ApiProperty()
  isDiscount!: boolean;

  @ApiProperty({ format: 'int32', example: 0 })
  viewsCount!: number;

  @ApiProperty({ format: 'date-time' })
  validTo!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromDomain(listing: AdminListingSummary): AdminListingSummaryDto {
    const dto = new AdminListingSummaryDto();
    dto.id = listing.id;
    dto.businessId = listing.businessId;
    dto.businessName = listing.businessName;
    dto.title = listing.title;
    dto.imageUrl = listing.imageUrl;
    dto.categoryKey = listing.categoryKey;
    dto.priceUnit = listing.priceUnit;
    dto.originalPrice = listing.originalPrice;
    dto.finalPrice = listing.finalPrice;
    dto.status = listing.status;
    dto.isDiscount = listing.isDiscount;
    dto.viewsCount = listing.viewsCount;
    dto.validTo = listing.validTo.toISOString();
    dto.createdAt = listing.createdAt.toISOString();
    return dto;
  }
}

/** A page of listing summaries — matches the CLAUDE.md pagination envelope. */
export class AdminListingPageDto {
  @ApiProperty({ type: [AdminListingSummaryDto] })
  items!: AdminListingSummaryDto[];

  @ApiProperty({ format: 'int32', example: 1 })
  page!: number;

  @ApiProperty({ format: 'int32', example: 20 })
  size!: number;

  @ApiProperty({ format: 'int64', example: 42 })
  total!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  static fromPage(page: AdminListingPage, pageNumber: number, size: number): AdminListingPageDto {
    const dto = new AdminListingPageDto();
    dto.items = page.items.map(AdminListingSummaryDto.fromDomain);
    dto.page = pageNumber;
    dto.size = size;
    dto.total = page.total;
    dto.hasNext = pageNumber * size < page.total;
    return dto;
  }
}

/**
 * The full listing record for the admin detail view — every listing field (mirroring ListingDto)
 * plus the joined `businessName`. Admin sees any listing regardless of owner or status. Money is
 * whole so'm.
 */
export class AdminListingDto {
  @ApiProperty({ example: 'lst_01H8XZ' })
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  businessName!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'When empty — all active branches of the business',
  })
  branchIds!: string[];

  @ApiProperty({ example: 'PIZZA' })
  categoryKey!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Required when categoryKey = OTHER' })
  customCategoryName!: string | null;

  @ApiProperty({ minLength: 3, maxLength: 120 })
  title!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  description!: string | null;

  @ApiProperty({ type: [String], maxItems: 10, description: 'The first one is the cover' })
  images!: string[];

  @ApiProperty({ enum: PriceUnit, enumName: 'PriceUnitDto' })
  priceUnit!: PriceUnit;

  @ApiProperty({ format: 'int64', description: 'Whole soums (no tiyin)', example: 55000 })
  originalPrice!: number;

  @ApiProperty({ default: 'UZS' })
  currency!: string;

  @ApiProperty({ type: DiscountDto })
  discount!: DiscountDto;

  @ApiPropertyOptional({ type: RedemptionInfoDto })
  redemption!: RedemptionInfoDto;

  @ApiProperty({ format: 'date-time' })
  validFrom!: string;

  @ApiProperty({ format: 'date-time', description: 'validTo > validFrom, at most +1 year' })
  validTo!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  attributes?: Record<string, string>;

  @ApiPropertyOptional({ type: [OptionGroupDto], maxItems: 10 })
  optionGroups!: OptionGroupDto[];

  @ApiProperty({ enum: ListingStatus, enumName: 'ListingStatusDto' })
  status!: ListingStatus;

  @ApiPropertyOptional({ nullable: true })
  rejectionReason!: string | null;

  @ApiProperty({ format: 'int32' })
  viewsCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static fromDomain(admin: AdminListing): AdminListingDto {
    const listing = admin.listing;
    const dto = new AdminListingDto();
    dto.id = listing.id;
    dto.businessId = listing.businessId;
    dto.businessName = admin.businessName;
    dto.branchIds = listing.branchIds;
    dto.categoryKey = listing.categoryKey;
    dto.customCategoryName = listing.customCategoryName;
    dto.title = listing.title;
    dto.description = listing.description;
    dto.images = listing.images;
    dto.priceUnit = listing.priceUnit;
    dto.originalPrice = listing.originalPrice;
    dto.currency = listing.currency;
    dto.discount = DiscountDto.fromDomain(listing.discount);
    dto.redemption = RedemptionInfoDto.fromDomain(listing.redemption);
    dto.validFrom = listing.validFrom.toISOString();
    dto.validTo = listing.validTo.toISOString();
    dto.attributes = listing.attributes ?? undefined;
    dto.optionGroups = listing.optionGroups.map(OptionGroupDto.fromDomain);
    dto.status = listing.status;
    dto.rejectionReason = listing.rejectionReason;
    dto.viewsCount = listing.viewsCount;
    dto.createdAt = listing.createdAt.toISOString();
    dto.updatedAt = listing.updatedAt.toISOString();
    return dto;
  }
}
