import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { GeoScopeDto } from '../../../catalog/presentation/dto/geo-scope.dto';

/**
 * `POST /v1/discounts/detail` body (STUDENT_FEED.md §9). The id travels in the body, never in the
 * path (Q1/Q2) — which is why a pure read is a POST.
 */
export class DetailRequestDto {
  @ApiProperty({ example: 'lst_01H8X' })
  @IsString()
  @IsNotEmpty()
  listingId!: string;

  @ApiProperty({
    required: false,
    type: GeoScopeDto,
    description:
      'Where the student is. Only fills in `distanceMeters` and orders `branches` nearest-first — it never hides a listing.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoScopeDto)
  geo?: GeoScopeDto;
}
