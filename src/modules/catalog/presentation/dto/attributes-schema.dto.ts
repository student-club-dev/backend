import { ApiProperty } from '@nestjs/swagger';
import {
  CategoryAttributeFields,
  TypeAttributeSchema,
} from '../../domain/entities/type-attribute-schema.entity';
import { AttributeFieldDto } from './attribute-field.dto';

/** The fields shown only when one specific category is selected. */
export class CategoryAttributeFieldsDto {
  @ApiProperty({ example: 'PS5' })
  categoryKey!: string;

  @ApiProperty({ type: () => [AttributeFieldDto] })
  fields!: AttributeFieldDto[];

  static fromDomain(group: CategoryAttributeFields): CategoryAttributeFieldsDto {
    const dto = new CategoryAttributeFieldsDto();
    dto.categoryKey = group.categoryKey;
    dto.fields = group.fields.map(AttributeFieldDto.fromDomain);
    return dto;
  }
}

/**
 * AttributesSchemaDto — every attribute field of a business type, so a client can build the listing
 * form without hardcoding it. Merge `common` with the selected category's `fields` from
 * `byCategory`; a category absent from `byCategory` simply has no fields of its own.
 */
export class AttributesSchemaDto {
  @ApiProperty({ example: 'PLAYSTATION' })
  businessType!: string;

  @ApiProperty({
    type: () => [AttributeFieldDto],
    description: 'Fields that apply to every listing of this business type',
  })
  common!: AttributeFieldDto[];

  @ApiProperty({
    type: () => [CategoryAttributeFieldsDto],
    description: 'Additional fields per category, merged with `common` once one is selected',
  })
  byCategory!: CategoryAttributeFieldsDto[];

  static fromDomain(schema: TypeAttributeSchema): AttributesSchemaDto {
    const dto = new AttributesSchemaDto();
    dto.businessType = schema.businessType;
    dto.common = schema.common.map(AttributeFieldDto.fromDomain);
    dto.byCategory = schema.byCategory.map(CategoryAttributeFieldsDto.fromDomain);
    return dto;
  }
}
