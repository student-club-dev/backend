import { ApiProperty } from '@nestjs/swagger';
import type { Suggestion } from '../../domain/suggestion.model';

/** SuggestionDto — one autocomplete row (STUDENT_FEED.md §9). */
export class SuggestionDto {
  @ApiProperty({
    example: 'CATEGORY',
    enum: ['CATEGORY', 'TYPE', 'BUSINESS', 'LISTING'],
    enumName: 'SuggestionKindDto',
    description: 'Which exact filter the client should send back when this row is tapped.',
  })
  kind!: string;

  @ApiProperty({ example: 'Osh / Palov' })
  label!: string;

  @ApiProperty({ type: String, required: false, nullable: true, example: 'NATIONAL_FOOD' })
  typeKey!: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, example: 'PALOV' })
  categoryKey!: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, example: 'biz_01H8X' })
  businessId!: string | null;

  @ApiProperty({ type: String, required: false, nullable: true, example: 'lst_01H8X' })
  listingId!: string | null;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    example: 54,
    description: 'Visible listings this suggestion would yield. Never 0 — such a row is dropped.',
  })
  count!: number;
}

/** The `result` payload of `POST /v1/discounts/suggest`. */
export class SuggestionsDto {
  @ApiProperty({ type: [SuggestionDto] })
  suggestions!: SuggestionDto[];

  static fromDomain(suggestions: Suggestion[]): SuggestionsDto {
    const dto = new SuggestionsDto();
    dto.suggestions = suggestions.map(toSuggestionDto);
    return dto;
  }
}

function toSuggestionDto(suggestion: Suggestion): SuggestionDto {
  const dto = new SuggestionDto();
  Object.assign(dto, suggestion);
  return dto;
}
