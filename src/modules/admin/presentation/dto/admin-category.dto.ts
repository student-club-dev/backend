import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '../../../catalog/domain/enums/gender.enum';
import { AdminCategory } from '../../domain/entities/admin-category.entity';

/** AdminCategoryDto — the raw category as the admin panel manages it (exposes `id` and `gender`). */
export class AdminCategoryDto {
  @ApiProperty({ description: 'Category id (PK)', example: 'ckv...' })
  id!: string;

  @ApiProperty({ description: 'Business type key', example: 'NATIONAL_FOOD' })
  businessType!: string;

  @ApiProperty({
    enum: Gender,
    enumName: 'GenderDto',
    required: false,
    nullable: true,
    description: 'null = the type’s base list; set only for gender-specific lists.',
  })
  gender!: Gender | null;

  @ApiProperty({ example: 'PIZZA' })
  key!: string;

  @ApiProperty({ example: 'Pitsa' })
  nameUz!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  nameRu!: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  iconUrl!: string | null;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ description: 'True for OTHER — the client then requires customCategoryName.' })
  requiresCustomName!: boolean;

  static fromDomain(category: AdminCategory): AdminCategoryDto {
    const dto = new AdminCategoryDto();
    dto.id = category.id;
    dto.businessType = category.businessType;
    dto.gender = category.gender;
    dto.key = category.key;
    dto.nameUz = category.nameUz;
    dto.nameRu = category.nameRu;
    dto.iconUrl = category.iconUrl;
    dto.sortOrder = category.sortOrder;
    dto.requiresCustomName = category.requiresCustomName;
    return dto;
  }
}
