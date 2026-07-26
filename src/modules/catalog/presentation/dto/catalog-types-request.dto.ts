import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Gender } from '../../domain/enums/gender.enum';
import { GeoScopeDto } from './geo-scope.dto';

/**
 * `POST /v1/catalog/types` body. `groupKeys` is capped at 3 (STUDENT_FEED.md D1 — the limit sits
 * on groups, not on the types they expand to; SPORT alone already holds 10 types).
 */
export class CatalogTypesRequestDto {
  @ApiProperty({ type: [String], example: ['FOOD'], minItems: 1, maxItems: 3 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  groupKeys!: string[];

  @ApiProperty({
    required: false,
    enum: Gender,
    enumName: 'GenderDto',
    description: 'Narrows the type list only — never the counts (D16).',
  })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false, type: GeoScopeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoScopeDto)
  geo?: GeoScopeDto;
}
