import { ApiProperty } from '@nestjs/swagger';
import { BusinessStatus } from '../../../business/domain/enums/business-status.enum';
import { BusinessContactsDto } from '../../../business/presentation/dto/business-contacts.dto';
import { AdminBusinessPage } from '../../domain/admin-business-read.repository';
import {
  AdminBusiness,
  AdminBusinessOwnerRef,
  AdminBusinessSummary,
} from '../../domain/entities/admin-business.entity';

/** One business row in the admin list. */
export class AdminBusinessSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Business type key (FK to business_types).' })
  type!: string;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ type: String, nullable: true, description: "Owner's joined first + last name." })
  ownerFullName!: string | null;

  @ApiProperty({ enum: BusinessStatus, enumName: 'BusinessStatusDto' })
  status!: BusinessStatus;

  @ApiProperty({ type: 'integer', format: 'int32', example: 5 })
  listingsCount!: number;

  @ApiProperty({ type: 'integer', format: 'int32', example: 2 })
  branchesCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromDomain(business: AdminBusinessSummary): AdminBusinessSummaryDto {
    const dto = new AdminBusinessSummaryDto();
    dto.id = business.id;
    dto.name = business.name;
    dto.type = business.type;
    dto.ownerId = business.ownerId;
    dto.ownerFullName = business.ownerFullName;
    dto.status = business.status;
    dto.listingsCount = business.listingsCount;
    dto.branchesCount = business.branchesCount;
    dto.createdAt = business.createdAt.toISOString();
    return dto;
  }
}

/** A page of business summaries — matches the CLAUDE.md pagination envelope. */
export class AdminBusinessPageDto {
  @ApiProperty({ type: [AdminBusinessSummaryDto] })
  items!: AdminBusinessSummaryDto[];

  @ApiProperty({ type: 'integer', format: 'int32', example: 1 })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32', example: 20 })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int64', example: 42 })
  total!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  static fromPage(page: AdminBusinessPage, pageNumber: number, size: number): AdminBusinessPageDto {
    const dto = new AdminBusinessPageDto();
    dto.items = page.items.map(AdminBusinessSummaryDto.fromDomain);
    dto.page = pageNumber;
    dto.size = size;
    dto.total = page.total;
    dto.hasNext = pageNumber * size < page.total;
    return dto;
  }
}

/** The joined owner shown on the admin business-detail view (display fields only). */
export class AdminBusinessOwnerRefDto {
  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ type: String, nullable: true })
  ownerFullName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'E.164 format' })
  ownerPhone!: string | null;

  static fromDomain(owner: AdminBusinessOwnerRef): AdminBusinessOwnerRefDto {
    const dto = new AdminBusinessOwnerRefDto();
    dto.ownerId = owner.ownerId;
    dto.ownerFullName = owner.ownerFullName;
    dto.ownerPhone = owner.ownerPhone;
    return dto;
  }
}

/**
 * The full business record for the admin detail view — every business field plus the joined owner
 * summary and the branch count. Admin sees any business regardless of owner or status.
 */
export class AdminBusinessDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  ownerUserId!: string;

  @ApiProperty({ description: 'Business type key (FK to business_types).' })
  type!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  legalName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: '9 digits' })
  inn!: string | null;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  coverUrl!: string | null;

  @ApiProperty({ description: 'E.164' })
  phone!: string;

  @ApiProperty({ type: BusinessContactsDto, nullable: true })
  contacts!: BusinessContactsDto | null;

  @ApiProperty()
  isOnlineOnly!: boolean;

  @ApiProperty({ enum: BusinessStatus, enumName: 'BusinessStatusDto' })
  status!: BusinessStatus;

  @ApiProperty({ type: String, nullable: true })
  rejectionReason!: string | null;

  @ApiProperty({ type: Number, nullable: true, format: 'double' })
  rating!: number | null;

  @ApiProperty({ type: 'integer', format: 'int32', example: 0 })
  reviewsCount!: number;

  @ApiProperty({ type: 'integer', format: 'int32', example: 0 })
  listingsCount!: number;

  @ApiProperty({ type: AdminBusinessOwnerRefDto })
  owner!: AdminBusinessOwnerRefDto;

  @ApiProperty({ type: 'integer', format: 'int32', example: 2 })
  branchesCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromDomain(admin: AdminBusiness): AdminBusinessDto {
    const business = admin.business;
    const dto = new AdminBusinessDto();
    dto.id = business.id;
    dto.ownerUserId = business.ownerId;
    dto.type = business.type;
    dto.name = business.name;
    dto.legalName = business.legalName;
    dto.inn = business.inn;
    dto.description = business.description;
    dto.logoUrl = business.logoUrl;
    dto.coverUrl = business.coverUrl;
    dto.phone = business.phone;
    dto.contacts =
      business.contacts === null ? null : BusinessContactsDto.fromDomain(business.contacts);
    dto.isOnlineOnly = business.isOnlineOnly;
    dto.status = business.status;
    dto.rejectionReason = business.rejectionReason;
    dto.rating = business.rating;
    dto.reviewsCount = business.reviewsCount;
    dto.listingsCount = business.listingsCount;
    dto.owner = AdminBusinessOwnerRefDto.fromDomain(admin.owner);
    dto.branchesCount = admin.branchesCount;
    dto.createdAt = business.createdAt.toISOString();
    return dto;
  }
}
