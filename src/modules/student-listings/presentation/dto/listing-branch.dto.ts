import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  UZ_LAT_MAX,
  UZ_LAT_MIN,
  UZ_LNG_MAX,
  UZ_LNG_MIN,
} from '../../domain/validation/rules/location.rules';
import type { StudentListingBranchData } from '../../domain/student-listing.repository';

/**
 * One map pin (§2.4). The bounds are enforced here as well as in the publish rules: a DRAFT skips
 * publish validation entirely, and a coordinate in the wrong hemisphere should never reach the
 * database even in a draft.
 */
export class ListingBranchDto {
  @ApiProperty({ example: 41.2856, minimum: UZ_LAT_MIN, maximum: UZ_LAT_MAX })
  @Min(UZ_LAT_MIN)
  @Max(UZ_LAT_MAX)
  lat!: number;

  @ApiProperty({ example: 69.2034, minimum: UZ_LNG_MIN, maximum: UZ_LNG_MAX })
  @Min(UZ_LNG_MIN)
  @Max(UZ_LNG_MAX)
  lng!: number;

  @ApiProperty({ example: 'Chilonzor 9-kvartal, 42-uy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address!: string;

  @ApiPropertyOptional({ example: 'Chilonzor filiali' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Korzinka ro‘parasida' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiPropertyOptional({ example: 'TOSHKENT_SHAHRI' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ example: 'CHILONZOR' })
  @IsOptional()
  @IsString()
  districtId?: string;

  toData(): StudentListingBranchData {
    return {
      lat: this.lat,
      lng: this.lng,
      address: this.address,
      name: this.name ?? null,
      landmark: this.landmark ?? null,
      regionId: this.regionId ?? null,
      districtId: this.districtId ?? null,
    };
  }
}
