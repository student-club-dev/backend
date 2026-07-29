import { ApiProperty } from '@nestjs/swagger';
import { BusinessType } from '../../domain/entities/business-type.entity';
import { PriceUnit } from '../../domain/enums/price-unit.enum';

/** BusinessTypeInfoDto — a business type and its price units (matches elon-uz.json). */
export class BusinessTypeInfoDto {
  @ApiProperty({ description: 'Business type key (e.g. PLAYSTATION)', example: 'NATIONAL_FOOD' })
  type!: string;

  @ApiProperty({ example: 'Kafe va Restoran' })
  nameUz!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  nameRu!: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  iconUrl!: string | null;

  @ApiProperty({ enum: PriceUnit, enumName: 'PriceUnitDto' })
  defaultPriceUnit!: PriceUnit;

  @ApiProperty({ type: String, required: false, nullable: true, example: '🎮' })
  emoji!: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: 'HEX colour',
    example: '#7C5CFF',
  })
  accentColor!: string | null;

  @ApiProperty({
    enum: PriceUnit,
    enumName: 'PriceUnitDto',
    isArray: true,
    description: 'Price units valid for this type (the first one is the default)',
  })
  priceUnits!: PriceUnit[];

  static fromDomain(type: BusinessType): BusinessTypeInfoDto {
    const dto = new BusinessTypeInfoDto();
    dto.type = type.type;
    dto.nameUz = type.nameUz;
    dto.nameRu = type.nameRu;
    dto.iconUrl = type.iconUrl;
    dto.defaultPriceUnit = type.defaultPriceUnit;
    dto.emoji = type.emoji;
    dto.accentColor = type.accentColor;
    dto.priceUnits = type.priceUnits;
    return dto;
  }
}
