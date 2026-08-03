import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';
import type {
  StudentListing,
  StudentListingDetails,
} from '../../domain/entities/student-listing.entity';
import { ListingAudience } from '../../domain/enums/listing-audience.enum';
import { StudentListingKind } from '../../domain/enums/student-listing-kind.enum';
import { StudentPriceUnit } from '../../domain/enums/student-price-unit.enum';
import { DETAILS_SUBTYPES } from './listing-details.dto';

/**
 * Every `@ApiProperty` below carries an explicit `type`, and whole numbers say `integer`.
 * The Kotlin client is generated from this document: an untyped schema does not compile, and a
 * so'm amount inferred as `number` would arrive as a `Double`. Enforced by
 * `src/common/swagger/openapi-document.spec.ts`.
 */

/** A pin as it appears in a response (§2.4). */
export class ListingBranchResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number, example: 41.2856 }) lat!: number;
  @ApiProperty({ type: Number, example: 69.2034 }) lng!: number;
  @ApiProperty({ type: String }) address!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true }) landmark!: string | null;
  @ApiProperty({ type: String, nullable: true }) regionId!: string | null;
  @ApiProperty({ type: String, nullable: true }) districtId!: string | null;
}

/** One choice inside an option group, as returned (§2.5). */
export class ListingOptionResponseDto {
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: 'integer', description: 'Butun so‘m; manfiy ham bo‘lishi mumkin' })
  priceDelta!: number;
  @ApiProperty({ type: Boolean }) isAvailable!: boolean;
}

/** An add-on chooser, as returned (§2.5). */
export class ListingOptionGroupResponseDto {
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ enum: ['SINGLE', 'MULTIPLE'] }) selectionType!: 'SINGLE' | 'MULTIPLE';
  @ApiProperty({ type: Boolean }) isRequired!: boolean;
  @ApiProperty({ type: [ListingOptionResponseDto] }) options!: ListingOptionResponseDto[];
}

/**
 * `StudentListingDto` (§2.2). Field names and nullability match the client's generated model, so
 * adding a field is safe but renaming one is not.
 *
 * Dates go out as ISO-8601 UTC strings and money as plain integers — `BigInt` never reaches JSON.
 */
export class StudentListingDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) ownerId!: string;
  @ApiProperty({ enum: StudentListingKind }) kind!: StudentListingKind;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: [String], description: 'Birinchisi — muqova' }) images!: string[];

  @ApiProperty({ enum: StudentPriceUnit, nullable: true })
  priceUnit!: StudentPriceUnit | null;

  @ApiProperty({ type: 'integer', description: 'Butun so‘m, tiyinsiz' }) price!: number;
  @ApiProperty({ type: 'integer', nullable: true }) priceMax!: number | null;
  @ApiProperty({ type: String, example: 'UZS' }) currency!: string;
  @ApiProperty({ type: Boolean }) isNegotiable!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Faqat ACTIVE e’londa qaytariladi; aks holda null (§7.2.0)',
  })
  contactPhone!: string | null;

  @ApiProperty({ type: String, nullable: true }) universityId!: string | null;
  @ApiProperty({ enum: ListingAudience }) audience!: ListingAudience;
  @ApiProperty({ type: [ListingBranchResponseDto] }) branches!: ListingBranchResponseDto[];

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  validFrom!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  validTo!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  attributes!: Record<string, string>;

  @ApiProperty({ type: [ListingOptionGroupResponseDto] })
  optionGroups!: ListingOptionGroupResponseDto[];

  @ApiProperty({
    description: 'Turga xos qism; `details.kind` tashqi `kind` bilan bir xil bo‘ladi (§4)',
    oneOf: DETAILS_SUBTYPES.map((subtype) => ({ $ref: getSchemaPath(subtype.value) })),
  })
  details!: StudentListingDetails;

  @ApiProperty({ enum: ListingStatus }) status!: ListingStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Phase 1 da moderatsiya yo‘q — doim null',
  })
  rejectionReason!: string | null;

  @ApiProperty({ type: 'integer' }) viewsCount!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;

  @ApiProperty({ type: Boolean, description: 'So‘rovchi — e’lon egasimi (§7.2.0)' })
  isMine!: boolean;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Qidiruv bilan keladi (Phase 1b); bu yerda doim null',
  })
  distanceMeters!: number | null;

  @ApiProperty({ type: Boolean, description: 'Sevimlilar Phase 2 da; hozircha doim false' })
  isFavorite!: boolean;

  /**
   * `owner`, `universityName` and `universityRelation` from §2.2 are intentionally absent: the
   * first needs the profile read port that arrives with search (Phase 1b), the other two need the
   * universities table (Phase 2). Adding them later is additive for the client.
   */
  static fromEntity(listing: StudentListing, viewerId: string): StudentListingDto {
    const dto = new StudentListingDto();
    dto.id = listing.id;
    dto.ownerId = listing.ownerId;
    dto.kind = listing.kind;
    dto.title = listing.title;
    dto.description = listing.description;
    dto.images = listing.images;
    dto.priceUnit = listing.priceUnit;
    dto.price = listing.price;
    dto.priceMax = listing.priceMax;
    dto.currency = listing.currency;
    dto.isNegotiable = listing.isNegotiable;
    dto.contactPhone = listing.contactPhone;
    dto.universityId = listing.universityId;
    dto.audience = listing.audience;
    dto.branches = listing.branches.map((branch) => ({ ...branch }));
    dto.validFrom = toIso(listing.validFrom);
    dto.validTo = toIso(listing.validTo);
    dto.attributes = listing.attributes;
    dto.optionGroups = listing.optionGroups.map((group) => ({
      name: group.name,
      selectionType: group.selectionType,
      isRequired: group.isRequired,
      options: group.options.map((option) => ({ ...option })),
    }));
    dto.details = listing.details;
    dto.status = listing.status;
    dto.rejectionReason = listing.rejectionReason;
    dto.viewsCount = listing.viewsCount;
    dto.createdAt = listing.createdAt.toISOString();
    dto.updatedAt = listing.updatedAt.toISOString();
    dto.isMine = listing.ownerId === viewerId;
    dto.distanceMeters = null;
    dto.isFavorite = false;
    return dto;
  }
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}
