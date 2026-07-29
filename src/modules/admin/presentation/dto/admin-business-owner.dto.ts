import { ApiProperty } from '@nestjs/swagger';
import { BusinessStatus } from '../../../business/domain/enums/business-status.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { AdminBusinessOwnerPage } from '../../domain/admin-business-owner-read.repository';
import {
  AdminBusinessOwner,
  AdminBusinessOwnerSummary,
  AdminOwnerBusinessSummary,
} from '../../domain/entities/admin-business-owner.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';

/** One business-owner row in the admin list. */
export class AdminBusinessOwnerSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'E.164 format' })
  phoneNumber!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    example: 3,
    description: 'How many businesses this owner has.',
  })
  businessesCount!: number;

  @ApiProperty({ enum: AdminUserStatus, enumName: 'AdminUserStatusDto' })
  status!: AdminUserStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the account was banned.',
  })
  bannedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Admin-supplied ban reason.' })
  banReason!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromDomain(owner: AdminBusinessOwnerSummary): AdminBusinessOwnerSummaryDto {
    const dto = new AdminBusinessOwnerSummaryDto();
    dto.id = owner.id;
    dto.firstName = owner.firstName;
    dto.lastName = owner.lastName;
    dto.phoneNumber = owner.phoneNumber;
    dto.email = owner.email;
    dto.businessesCount = owner.businessesCount;
    dto.status = owner.status;
    dto.bannedAt = owner.bannedAt === null ? null : owner.bannedAt.toISOString();
    dto.banReason = owner.banReason;
    dto.createdAt = owner.createdAt.toISOString();
    return dto;
  }
}

/** A page of business-owner summaries — matches the CLAUDE.md pagination envelope. */
export class AdminBusinessOwnerPageDto {
  @ApiProperty({ type: [AdminBusinessOwnerSummaryDto] })
  items!: AdminBusinessOwnerSummaryDto[];

  @ApiProperty({ type: 'integer', format: 'int32', example: 1 })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32', example: 20 })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int64', example: 42 })
  total!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  static fromPage(
    page: AdminBusinessOwnerPage,
    pageNumber: number,
    size: number,
  ): AdminBusinessOwnerPageDto {
    const dto = new AdminBusinessOwnerPageDto();
    dto.items = page.items.map(AdminBusinessOwnerSummaryDto.fromDomain);
    dto.page = pageNumber;
    dto.size = size;
    dto.total = page.total;
    dto.hasNext = pageNumber * size < page.total;
    return dto;
  }
}

/** The full business-owner record for the admin detail view — every field except `passwordHash`. */
export class AdminBusinessOwnerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'E.164 format' })
  phoneNumber!: string | null;

  @ApiProperty()
  phoneVerified!: boolean;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ enum: Gender, enumName: 'GenderDto', nullable: true })
  gender!: Gender | null;

  @ApiProperty({ type: 'integer', format: 'int32', example: 3 })
  businessesCount!: number;

  @ApiProperty({ enum: AdminUserStatus, enumName: 'AdminUserStatusDto' })
  status!: AdminUserStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the account was banned.',
  })
  bannedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Admin-supplied ban reason.' })
  banReason!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static fromDomain(owner: AdminBusinessOwner): AdminBusinessOwnerDto {
    const dto = new AdminBusinessOwnerDto();
    dto.id = owner.id;
    dto.email = owner.email;
    dto.phoneNumber = owner.phoneNumber;
    dto.phoneVerified = owner.phoneVerified;
    dto.emailVerified = owner.emailVerified;
    dto.firstName = owner.firstName;
    dto.lastName = owner.lastName;
    dto.avatarUrl = owner.avatarUrl;
    dto.gender = owner.gender;
    dto.businessesCount = owner.businessesCount;
    dto.status = owner.status;
    dto.bannedAt = owner.bannedAt === null ? null : owner.bannedAt.toISOString();
    dto.banReason = owner.banReason;
    dto.createdAt = owner.createdAt.toISOString();
    dto.updatedAt = owner.updatedAt.toISOString();
    return dto;
  }
}

/** A business belonging to an owner, as listed under the admin owner-detail view. */
export class AdminOwnerBusinessDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Business type key (FK to business_types).' })
  type!: string;

  @ApiProperty({ enum: BusinessStatus, enumName: 'BusinessStatusDto' })
  status!: BusinessStatus;

  @ApiProperty({ type: 'integer', format: 'int32', example: 5 })
  listingsCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromDomain(business: AdminOwnerBusinessSummary): AdminOwnerBusinessDto {
    const dto = new AdminOwnerBusinessDto();
    dto.id = business.id;
    dto.name = business.name;
    dto.type = business.type;
    dto.status = business.status;
    dto.listingsCount = business.listingsCount;
    dto.createdAt = business.createdAt.toISOString();
    return dto;
  }
}
