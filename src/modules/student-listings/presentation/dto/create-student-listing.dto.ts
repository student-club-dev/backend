import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ListingAudience } from '../../domain/enums/listing-audience.enum';
import { StudentListingKind } from '../../domain/enums/student-listing-kind.enum';
import { StudentPriceUnit } from '../../domain/enums/student-price-unit.enum';
import type { CreateListingInput } from '../../application/student-listing.io';
import { ListingBranchDto } from './listing-branch.dto';
import { DETAILS_SUBTYPES, type ListingDetailsDto } from './listing-details.dto';
import { ListingOptionGroupDto } from './option-group.dto';

/** E.164 as Uzbek numbers are written: +998 followed by nine digits. */
const UZ_PHONE = /^\+998\d{9}$/;

export const IMAGES_MAX = 5;
export const BRANCHES_MAX = 20;
export const OPTION_GROUPS_MAX = 10;

/**
 * `POST /v1/student-listings` (§7.1).
 *
 * Almost everything is optional because `submit: false` saves a DRAFT from a half-filled form
 * (§6.1). The rules that make a listing publishable live in the domain and run only on submit —
 * what is enforced here is shape and bounds, the things that should never reach the database
 * whatever the status.
 */
export class CreateStudentListingDto {
  @ApiProperty({ enum: StudentListingKind })
  @IsEnum(StudentListingKind)
  kind!: StudentListingKind;

  @ApiPropertyOptional({
    default: false,
    description: 'true — darrov e’lon qilinadi; aks holda DRAFT bo‘lib qoladi',
  })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'Birinchisi — muqova' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(IMAGES_MAX)
  images?: string[];

  @ApiPropertyOptional({ enum: StudentPriceUnit })
  @IsOptional()
  @IsEnum(StudentPriceUnit)
  priceUnit?: StudentPriceUnit;

  @ApiPropertyOptional({ example: 1500000, description: 'Butun so‘m, tiyinsiz' })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Oraliqning yuqori chegarasi; `price` dan katta bo‘lsin' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceMax?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isNegotiable?: boolean;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @Matches(UZ_PHONE, { message: 'Telefon raqami +998XXXXXXXXX ko‘rinishida bo‘lsin' })
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Phase 1: saqlanadi, tekshirilmaydi' })
  @IsOptional()
  @IsString()
  universityId?: string;

  @ApiPropertyOptional({ enum: ListingAudience, default: ListingAudience.ALL })
  @IsOptional()
  @IsEnum(ListingAudience)
  audience?: ListingAudience;

  @ApiPropertyOptional({ type: [ListingBranchDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ListingBranchDto)
  @ArrayMaxSize(BRANCHES_MAX)
  branches?: ListingBranchDto[];

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00Z' })
  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00Z' })
  @IsOptional()
  @IsISO8601()
  validTo?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  @ApiPropertyOptional({ type: [ListingOptionGroupDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ListingOptionGroupDto)
  @ArrayMaxSize(OPTION_GROUPS_MAX)
  optionGroups?: ListingOptionGroupDto[];

  @ApiProperty({
    description: 'Turga xos qism; `details.kind` tashqi `kind` bilan bir xil bo‘lsin',
    oneOf: DETAILS_SUBTYPES.map((subtype) => ({
      $ref: `#/components/schemas/${subtype.value.name}`,
    })),
  })
  @ValidateNested()
  // `keepDiscriminatorProperty` is required: without it class-transformer strips `kind` from
  // `details`, and the LISTING_KIND_MISMATCH check could never fire.
  @Type(() => Object, {
    discriminator: { property: 'kind', subTypes: [...DETAILS_SUBTYPES] },
    keepDiscriminatorProperty: true,
  })
  details!: ListingDetailsDto;

  /** Wire shape → domain input. Absent optional fields become explicit nulls or defaults. */
  toInput(): CreateListingInput {
    return {
      kind: this.kind,
      submit: this.submit ?? false,
      title: this.title ?? '',
      description: this.description ?? null,
      images: this.images ?? [],
      priceUnit: this.priceUnit ?? null,
      price: this.price ?? 0,
      priceMax: this.priceMax ?? null,
      isNegotiable: this.isNegotiable ?? false,
      contactPhone: this.contactPhone ?? null,
      universityId: this.universityId ?? null,
      audience: this.audience ?? ListingAudience.ALL,
      branches: (this.branches ?? []).map((branch) => branch.toData()),
      validFrom: this.validFrom === undefined ? null : new Date(this.validFrom),
      validTo: this.validTo === undefined ? null : new Date(this.validTo),
      attributes: this.attributes ?? {},
      optionGroups: (this.optionGroups ?? []).map((group) => group.toDomain()),
      details: this.details.toDomain(),
    };
  }
}
