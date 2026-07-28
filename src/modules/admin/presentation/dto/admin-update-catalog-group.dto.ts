import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { CatalogGroupWrite } from '../../domain/admin-catalog-write.repository';

/**
 * AdminUpdateCatalogGroupDto — admin partial update of a catalog group. `key` is the PK (path param)
 * and is not updatable. Only the present keys are written; an absent field is left unchanged.
 */
export class AdminUpdateCatalogGroupDto {
  @ApiPropertyOptional({ example: 'Ovqatlanish' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  nameUz?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiPropertyOptional({ nullable: true, example: '🍽' })
  @IsOptional()
  @IsString()
  emoji?: string;

  @ApiPropertyOptional({ nullable: true, example: 'cafe' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ nullable: true, description: 'HEX colour', example: '#F97316' })
  @IsOptional()
  @IsHexColor()
  accentColor?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Only the present keys — an absent field is left unchanged. */
  toWrite(): Partial<CatalogGroupWrite> {
    const write: Partial<CatalogGroupWrite> = {};
    if (this.nameUz !== undefined) {
      write.nameUz = this.nameUz;
    }
    if (this.nameRu !== undefined) {
      write.nameRu = this.nameRu;
    }
    if (this.emoji !== undefined) {
      write.emoji = this.emoji;
    }
    if (this.icon !== undefined) {
      write.icon = this.icon;
    }
    if (this.accentColor !== undefined) {
      write.accentColor = this.accentColor;
    }
    if (this.sortOrder !== undefined) {
      write.sortOrder = this.sortOrder;
    }
    return write;
  }
}
