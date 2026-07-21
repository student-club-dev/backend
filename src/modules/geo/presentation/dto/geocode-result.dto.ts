import { ApiProperty } from '@nestjs/swagger';
import { GeocodeResult } from '../../application/geocoding.io';

/** GeocodeResultDto — one forward-geocode candidate (matches elon-uz.json). */
export class GeocodeResultDto {
  @ApiProperty({ format: 'double', example: 41.311081 })
  lat!: number;

  @ApiProperty({ format: 'double', example: 69.240562 })
  lng!: number;

  @ApiProperty({ required: false, nullable: true })
  regionId!: string | null;

  @ApiProperty({ required: false, nullable: true })
  districtId!: string | null;

  @ApiProperty({ example: 'Toshkent, Chilonzor 9-kvartal, 42' })
  formattedAddress!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    type: Number,
    format: 'double',
    description: '0..1',
  })
  confidence!: number | null;

  static from(result: GeocodeResult): GeocodeResultDto {
    const dto = new GeocodeResultDto();
    dto.lat = result.lat;
    dto.lng = result.lng;
    dto.regionId = result.regionId;
    dto.districtId = result.districtId;
    dto.formattedAddress = result.formattedAddress;
    dto.confidence = result.confidence;
    return dto;
  }
}
