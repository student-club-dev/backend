import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { CatalogGroupWrite } from '../../domain/admin-catalog-write.repository';

/** AdminCreateCatalogGroupDto — admin body to add a catalog group (`key` is the string PK). */
export class AdminCreateCatalogGroupDto {
  @ApiProperty({ description: 'Catalog group key (PK)', example: 'FOOD' })
  @IsString()
  @Length(1, 64)
  key!: string;

  @ApiProperty({ example: 'Ovqatlanish' })
  @IsString()
  @Length(1, 120)
  nameUz!: string;

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

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Normalises to the group write payload, coercing absent optional fields to null / 0. */
  toWrite(): CatalogGroupWrite {
    return {
      nameUz: this.nameUz,
      nameRu: this.nameRu ?? null,
      emoji: this.emoji ?? null,
      icon: this.icon ?? null,
      accentColor: this.accentColor ?? null,
      sortOrder: this.sortOrder ?? 0,
    };
  }
}
