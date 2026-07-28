import { ApiProperty } from '@nestjs/swagger';
import { CatalogGroup } from '../../../catalog/domain/entities/catalog-group.entity';

/** AdminCatalogGroupDto — the raw catalog group as the admin panel manages it (no home-screen counts). */
export class AdminCatalogGroupDto {
  @ApiProperty({ example: 'FOOD' })
  key!: string;

  @ApiProperty({ example: 'Ovqatlanish' })
  nameUz!: string;

  @ApiProperty({ required: false, nullable: true })
  nameRu!: string | null;

  @ApiProperty({ required: false, nullable: true, example: '🍽' })
  emoji!: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'cafe' })
  icon!: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'HEX colour', example: '#F97316' })
  accentColor!: string | null;

  @ApiProperty({ example: 1 })
  sortOrder!: number;

  @ApiProperty({
    type: [String],
    description: 'Business type keys belonging to this group.',
    example: ['NATIONAL_FOOD', 'FAST_FOOD'],
  })
  types!: string[];

  static fromDomain(group: CatalogGroup): AdminCatalogGroupDto {
    const dto = new AdminCatalogGroupDto();
    dto.key = group.key;
    dto.nameUz = group.nameUz;
    dto.nameRu = group.nameRu;
    dto.emoji = group.emoji;
    dto.icon = group.icon;
    dto.accentColor = group.accentColor;
    dto.sortOrder = group.sortOrder;
    dto.types = group.typeKeys;
    return dto;
  }
}
