import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DiscountType } from '../../../listings/domain/enums/discount-type.enum';
import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';
import { RedemptionMethod } from '../../../listings/domain/enums/redemption-method.enum';
import { AdminListingListFilter } from '../../domain/admin-listing-read.repository';
import { AdminListingKind } from '../../domain/enums/admin-listing-kind.enum';
import { AdminListingPriceBasis } from '../../domain/enums/admin-listing-price-basis.enum';
import { AdminListingSort } from '../../domain/enums/admin-listing-sort.enum';
import {
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_DEFAULT_SIZE,
  ADMIN_LIST_MAX_SIZE,
} from './admin-user-list-query.dto';

/** A repeatable query param arrives as a single value or an array; normalise to an array. */
const toArray = ({ value }: { value: unknown }): unknown => {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
};

/**
 * Query for `GET /v1/admin/listings`. `q` matches title / description (case-insensitive contains).
 * `status` is repeatable (`?status=ACTIVE&status=DRAFT`) and every parameter is optional; absent
 * `page`/`size` default to 1/20 (max size 100). The admin sees every status.
 */
export class AdminListingListQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search over title / description.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Keep only listings of this business.' })
  @IsOptional()
  @IsString()
  businessId?: string;

  @ApiPropertyOptional({ description: 'Keep only listings whose business belongs to this owner.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({
    enum: ListingStatus,
    enumName: 'ListingStatusDto',
    isArray: true,
    description: 'Repeatable — keep listings in any of these statuses (DRAFT/PENDING_REVIEW too).',
  })
  @IsOptional()
  @Transform(toArray)
  @IsEnum(ListingStatus, { each: true })
  status?: ListingStatus[];

  @ApiPropertyOptional({ description: 'Category key (e.g. PIZZA).' })
  @IsOptional()
  @IsString()
  categoryKey?: string;

  @ApiPropertyOptional({ description: 'Business type key (via the listing business).' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Business type group key (via the business type).' })
  @IsOptional()
  @IsString()
  groupKey?: string;

  @ApiPropertyOptional({ description: 'Keep listings with at least one branch in this region.' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: 'Keep listings with at least one branch in this district.' })
  @IsOptional()
  @IsString()
  districtId?: string;

  @ApiPropertyOptional({ format: 'int64', minimum: 0, description: 'Lower price bound (so‘m).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMin?: number;

  @ApiPropertyOptional({ format: 'int64', minimum: 0, description: 'Upper price bound (so‘m).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMax?: number;

  @ApiPropertyOptional({
    enum: AdminListingPriceBasis,
    enumName: 'AdminListingPriceBasisDto',
    default: AdminListingPriceBasis.FINAL,
    description: 'Which price the bounds compare against — `FINAL` (default) or `ORIGINAL`.',
  })
  @IsOptional()
  @IsEnum(AdminListingPriceBasis)
  priceBasis?: AdminListingPriceBasis;

  @ApiPropertyOptional({ enum: DiscountType, enumName: 'DiscountTypeDto' })
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @ApiPropertyOptional({
    enum: AdminListingKind,
    enumName: 'AdminListingKindDto',
    default: AdminListingKind.ALL,
    description: '`ALL` (default) / `DISCOUNT` / `REGULAR`.',
  })
  @IsOptional()
  @IsEnum(AdminListingKind)
  listingKind?: AdminListingKind;

  @ApiPropertyOptional({ enum: RedemptionMethod, enumName: 'RedemptionMethodDto' })
  @IsOptional()
  @IsEnum(RedemptionMethod)
  redemptionMethod?: RedemptionMethod;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusive lower bound on `createdAt` (ISO-8601).',
    example: '2026-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusive upper bound on `createdAt` (ISO-8601).',
    example: '2026-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Keep listings whose `validTo` is at or before this instant (ISO-8601).',
  })
  @IsOptional()
  @IsDateString()
  validToBefore?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Keep listings whose `validTo` is at or after this instant (ISO-8601).',
  })
  @IsOptional()
  @IsDateString()
  validToAfter?: string;

  @ApiPropertyOptional({
    enum: AdminListingSort,
    enumName: 'AdminListingSortDto',
    default: AdminListingSort.NEWEST,
    description:
      '`NEWEST` (default) / `OLDEST` by createdAt, `PRICE_FINAL` cheapest first, `VIEWS` most ' +
      'viewed first, `ENDING_SOON` by soonest validTo.',
  })
  @IsOptional()
  @IsEnum(AdminListingSort)
  sort?: AdminListingSort;

  @ApiPropertyOptional({ minimum: 1, default: ADMIN_LIST_DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: ADMIN_LIST_MAX_SIZE,
    default: ADMIN_LIST_DEFAULT_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_MAX_SIZE)
  size?: number;

  toFilter(): AdminListingListFilter {
    return {
      q: this.q ?? null,
      businessId: this.businessId ?? null,
      ownerId: this.ownerId ?? null,
      statuses: this.status ?? [],
      categoryKey: this.categoryKey ?? null,
      type: this.type ?? null,
      groupKey: this.groupKey ?? null,
      regionId: this.regionId ?? null,
      districtId: this.districtId ?? null,
      priceMin: this.priceMin ?? null,
      priceMax: this.priceMax ?? null,
      priceBasis: this.priceBasis ?? AdminListingPriceBasis.FINAL,
      discountType: this.discountType ?? null,
      listingKind: this.listingKind ?? AdminListingKind.ALL,
      redemptionMethod: this.redemptionMethod ?? null,
      createdFrom: this.createdFrom === undefined ? null : new Date(this.createdFrom),
      createdTo: this.createdTo === undefined ? null : new Date(this.createdTo),
      validToBefore: this.validToBefore === undefined ? null : new Date(this.validToBefore),
      validToAfter: this.validToAfter === undefined ? null : new Date(this.validToAfter),
      sort: this.sort ?? AdminListingSort.NEWEST,
      page: this.page ?? ADMIN_LIST_DEFAULT_PAGE,
      size: this.size ?? ADMIN_LIST_DEFAULT_SIZE,
    };
  }
}
