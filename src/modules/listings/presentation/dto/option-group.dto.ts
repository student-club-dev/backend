import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OptionGroupInput } from '../../application/listings.io';
import { ListingOptionGroup } from '../../domain/entities/listing.entity';
import { SelectionType } from '../../domain/enums/selection-type.enum';
import { OptionDto } from './option.dto';

/**
 * OptionGroupDto — a group of add-on options (matches elon-uz.json). Shared by request and response.
 * Max 30 options per group; the group count and select-range coherence are enforced in the service.
 */
export class OptionGroupDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  id?: string | null;

  @ApiProperty({ example: 'Hajmni tanlang' })
  @IsString()
  name!: string;

  @ApiProperty({ enum: SelectionType, enumName: 'SelectionTypeDto' })
  @IsEnum(SelectionType)
  selectionType!: SelectionType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ type: 'integer', nullable: true, format: 'int32' })
  @IsOptional()
  @IsInt()
  minSelect?: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true, format: 'int32' })
  @IsOptional()
  @IsInt()
  maxSelect?: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true, format: 'int32' })
  @IsOptional()
  @IsInt()
  sortOrder?: number | null;

  @ApiProperty({ type: [OptionDto], maxItems: 30 })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options!: OptionDto[];

  toInput(): OptionGroupInput {
    return {
      name: this.name,
      selectionType: this.selectionType,
      isRequired: this.isRequired ?? false,
      minSelect: this.minSelect ?? null,
      maxSelect: this.maxSelect ?? null,
      sortOrder: this.sortOrder ?? null,
      options: this.options.map((option) => option.toInput()),
    };
  }

  static fromDomain(group: ListingOptionGroup): OptionGroupDto {
    const dto = new OptionGroupDto();
    dto.id = group.id;
    dto.name = group.name;
    dto.selectionType = group.selectionType;
    dto.isRequired = group.isRequired;
    dto.minSelect = group.minSelect;
    dto.maxSelect = group.maxSelect;
    dto.sortOrder = group.sortOrder;
    dto.options = group.options.map(OptionDto.fromDomain);
    return dto;
  }
}
