import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { GeoScopeDto } from './geo-scope.dto';

/** `POST /v1/catalog/groups` body. Everything is optional — an empty body is valid. */
export class CatalogGroupsRequestDto {
  @ApiProperty({
    required: false,
    type: GeoScopeDto,
    description: 'Scopes listingsCount to listings with a branch inside the radius.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoScopeDto)
  geo?: GeoScopeDto;
}
