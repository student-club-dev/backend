import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PriceUnit } from '../../../catalog/domain/enums/price-unit.enum';
import { UpdateListingInput } from '../../application/listings.io';
import { DiscountRequestDto } from './discount-request.dto';
import { OptionGroupDto } from './option-group.dto';
import { RedemptionInfoDto } from './redemption-info.dto';

/**
 * UpdateListingRequestDto — the full-replace edit payload (matches elon-uz.json). Same shape as
 * create minus `currency` (immutable on edit). The owner edits content only; `status`, `usedCount`
 * and `viewsCount` are server-owned and never accepted here. Business rules are re-validated in the
 * service exactly like create (LISTINGS.md §10).
 */
export class UpdateListingRequestDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @ApiProperty({ example: 'PIZZA' })
  @IsString()
  categoryKey!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Required when categoryKey = OTHER' })
  @IsOptional()
  @IsString()
  customCategoryName?: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ type: [String], maxItems: 10, description: 'The first one is the cover' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  images!: string[];

  @ApiProperty({ enum: PriceUnit, enumName: 'PriceUnitDto' })
  @IsEnum(PriceUnit)
  priceUnit!: PriceUnit;

  @ApiProperty({ format: 'int64', example: 55000, description: 'Whole soums (no tiyin)' })
  @IsInt()
  originalPrice!: number;

  @ApiProperty({ type: DiscountRequestDto })
  @IsObject()
  @ValidateNested()
  @Type(() => DiscountRequestDto)
  discount!: DiscountRequestDto;

  @ApiProperty({ type: RedemptionInfoDto })
  @IsObject()
  @ValidateNested()
  @Type(() => RedemptionInfoDto)
  redemption!: RedemptionInfoDto;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  validFrom!: string;

  @ApiProperty({ format: 'date-time', description: 'validTo > validFrom, at most +1 year' })
  @IsDateString()
  validTo!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Business-type-specific fields — a string → string map validated against the catalog.',
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  @ApiPropertyOptional({ type: [OptionGroupDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionGroupDto)
  optionGroups?: OptionGroupDto[];

  toInput(): UpdateListingInput {
    return {
      branchIds: this.branchIds ?? [],
      categoryKey: this.categoryKey,
      customCategoryName: this.customCategoryName ?? null,
      title: this.title,
      description: this.description ?? null,
      images: this.images,
      priceUnit: this.priceUnit,
      originalPrice: this.originalPrice,
      discount: this.discount.toInput(),
      redemption: this.redemption.toInput(),
      validFrom: new Date(this.validFrom),
      validTo: new Date(this.validTo),
      attributes: this.attributes ?? null,
      optionGroups: (this.optionGroups ?? []).map((group) => group.toInput()),
    };
  }
}
