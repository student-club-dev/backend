import { ApiProperty } from '@nestjs/swagger';
import { BusinessTypeWithCounts } from '../../application/catalog-counts.model';
import { Gender } from '../../domain/enums/gender.enum';
import { PriceUnit } from '../../domain/enums/price-unit.enum';

/** CatalogTypeDto — a business type inside a group, with its counts (STUDENT_FEED.md §3). */
export class CatalogTypeDto {
  @ApiProperty({ example: 'NATIONAL_FOOD' })
  key!: string;

  @ApiProperty({ example: 'FOOD' })
  groupKey!: string;

  @ApiProperty({ example: 'Milliy taomlar' })
  nameUz!: string;

  @ApiProperty({ required: false, nullable: true, example: '🍛' })
  emoji!: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'HEX colour', example: '#EA580C' })
  accentColor!: string | null;

  @ApiProperty({ enum: PriceUnit, enumName: 'PriceUnitDto' })
  defaultPriceUnit!: PriceUnit;

  @ApiProperty({ enum: PriceUnit, enumName: 'PriceUnitDto', isArray: true })
  priceUnits!: PriceUnit[];

  @ApiProperty({ enum: Gender, enumName: 'GenderDto', isArray: true })
  availableForGenders!: Gender[];

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Label for the type-wide "ALL" category',
    example: 'Butun menyu',
  })
  allCategoryLabel!: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'Porsiya, tarkib' })
  optionGroupHint!: string | null;

  @ApiProperty({ example: 8, description: 'Base categories (gender-specific lists excluded)' })
  categoriesCount!: number;

  @ApiProperty({ example: 187, description: 'Visible listings, scoped to `geo` when given' })
  listingsCount!: number;

  static fromDomain(type: BusinessTypeWithCounts): CatalogTypeDto {
    const dto = new CatalogTypeDto();
    dto.key = type.type;
    dto.groupKey = type.groupKey;
    dto.nameUz = type.nameUz;
    dto.emoji = type.emoji;
    dto.accentColor = type.accentColor;
    dto.defaultPriceUnit = type.defaultPriceUnit;
    dto.priceUnits = type.priceUnits;
    dto.availableForGenders = type.availableForGenders;
    dto.allCategoryLabel = type.allCategoryLabel;
    dto.optionGroupHint = type.optionGroupHint;
    dto.categoriesCount = type.categoriesCount;
    dto.listingsCount = type.listingsCount;
    return dto;
  }
}
