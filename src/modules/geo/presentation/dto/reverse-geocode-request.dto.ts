import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

/**
 * ReverseGeocodeRequestDto — coordinates to reverse-geocode (matches elon-uz.json). Bounds here are
 * global sanity only (a valid coordinate); the Uzbekistan bounds check lives in GeocodingService so
 * an out-of-country point yields `422 LOCATION_OUT_OF_BOUNDS`, not a generic validation error.
 */
export class ReverseGeocodeRequestDto {
  @ApiProperty({ format: 'double', example: 41.311081 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ format: 'double', example: 69.240562 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
