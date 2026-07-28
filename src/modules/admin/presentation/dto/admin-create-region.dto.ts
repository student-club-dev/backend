import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';
import { RegionWrite } from '../../domain/admin-geo-write.repository';

/** AdminCreateRegionDto — admin body to add a region (`id` is the string PK/key). */
export class AdminCreateRegionDto {
  @ApiProperty({ description: 'Region key (PK)', example: 'TOSHKENT_SHAHRI' })
  @IsString()
  @Length(1, 64)
  id!: string;

  @ApiProperty({ example: 'Toshkent shahri' })
  @IsString()
  @Length(1, 120)
  nameUz!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Город Ташкент' })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiPropertyOptional({ nullable: true, type: Number, format: 'double', example: 41.2995 })
  @IsOptional()
  @IsLatitude()
  centerLat?: number;

  @ApiPropertyOptional({ nullable: true, type: Number, format: 'double', example: 69.2401 })
  @IsOptional()
  @IsLongitude()
  centerLng?: number;

  /** Normalises to the region write payload, coercing absent optional fields to null. */
  toWrite(): RegionWrite {
    return {
      nameUz: this.nameUz,
      nameRu: this.nameRu ?? null,
      centerLat: this.centerLat ?? null,
      centerLng: this.centerLng ?? null,
    };
  }
}
