import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { AttributeFieldType } from '../../../catalog/domain/enums/attribute-field-type.enum';
import { AttributeSpecWrite } from '../../domain/admin-catalog-write.repository';
import { AdminAttributeOptionDto } from './admin-attribute-option.dto';

/** AdminCreateAttributeSpecDto — admin body to add an attribute spec (`id` is generated server-side). */
export class AdminCreateAttributeSpecDto {
  @ApiProperty({ description: 'Business type key (must exist)', example: 'GAME_CLUB' })
  @IsString()
  @Length(1, 64)
  businessType!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'null = a type-level attribute; set for a category-level one.',
    example: 'PLAYSTATION',
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  categoryKey?: string;

  @ApiProperty({ description: 'The `Listing.attributes` key', example: 'model' })
  @IsString()
  @Length(1, 64)
  key!: string;

  @ApiProperty({ example: 'Model' })
  @IsString()
  @Length(1, 120)
  label!: string;

  @ApiProperty({ enum: AttributeFieldType, enumName: 'AttributeFieldTypeDto' })
  @IsEnum(AttributeFieldType)
  kind!: AttributeFieldType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Placeholder for TEXT/NUMBER' })
  @IsOptional()
  @IsString()
  hint?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Unit for NUMBER', example: 'daqiqa' })
  @IsOptional()
  @IsString()
  suffix?: string;

  @ApiPropertyOptional({ nullable: true, description: 'True for MULTI_SELECT' })
  @IsOptional()
  @IsBoolean()
  multiple?: boolean;

  @ApiPropertyOptional({
    type: () => [AdminAttributeOptionDto],
    nullable: true,
    description: 'For SELECT/MULTI_SELECT only',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminAttributeOptionDto)
  options?: AdminAttributeOptionDto[];

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Normalises to the attribute-spec write payload, coercing absent optional fields to null / defaults. */
  toWrite(): AttributeSpecWrite {
    return {
      businessType: this.businessType,
      categoryKey: this.categoryKey ?? null,
      key: this.key,
      label: this.label,
      kind: this.kind,
      required: this.required ?? false,
      hint: this.hint ?? null,
      suffix: this.suffix ?? null,
      multiple: this.multiple ?? null,
      options: this.options === undefined ? null : this.options.map((option) => option.toDomain()),
      sortOrder: this.sortOrder ?? 0,
    };
  }
}
