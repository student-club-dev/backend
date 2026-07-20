import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { BranchLocation } from '../../domain/entities/branch.entity';

/**
 * LocationDto — a branch's location (matches elon-uz.json). Coordinates are bounded to Uzbekistan.
 * `geohash` is server-computed and never accepted from the client — it appears in responses only.
 */
export class LocationDto {
  @ApiProperty({ example: 'TOSHKENT_SHAHRI' })
  @IsString()
  regionId!: string;

  @ApiProperty({ example: 'CHILONZOR' })
  @IsString()
  districtId!: string;

  @ApiProperty({ minLength: 5, maxLength: 200, example: 'Chilonzor 9-kvartal, 42-uy' })
  @IsString()
  @Length(5, 200)
  address!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 200, description: 'Landmark' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 120, example: 'Ikkinchi qavat, lift bilan' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entranceNote?: string;

  @ApiProperty({ format: 'double', minimum: 37.0, maximum: 46.0, example: 41.2856 })
  @IsNumber()
  @Min(37.0)
  @Max(46.0)
  lat!: number;

  @ApiProperty({ format: 'double', minimum: 55.0, maximum: 74.0, example: 69.2034 })
  @IsNumber()
  @Min(55.0)
  @Max(74.0)
  lng!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Computed by the server (7 characters ~150 m). Not accepted from the client.',
  })
  geohash?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  mapUrl?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Tashkent city only' })
  @IsOptional()
  @IsString()
  metroStation?: string;

  /** Request → domain value object. `geohash` is ignored (server-computed → null for now). */
  toDomain(): BranchLocation {
    return {
      regionId: this.regionId,
      districtId: this.districtId,
      address: this.address,
      landmark: this.landmark ?? null,
      entranceNote: this.entranceNote ?? null,
      lat: this.lat,
      lng: this.lng,
      geohash: null,
      mapUrl: this.mapUrl ?? null,
      metroStation: this.metroStation ?? null,
    };
  }

  static fromDomain(location: BranchLocation): LocationDto {
    const dto = new LocationDto();
    dto.regionId = location.regionId;
    dto.districtId = location.districtId;
    dto.address = location.address;
    dto.landmark = location.landmark ?? undefined;
    dto.entranceNote = location.entranceNote ?? undefined;
    dto.lat = location.lat;
    dto.lng = location.lng;
    dto.geohash = location.geohash;
    dto.mapUrl = location.mapUrl ?? undefined;
    dto.metroStation = location.metroStation ?? undefined;
    return dto;
  }
}
