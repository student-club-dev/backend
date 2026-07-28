import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { AttributeOption } from '../../../catalog/domain/entities/category.entity';

/** AdminAttributeOptionDto — a validated SELECT / MULTI_SELECT option in an admin write body. */
export class AdminAttributeOptionDto {
  @ApiProperty({ example: 'PS5', description: 'The value stored in `attributes`' })
  @IsString()
  @Length(1, 120)
  value!: string;

  @ApiProperty({ example: 'PS5', description: 'The label shown on screen' })
  @IsString()
  @Length(1, 120)
  label!: string;

  toDomain(): AttributeOption {
    return { value: this.value, label: this.label };
  }
}
