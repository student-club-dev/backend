import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Query for `GET /v1/gifs/search`. */
export class GifSearchQueryDto {
  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    description: 'Search term. Omit or leave empty for the featured list.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 1, maximum: 50, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ type: String, description: 'The `next` cursor from a previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pos?: string;

  @ApiPropertyOptional({ enum: ['uz_UZ', 'ru_RU', 'en_US'], default: 'uz_UZ' })
  @IsOptional()
  @IsIn(['uz_UZ', 'ru_RU', 'en_US'])
  locale?: string;
}

/** Body of `POST /v1/gifs/:id/share`. */
export class GifShareDto {
  @ApiPropertyOptional({
    type: String,
    maxLength: 100,
    description: 'The search term the result was chosen from, when there was one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
