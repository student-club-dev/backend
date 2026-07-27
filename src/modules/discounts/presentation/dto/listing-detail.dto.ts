import { ApiProperty } from '@nestjs/swagger';
import {
  BranchTradeCenterDto,
  BranchTradeCenterFieldDto,
} from '../../../branches/presentation/dto/branch-trade-center.dto';
import { DeliveryZoneDto } from '../../../branches/presentation/dto/delivery-zone.dto';
import { WorkingHoursDto } from '../../../branches/presentation/dto/working-hours.dto';
import { BusinessContactsDto } from '../../../business/presentation/dto/business-contacts.dto';
import { OptionGroupDto } from '../../../listings/presentation/dto/option-group.dto';
import { RedemptionMethod } from '../../../listings/domain/enums/redemption-method.enum';
import { RedemptionPeriod } from '../../../listings/domain/enums/redemption-period.enum';
import type {
  DetailBranch,
  DetailBusiness,
  DetailRedemption,
  ListingDetail,
} from '../../domain/listing-detail.model';
import { DiscountCardDto } from './discount-card.dto';

/** One of the listing's branches (STUDENT_FEED.md §9) — the detail screen lists them all. */
class DetailBranchDto {
  @ApiProperty({ example: 'br_01H8X' })
  branchId!: string;

  @ApiProperty({ example: 'Yunusobod filiali' })
  name!: string;

  @ApiProperty({ example: 'Yunusobod 5-kvartal, 12-uy' })
  address!: string;

  @ApiProperty({ required: false, nullable: true, example: 'Metro yonida' })
  landmark!: string | null;

  @ApiProperty({ example: 41.352 })
  lat!: number;

  @ApiProperty({ example: 69.273 })
  lng!: number;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 640,
    description: 'Null when the request carried no coordinates.',
  })
  distanceMeters!: number | null;

  @ApiProperty({ required: false, nullable: true, type: BranchTradeCenterDto })
  tradeCenter!: BranchTradeCenterDto | null;

  @ApiProperty({
    type: [BranchTradeCenterFieldDto],
    description: 'Empty when the branch is not inside a trade center.',
  })
  tradeCenterFields!: BranchTradeCenterFieldDto[];

  @ApiProperty({ type: [WorkingHoursDto], description: 'All seven days.' })
  workingHours!: WorkingHoursDto[];

  @ApiProperty({ required: false, nullable: true, type: DeliveryZoneDto })
  deliveryZone!: DeliveryZoneDto | null;

  static fromDomain(branch: DetailBranch): DetailBranchDto {
    const dto = new DetailBranchDto();
    Object.assign(dto, branch, {
      tradeCenter:
        branch.tradeCenter === null ? null : BranchTradeCenterDto.fromDomain(branch.tradeCenter),
      tradeCenterFields: branch.tradeCenterFields.map(BranchTradeCenterFieldDto.fromDomain),
      workingHours: branch.workingHours.map(WorkingHoursDto.fromDomain),
      deliveryZone:
        branch.deliveryZone === null ? null : DeliveryZoneDto.fromDomain(branch.deliveryZone),
    });
    return dto;
  }
}

/** The business behind the listing — the contact block on the detail screen. */
class DetailBusinessDto {
  @ApiProperty({ example: 'biz_01H8X' })
  id!: string;

  @ApiProperty({ example: 'Choyxona Navruz' })
  name!: string;

  @ApiProperty({ required: false, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ example: '+998901234567' })
  phone!: string;

  @ApiProperty({ required: false, nullable: true, type: BusinessContactsDto })
  contacts!: BusinessContactsDto | null;

  @ApiProperty({ required: false, nullable: true, example: 4.6 })
  rating!: number | null;

  static fromDomain(business: DetailBusiness): DetailBusinessDto {
    const dto = new DetailBusinessDto();
    Object.assign(dto, business, {
      contacts:
        business.contacts === null ? null : BusinessContactsDto.fromDomain(business.contacts),
    });
    return dto;
  }
}

/** How the offer is claimed. `promoCode` and `remainingForUser` are personal — see the fields. */
class DetailRedemptionDto {
  @ApiProperty({ enum: RedemptionMethod, enumName: 'RedemptionMethodDto' })
  method!: RedemptionMethod;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'STUD30',
    description: 'Returned to a signed-in student only; null for anyone else (D5).',
  })
  promoCode!: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'For ONLINE_LINK.' })
  url!: string | null;

  @ApiProperty({ required: false, nullable: true, example: 1 })
  perUserLimit!: number | null;

  @ApiProperty({
    required: false,
    nullable: true,
    enum: RedemptionPeriod,
    enumName: 'RedemptionPeriodDto',
  })
  perUserPeriod!: RedemptionPeriod | null;

  @ApiProperty({ required: false, nullable: true, description: 'null = unlimited.' })
  totalLimit!: number | null;

  @ApiProperty({ example: 12 })
  usedCount!: number;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 1,
    description:
      'How many redemptions this student has left in the current period. Null when anonymous, or when the listing sets no per-user limit.',
  })
  remainingForUser!: number | null;

  static fromDomain(redemption: DetailRedemption): DetailRedemptionDto {
    const dto = new DetailRedemptionDto();
    Object.assign(dto, redemption);
    return dto;
  }
}

/**
 * ListingDetailDto — the full listing (STUDENT_FEED.md §9). Extends the feed card so the two can
 * never disagree about a price, a badge or a distance, and adds what only the detail screen shows.
 */
export class ListingDetailDto extends DiscountCardDto {
  @ApiProperty({ required: false, nullable: true, example: 'Talabalar uchun maxsus taklif.' })
  description!: string | null;

  @ApiProperty({ type: [String], description: 'Every image; the card carries only the cover.' })
  images!: string[];

  @ApiProperty({ type: [OptionGroupDto] })
  optionGroups!: OptionGroupDto[];

  @ApiProperty({ type: DetailRedemptionDto })
  redemption!: DetailRedemptionDto;

  @ApiProperty({
    type: [DetailBranchDto],
    description: 'Every active branch, nearest first when coordinates were sent.',
  })
  branches!: DetailBranchDto[];

  @ApiProperty({ type: DetailBusinessDto })
  business!: DetailBusinessDto;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  validFrom!: string;

  @ApiProperty({ example: '2026-07-16T10:30:00.000Z' })
  createdAt!: string;

  static fromDomain(detail: ListingDetail): ListingDetailDto {
    const dto = new ListingDetailDto();
    Object.assign(dto, DiscountCardDto.fromDomain(detail), {
      description: detail.description,
      images: detail.images,
      optionGroups: detail.optionGroups.map(OptionGroupDto.fromDomain),
      redemption: DetailRedemptionDto.fromDomain(detail.redemption),
      branches: detail.branches.map(DetailBranchDto.fromDomain),
      business: DetailBusinessDto.fromDomain(detail.business),
      validFrom: detail.validFrom,
      createdAt: detail.createdAt,
    });
    return dto;
  }
}
