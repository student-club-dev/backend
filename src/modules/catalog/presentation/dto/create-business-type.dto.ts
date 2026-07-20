import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsHexColor, IsOptional, IsString, Length } from 'class-validator';
import { BusinessTypeWrite } from '../../domain/catalog.repository';
import { Gender } from '../../domain/enums/gender.enum';
import { PriceUnit } from '../../domain/enums/price-unit.enum';

/** CreateBusinessTypeDto — admin body to add a business type (`type` is the PK/key). */
export class CreateBusinessTypeDto {
  @ApiProperty({ description: 'Business type key (PK)', example: 'GAME_CLUB' })
  @IsString()
  @Length(1, 64)
  type!: string;

  @ApiProperty({ example: 'Kafe va Restoran' })
  @IsString()
  @Length(1, 120)
  nameUz!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiPropertyOptional({ nullable: true, example: '🎮' })
  @IsOptional()
  @IsString()
  emoji?: string;

  @ApiPropertyOptional({ nullable: true, description: 'HEX colour', example: '#7C5CFF' })
  @IsOptional()
  @IsHexColor()
  accentColor?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiProperty({ enum: PriceUnit, enumName: 'PriceUnitDto' })
  @IsEnum(PriceUnit)
  defaultPriceUnit!: PriceUnit;

  @ApiPropertyOptional({
    enum: PriceUnit,
    enumName: 'PriceUnitDto',
    isArray: true,
    description: 'Price units valid for this type (the first one is the default)',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PriceUnit, { each: true })
  priceUnits?: PriceUnit[];

  @ApiPropertyOptional({
    enum: Gender,
    enumName: 'GenderDto',
    isArray: true,
    description:
      'Genders this type is offered to (empty = all). Drives GET /business/types?gender=.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Gender, { each: true })
  availableForGenders?: Gender[];

  toWrite(): BusinessTypeWrite {
    return {
      nameUz: this.nameUz,
      nameRu: this.nameRu ?? null,
      emoji: this.emoji ?? null,
      accentColor: this.accentColor ?? null,
      iconUrl: this.iconUrl ?? null,
      defaultPriceUnit: this.defaultPriceUnit,
      priceUnits: this.priceUnits ?? [],
      availableForGenders: this.availableForGenders ?? [],
    };
  }
}
