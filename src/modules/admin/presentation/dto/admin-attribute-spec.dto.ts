import { ApiProperty } from '@nestjs/swagger';
import { AttributeFieldType } from '../../../catalog/domain/enums/attribute-field-type.enum';
import { AttributeOptionDto } from '../../../catalog/presentation/dto/attribute-option.dto';
import { AdminAttributeSpec } from '../../domain/entities/admin-attribute-spec.entity';

/** AdminAttributeSpecDto — the raw attribute spec as the admin panel manages it (exposes `id`). */
export class AdminAttributeSpecDto {
  @ApiProperty({ description: 'Attribute spec id (PK)', example: 'ckv...' })
  id!: string;

  @ApiProperty({ description: 'Business type key', example: 'GAME_CLUB' })
  businessType!: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: 'null = a type-level attribute; set for a category-level one.',
    example: 'PLAYSTATION',
  })
  categoryKey!: string | null;

  @ApiProperty({ example: 'model', description: 'The `Listing.attributes` key' })
  key!: string;

  @ApiProperty({ example: 'Model' })
  label!: string;

  @ApiProperty({ enum: AttributeFieldType, enumName: 'AttributeFieldTypeDto' })
  kind!: AttributeFieldType;

  @ApiProperty({ example: true })
  required!: boolean;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: 'Placeholder for TEXT/NUMBER',
  })
  hint!: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: 'Unit for NUMBER',
    example: 'daqiqa',
  })
  suffix!: string | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    nullable: true,
    description: 'True for MULTI_SELECT',
  })
  multiple!: boolean | null;

  @ApiProperty({
    type: () => [AttributeOptionDto],
    required: false,
    nullable: true,
    description: 'For SELECT/MULTI_SELECT only',
  })
  options!: AttributeOptionDto[] | null;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  static fromDomain(spec: AdminAttributeSpec): AdminAttributeSpecDto {
    const dto = new AdminAttributeSpecDto();
    dto.id = spec.id;
    dto.businessType = spec.businessType;
    dto.categoryKey = spec.categoryKey;
    dto.key = spec.key;
    dto.label = spec.label;
    dto.kind = spec.kind;
    dto.required = spec.required;
    dto.hint = spec.hint;
    dto.suffix = spec.suffix;
    dto.multiple = spec.multiple;
    dto.options = spec.options === null ? null : spec.options.map(AttributeOptionDto.fromDomain);
    dto.sortOrder = spec.sortOrder;
    return dto;
  }
}
