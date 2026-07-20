import { ApiProperty } from '@nestjs/swagger';
import { AttributeField } from '../../domain/entities/category.entity';
import { AttributeFieldType } from '../../domain/enums/attribute-field-type.enum';
import { AttributeOptionDto } from './attribute-option.dto';

/** AttributeFieldDto — a single field of the listing form (matches elon-uz.json). */
export class AttributeFieldDto {
  @ApiProperty({ example: 'model', description: 'The `Listing.attributes` key' })
  key!: string;

  @ApiProperty({ example: 'Model' })
  label!: string;

  @ApiProperty({ enum: AttributeFieldType, enumName: 'AttributeFieldTypeDto' })
  type!: AttributeFieldType;

  @ApiProperty({
    example: true,
    description: 'The listing cannot be published unless this is filled in',
  })
  required!: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '60',
    description: 'Placeholder for TEXT/NUMBER',
  })
  hint!: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'daqiqa',
    description: 'Unit for NUMBER',
  })
  suffix!: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'True for MULTI_SELECT. The value is stored comma-separated: "S,M,L"',
  })
  multiple!: boolean | null;

  @ApiProperty({
    type: () => [AttributeOptionDto],
    required: false,
    nullable: true,
    description: 'For SELECT/MULTI_SELECT only',
  })
  options!: AttributeOptionDto[] | null;

  static fromDomain(field: AttributeField): AttributeFieldDto {
    const dto = new AttributeFieldDto();
    dto.key = field.key;
    dto.label = field.label;
    dto.type = field.type;
    dto.required = field.required;
    dto.hint = field.hint;
    dto.suffix = field.suffix;
    dto.multiple = field.multiple;
    dto.options = field.options === null ? null : field.options.map(AttributeOptionDto.fromDomain);
    return dto;
  }
}
