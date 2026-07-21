import { ApiProperty } from '@nestjs/swagger';
import { ReverseGeocodeResult } from '../../application/geocoding.io';

/** ReverseGeocodeResponseDto — reverse-geocode result (matches elon-uz.json). */
export class ReverseGeocodeResponseDto {
  @ApiProperty({ required: false, nullable: true })
  regionId!: string | null;

  @ApiProperty({ required: false, nullable: true })
  districtId!: string | null;

  @ApiProperty({ required: false, nullable: true, example: 'Toshkent, Chilonzor 9-kvartal, 42' })
  address!: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Tashkent only; null for Level-1' })
  nearestMetro!: string | null;

  static from(result: ReverseGeocodeResult): ReverseGeocodeResponseDto {
    const dto = new ReverseGeocodeResponseDto();
    dto.regionId = result.regionId;
    dto.districtId = result.districtId;
    dto.address = result.address;
    dto.nearestMetro = result.nearestMetro;
    return dto;
  }
}
