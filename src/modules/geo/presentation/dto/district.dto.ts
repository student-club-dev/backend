import { ApiProperty } from '@nestjs/swagger';
import { District } from '../../domain/entities/district.entity';

/** DistrictDto — an Uzbekistan district (matches elon-uz.json). */
export class DistrictDto {
  @ApiProperty({ example: 'CHILONZOR' })
  id!: string;

  @ApiProperty({ example: 'TOSHKENT_SHAHRI' })
  regionId!: string;

  @ApiProperty({ example: 'Chilonzor tumani' })
  nameUz!: string;

  @ApiProperty({ required: false, nullable: true })
  nameRu!: string | null;

  @ApiProperty({ required: false, nullable: true, type: Number, format: 'double' })
  centerLat!: number | null;

  @ApiProperty({ required: false, nullable: true, type: Number, format: 'double' })
  centerLng!: number | null;

  static fromDomain(district: District): DistrictDto {
    const dto = new DistrictDto();
    dto.id = district.id;
    dto.regionId = district.regionId;
    dto.nameUz = district.nameUz;
    dto.nameRu = district.nameRu;
    dto.centerLat = district.centerLat;
    dto.centerLng = district.centerLng;
    return dto;
  }
}
