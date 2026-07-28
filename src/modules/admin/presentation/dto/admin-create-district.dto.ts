import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';
import { DistrictWrite } from '../../domain/admin-geo-write.repository';

/** AdminCreateDistrictDto — admin body to add a district (`id` is the string PK/key). */
export class AdminCreateDistrictDto {
  @ApiProperty({ description: 'District key (PK)', example: 'CHILONZOR' })
  @IsString()
  @Length(1, 64)
  id!: string;

  @ApiProperty({ description: 'Parent region key (must exist)', example: 'TOSHKENT_SHAHRI' })
  @IsString()
  @Length(1, 64)
  regionId!: string;

  @ApiProperty({ example: 'Chilonzor tumani' })
  @IsString()
  @Length(1, 120)
  nameUz!: string;

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

  /** Normalises to the district write payload, coercing absent optional fields to null. */
  toWrite(): DistrictWrite {
    return {
      regionId: this.regionId,
      nameUz: this.nameUz,
      nameRu: this.nameRu ?? null,
      centerLat: this.centerLat ?? null,
      centerLng: this.centerLng ?? null,
    };
  }
}
