import { ApiProperty } from '@nestjs/swagger';
import { Region } from '../../domain/entities/region.entity';

/** RegionDto — an Uzbekistan region (matches elon-uz.json). */
export class RegionDto {
  @ApiProperty({ example: 'TOSHKENT_SHAHRI' })
  id!: string;

  @ApiProperty({ example: 'Toshkent shahri' })
  nameUz!: string;

  @ApiProperty({ required: false, nullable: true })
  nameRu!: string | null;

  @ApiProperty({ required: false, nullable: true, type: Number, format: 'double' })
  centerLat!: number | null;

  @ApiProperty({ required: false, nullable: true, type: Number, format: 'double' })
  centerLng!: number | null;

  static fromDomain(region: Region): RegionDto {
    const dto = new RegionDto();
    dto.id = region.id;
    dto.nameUz = region.nameUz;
    dto.nameRu = region.nameRu;
    dto.centerLat = region.centerLat;
    dto.centerLng = region.centerLng;
    return dto;
  }
}
