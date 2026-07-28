import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';
import { DistrictWrite } from '../../domain/admin-geo-write.repository';

/**
 * AdminUpdateDistrictDto — admin partial update of a district. `id` is the PK (path param) and is
 * not updatable; `regionId` may be changed (the target region must exist). Only the present keys are
 * written; an absent field is left unchanged.
 */
export class AdminUpdateDistrictDto {
  @ApiPropertyOptional({ description: 'Move to another region (must exist)', example: 'TOSHKENT' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  regionId?: string;

  @ApiPropertyOptional({ example: 'Chilonzor tumani' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  nameUz?: string;

  @ApiPropertyOptional({ nullable: true, example: 'Чиланзарский район' })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiPropertyOptional({ nullable: true, type: Number, format: 'double', example: 41.2755 })
  @IsOptional()
  @IsLatitude()
  centerLat?: number;

  @ApiPropertyOptional({ nullable: true, type: Number, format: 'double', example: 69.2044 })
  @IsOptional()
  @IsLongitude()
  centerLng?: number;

  /** Only the present keys — an absent field is left unchanged. */
  toWrite(): Partial<DistrictWrite> {
    const write: Partial<DistrictWrite> = {};
    if (this.regionId !== undefined) {
      write.regionId = this.regionId;
    }
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
