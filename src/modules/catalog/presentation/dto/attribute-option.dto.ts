import { ApiProperty } from '@nestjs/swagger';
import { AttributeOption } from '../../domain/entities/category.entity';

/** AttributeOptionDto — a SELECT / MULTI_SELECT option (matches elon-uz.json). */
export class AttributeOptionDto {
  @ApiProperty({ example: 'PS5', description: 'The value stored in `attributes`' })
  value!: string;

  @ApiProperty({ example: 'PS5', description: 'The label shown on screen' })
  label!: string;

  static fromDomain(option: AttributeOption): AttributeOptionDto {
    const dto = new AttributeOptionDto();
    dto.value = option.value;
    dto.label = option.label;
    return dto;
  }
}
