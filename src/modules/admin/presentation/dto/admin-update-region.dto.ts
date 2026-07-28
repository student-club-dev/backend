import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';
import { RegionWrite } from '../../domain/admin-geo-write.repository';

/**
 * AdminUpdateRegionDto — admin partial update of a region. `id` is the PK (path param) and is not
 * updatable. Only the present keys are written; an absent field is left unchanged.
 */
export class AdminUpdateRegionDto {
  @ApiPropertyOptional({ example: 'Toshkent shahri' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  nameUz?: string;

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

  /** Only the present keys — an absent field is left unchanged. */
  toWrite(): Partial<RegionWrite> {
    const write: Partial<RegionWrite> = {};
    if (this.nameUz !== undefined) {
      write.nameUz = this.nameUz;
    }
    if (this.nameRu !== undefined) {
      write.nameRu = this.nameRu;
    }
    if (this.centerLat !== undefined) {
      write.centerLat = this.centerLat;
    }
    if (this.centerLng !== undefined) {
      write.centerLng = this.centerLng;
    }
    return write;
  }
}
