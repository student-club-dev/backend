import { ApiProperty } from '@nestjs/swagger';
import { Category } from '../../domain/entities/category.entity';
import { AttributeFieldDto } from './attribute-field.dto';

/** CategoryDto — a category and its form fields (matches elon-uz.json). */
export class CategoryDto {
  @ApiProperty({ example: 'PIZZA' })
  key!: string;

  @ApiProperty({ description: 'Business type key', example: 'CAFE_RESTAURANT' })
  businessType!: string;

  @ApiProperty({ example: 'Pitsa' })
  nameUz!: string;

  @ApiProperty({ required: false, nullable: true })
  nameRu!: string | null;

  @ApiProperty({ required: false, nullable: true })
  iconUrl!: string | null;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({
    type: () => [AttributeFieldDto],
    description: 'The fields shown in the form when this category is selected (order matters).',
  })
  fields!: AttributeFieldDto[];

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'True for OTHER — `customCategoryName` then becomes required',
  })
  requiresCustomName!: boolean | null;

  static fromDomain(category: Category): CategoryDto {
    const dto = new CategoryDto();
    dto.key = category.key;
    dto.businessType = category.businessType;
    dto.nameUz = category.nameUz;
    dto.nameRu = category.nameRu;
    dto.iconUrl = category.iconUrl;
    dto.sortOrder = category.sortOrder;
    dto.fields = category.fields.map(AttributeFieldDto.fromDomain);
    dto.requiresCustomName = category.requiresCustomName;
    return dto;
  }
}
