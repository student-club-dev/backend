import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { AttributeSpecUpdate } from '../../domain/admin-catalog-write.repository';
import { AdminAttributeOptionDto } from './admin-attribute-option.dto';

/**
 * AdminUpdateAttributeSpecDto — admin partial update of an attribute spec. Its identity
 * (`businessType`, `categoryKey`, `key`) and `id` are immutable. Only the present keys are written.
 */
export class AdminUpdateAttributeSpecDto {
  @ApiPropertyOptional({ example: 'Model' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @ApiPropertyOptional({ enum: AttributeFieldType, enumName: 'AttributeFieldTypeDto' })
  @IsOptional()
  @IsEnum(AttributeFieldType)
  kind?: AttributeFieldType;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Only the present keys — an absent field is left unchanged. */
  toUpdate(): AttributeSpecUpdate {
    const update: AttributeSpecUpdate = {};
    if (this.label !== undefined) {
      update.label = this.label;
    }
    if (this.kind !== undefined) {
      update.kind = this.kind;
    }
    if (this.required !== undefined) {
      update.required = this.required;
    }
    if (this.hint !== undefined) {
      update.hint = this.hint;
    }
    if (this.suffix !== undefined) {
      update.suffix = this.suffix;
    }
    if (this.multiple !== undefined) {
      update.multiple = this.multiple;
    }
    if (this.options !== undefined) {
      update.options = this.options.map((option) => option.toDomain());
    }
    if (this.sortOrder !== undefined) {
      update.sortOrder = this.sortOrder;
    }
    return update;
  }
}
