import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';
import type { GeoScope } from '../../domain/catalog.repository';

/** Point + radius used to scope catalog counts (STUDENT_FEED.md §4 `filter.geo`). */
export class GeoScopeDto {
  @ApiProperty({ example: 41.3111, description: 'Latitude (Uzbekistan: 37..46)' })
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 69.2797, description: 'Longitude (Uzbekistan: 55..74)' })
  @IsLongitude()
  lng!: number;

  @ApiProperty({ required: false, default: 5000, minimum: 100, maximum: 50000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(50_000)
  radiusMeters?: number;

  toDomain(): GeoScope {
    return { lat: this.lat, lng: this.lng, radiusMeters: this.radiusMeters ?? 5000 };
  }
}
