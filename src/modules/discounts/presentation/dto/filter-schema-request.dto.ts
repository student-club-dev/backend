import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { GeoScopeDto } from '../../../catalog/presentation/dto/geo-scope.dto';

/** `POST /v1/catalog/filter-schema` body (STUDENT_FEED.md §9). */
export class FilterSchemaRequestDto {
  @ApiProperty({ type: [String], example: ['FOOD'], minItems: 1, maxItems: 3 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  groupKeys!: string[];

  @ApiProperty({
    required: false,
    type: [String],
    maxItems: 10,
    description: 'Narrows the group expansion. Every entry must belong to one of `groupKeys`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  types?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: 30 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  categoryKeys?: string[];

  @ApiProperty({ required: false, type: GeoScopeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoScopeDto)
  geo?: GeoScopeDto;
}
