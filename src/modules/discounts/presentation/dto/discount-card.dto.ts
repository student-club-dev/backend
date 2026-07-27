import { ApiProperty } from '@nestjs/swagger';
import type { CardDiscount, DiscountCard, NearestBranch } from '../../domain/discount-card.model';

class NearestBranchDto {
  @ApiProperty({ example: 'br_01H8X' })
  branchId!: string;

  @ApiProperty({ example: 'Yunusobod filiali' })
  name!: string;

  @ApiProperty({ example: 'Yunusobod 5-kvartal, 12-uy' })
  address!: string;

  @ApiProperty({ required: false, nullable: true, example: 41.352 })
  lat!: number | null;

  @ApiProperty({ required: false, nullable: true, example: 69.273 })
  lng!: number | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 640,
    description: 'Null when the request carried no coordinates.',
  })
  distanceMeters!: number | null;

  @ApiProperty({ example: true, description: 'Evaluated in Tashkent time (UTC+5).' })
  isOpenNow!: boolean;

  @ApiProperty({ required: false, nullable: true, example: '23:00' })
  closesAt!: string | null;

  @ApiProperty({ required: false, nullable: true })
  tradeCenterName!: string | null;
}

class CardDiscountDto {
  @ApiProperty({ example: 'PERCENT' })
  type!: string;

  @ApiProperty({ example: 30 })
  value!: number;

  @ApiProperty({ example: '−30%', description: 'Rendered server-side; print as-is.' })
  badge!: string;

  @ApiProperty({ required: false, nullable: true, example: 'Talaba ID bilan' })
  conditions!: string | null;
}

/** DiscountCardDto — one feed row (STUDENT_FEED.md §8.1). Shared by search, favourites and detail. */
export class DiscountCardDto {
  @ApiProperty({ example: 'lst_01H8X' })
  id!: string;

  @ApiProperty({ example: 'biz_01H8X' })
  businessId!: string;

  @ApiProperty({ example: 'Choyxona Navruz' })
  businessName!: string;

  @ApiProperty({ required: false, nullable: true })
  businessLogoUrl!: string | null;

  @ApiProperty({ example: 'NATIONAL_FOOD' })
  businessType!: string;

  @ApiProperty({ example: 'FOOD' })
  groupKey!: string;

  @ApiProperty({ example: 'PALOV' })
  categoryKey!: string;

  @ApiProperty({ example: 'Osh / Palov' })
  categoryLabel!: string;

  @ApiProperty({
    example: 'CATEGORY',
    enum: ['CATEGORY', 'ALL', 'SYNONYM', 'TEXT', 'TYPE'],
    description: 'Why this listing matched. Exact matches (CATEGORY) outrank ALL under RELEVANCE.',
  })
  matchedVia!: string;

  @ApiProperty({ example: 'Osh (1 porsiya)' })
  title!: string;

  @ApiProperty({ required: false, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ example: 4 })
  imagesCount!: number;

  @ApiProperty({ example: 'PER_ITEM' })
  priceUnit!: string;

  @ApiProperty({ example: true, description: 'false for a plain single-price listing.' })
  isDiscount!: boolean;

  @ApiProperty({ example: 30000 })
  originalPrice!: number;

  @ApiProperty({ example: 21000 })
  finalPrice!: number;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 9000,
    description: 'Null on a regular listing — never 0 as a placeholder.',
  })
  savedAmount!: number | null;

  @ApiProperty({ example: 'UZS' })
  currency!: string;

  @ApiProperty({ required: false, nullable: true, type: CardDiscountDto })
  discount!: CardDiscountDto | null;

  @ApiProperty({ example: 'STUDENT_ID' })
  redemptionMethod!: string;

  @ApiProperty({ example: false })
  hasPromoCode!: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    type: NearestBranchDto,
    description: 'Null only for an online-only business.',
  })
  nearestBranch!: NearestBranchDto | null;

  @ApiProperty({ example: 3 })
  branchesCount!: number;

  @ApiProperty({ example: '2026-08-01T18:59:59.000Z' })
  validTo!: string;

  @ApiProperty({ example: false })
  isFavorite!: boolean;

  @ApiProperty({ example: true, description: 'Created within the last 7 days.' })
  isNew!: boolean;

  @ApiProperty({ example: 412 })
  viewsCount!: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  attributes!: Record<string, string>;

  static fromDomain(card: DiscountCard): DiscountCardDto {
    const dto = new DiscountCardDto();
    Object.assign(dto, card, {
      discount: card.discount === null ? null : toDiscountDto(card.discount),
      nearestBranch: card.nearestBranch === null ? null : toBranchDto(card.nearestBranch),
    });
    return dto;
  }
}

function toDiscountDto(discount: CardDiscount): CardDiscountDto {
  const dto = new CardDiscountDto();
  Object.assign(dto, discount);
  return dto;
}

function toBranchDto(branch: NearestBranch): NearestBranchDto {
  const dto = new NearestBranchDto();
  Object.assign(dto, branch);
  return dto;
}
