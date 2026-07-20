import { ApiProperty } from '@nestjs/swagger';
import { Business } from '../../domain/entities/business.entity';
import { BusinessStatus } from '../../domain/enums/business-status.enum';
import { BusinessContactsDto } from './business-contacts.dto';

/** BusinessDto — a business as returned to its owner (matches elon-uz.json). */
export class BusinessDto {
  @ApiProperty({ example: 'biz_01H8X' })
  id!: string;

  @ApiProperty({ description: 'Resolved from the Bearer token' })
  ownerUserId!: string;

  @ApiProperty({ description: 'Business type key (immutable)', example: 'CAFE_RESTAURANT' })
  type!: string;

  @ApiProperty({ minLength: 2, maxLength: 80 })
  name!: string;

  @ApiProperty({ required: false, nullable: true })
  legalName!: string | null;

  @ApiProperty({ required: false, nullable: true, description: '9 digits', example: '301234567' })
  inn!: string | null;

  @ApiProperty({ required: false, nullable: true, maxLength: 1000 })
  description!: string | null;

  @ApiProperty({ required: false, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ required: false, nullable: true })
  coverUrl!: string | null;

  @ApiProperty({ description: 'E.164', example: '+998901234567' })
  phone!: string;

  @ApiProperty({ type: BusinessContactsDto, required: false, nullable: true })
  contacts!: BusinessContactsDto | null;

  @ApiProperty({
    default: false,
    description: 'When true, no branch or location is required (e.g. an online course)',
  })
  isOnlineOnly!: boolean;

  @ApiProperty({ enum: BusinessStatus, enumName: 'BusinessStatusDto' })
  status!: BusinessStatus;

  @ApiProperty({ required: false, nullable: true })
  rejectionReason!: string | null;

  @ApiProperty({ required: false, nullable: true, format: 'double' })
  rating!: number | null;

  @ApiProperty({ example: 0 })
  reviewsCount!: number;

  @ApiProperty({ example: 0 })
  listingsCount!: number;

  @ApiProperty({ format: 'date-time', example: '2026-07-16T10:30:00Z' })
  createdAt!: string;

  static fromDomain(business: Business): BusinessDto {
    const dto = new BusinessDto();
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
    dto.createdAt = business.createdAt.toISOString();
    return dto;
  }
}
