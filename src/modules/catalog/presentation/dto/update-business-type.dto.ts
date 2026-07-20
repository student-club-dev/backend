import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsHexColor, IsOptional, IsString, Length } from 'class-validator';
import { BusinessTypeWrite } from '../../domain/catalog.repository';
import { Gender } from '../../domain/enums/gender.enum';
import { PriceUnit } from '../../domain/enums/price-unit.enum';

/**
 * UpdateBusinessTypeDto — admin partial update of a business type. `type` is the PK (path param)
 * and is not updatable. Only the present keys are written.
 */
export class UpdateBusinessTypeDto {
  @ApiPropertyOptional({ example: 'Kafe va Restoran' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  nameUz?: string;

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

  @ApiPropertyOptional({ enum: PriceUnit, enumName: 'PriceUnitDto' })
  @IsOptional()
  @IsEnum(PriceUnit)
  defaultPriceUnit?: PriceUnit;

  @ApiPropertyOptional({ enum: PriceUnit, enumName: 'PriceUnitDto', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(PriceUnit, { each: true })
  priceUnits?: PriceUnit[];

  @ApiPropertyOptional({ enum: Gender, enumName: 'GenderDto', isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(Gender, { each: true })
  availableForGenders?: Gender[];

  /** Only the present keys — an absent field is left unchanged. */
  toWrite(): Partial<BusinessTypeWrite> {
    const write: Partial<BusinessTypeWrite> = {};
    if (this.nameUz !== undefined) {
      write.nameUz = this.nameUz;
    }
    if (this.nameRu !== undefined) {
      write.nameRu = this.nameRu;
    }
    if (this.emoji !== undefined) {
      write.emoji = this.emoji;
    }
    if (this.accentColor !== undefined) {
      write.accentColor = this.accentColor;
    }
    if (this.iconUrl !== undefined) {
      write.iconUrl = this.iconUrl;
    }
    if (this.defaultPriceUnit !== undefined) {
      write.defaultPriceUnit = this.defaultPriceUnit;
    }
    if (this.priceUnits !== undefined) {
      write.priceUnits = this.priceUnits;
    }
    if (this.availableForGenders !== undefined) {
      write.availableForGenders = this.availableForGenders;
    }
    return write;
  }
}
