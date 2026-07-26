import { ApiProperty } from '@nestjs/swagger';
import { CatalogGroupWithCounts } from '../../application/catalog-counts.model';

/** CatalogGroupDto — one of the 8 home-screen groups (STUDENT_FEED.md §3). */
export class CatalogGroupDto {
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

  @ApiProperty({ type: [String], example: ['NATIONAL_FOOD', 'FAST_FOOD', 'SOMSA'] })
  types!: string[];

  @ApiProperty({ example: 3 })
  typesCount!: number;

  @ApiProperty({
    example: 312,
    description: 'Visible listings (ACTIVE + APPROVED + in date), scoped to `geo` when given.',
  })
  listingsCount!: number;

  static fromDomain(group: CatalogGroupWithCounts): CatalogGroupDto {
    const dto = new CatalogGroupDto();
    dto.key = group.key;
    dto.nameUz = group.nameUz;
    dto.nameRu = group.nameRu;
    dto.emoji = group.emoji;
    dto.icon = group.icon;
    dto.accentColor = group.accentColor;
    dto.sortOrder = group.sortOrder;
    dto.types = group.typeKeys;
    dto.typesCount = group.typesCount;
    dto.listingsCount = group.listingsCount;
    return dto;
  }
}
