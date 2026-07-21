import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PriceUnit } from '../../../catalog/domain/enums/price-unit.enum';
import { Listing } from '../../domain/entities/listing.entity';
import { ListingStatus } from '../../domain/enums/listing-status.enum';
import { DiscountDto } from './discount.dto';
import { OptionGroupDto } from './option-group.dto';
import { RedemptionInfoDto } from './redemption-info.dto';

/** ListingDto — a listing as returned to its owner (matches elon-uz.json). Money is whole soums. */
export class ListingDto {
  @ApiProperty({ example: 'lst_01H8XZ' })
  id!: string;

  @ApiProperty()
  businessId!: string;

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

  static fromDomain(listing: Listing): ListingDto {
    const dto = new ListingDto();
    dto.id = listing.id;
    dto.businessId = listing.businessId;
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
