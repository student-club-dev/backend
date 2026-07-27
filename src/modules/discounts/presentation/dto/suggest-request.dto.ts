import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SuggestRequest } from '../../application/suggest.service';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/** `POST /v1/discounts/suggest` body (STUDENT_FEED.md §9). */
export class SuggestRequestDto {
  @ApiProperty({
    example: 'osh',
    maxLength: 100,
    description:
      'What the user typed. Shorter than 2 characters returns an empty list rather than an error — the client asks on every keystroke.',
  })
  @IsString()
  @MaxLength(100)
  query!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['FOOD'],
    maxItems: 3,
    description: 'Expanded to its business types. Required unless `types` is given (Q3).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  groupKeys?: string[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    description: 'Narrows the group expansion. Every entry must belong to one of `groupKeys`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  types?: string[];

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  toQuery(): SuggestRequest {
    return {
      query: this.query,
      groupKeys: this.groupKeys ?? [],
      types: this.types ?? [],
      limit: this.limit ?? DEFAULT_LIMIT,
    };
  }
}
