import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../../../common/guards/optional-jwt-auth.guard';
import {
  ApiOkEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { SuggestService } from '../application/suggest.service';
import { SuggestRequestDto } from './dto/suggest-request.dto';
import { SuggestionsDto } from './dto/suggestion.dto';

/**
 * Search autocomplete. Public (D5) — a student types before signing up; an invalid token is still
 * rejected rather than downgraded to anonymous.
 */
@ApiTags('Discounts (student feed)')
@Controller('discounts')
@UseGuards(OptionalJwtAuthGuard)
export class SuggestController {
  constructor(private readonly suggestService: SuggestService) {}

  @Post('suggest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Autocomplete the search box',
    description:
      'Tapping a suggestion sends an exact filter (`categoryKeys: ["PALOV"]`) instead of the typed text, so every row is scoped to the requested groups/types and carries the number of visible listings it would yield — a row that would yield none is never returned. Ordered by kind (CATEGORY → TYPE → BUSINESS → LISTING), then by that count.',
  })
  @ApiOkEnvelope(SuggestionsDto)
  @ApiValidationEnvelope(
    'Neither `groupKeys` nor `types` was given (`TYPE_REQUIRED`), or a key is unknown / outside the selected groups (`UNKNOWN_GROUP`, `UNKNOWN_TYPE`, `TYPE_GROUP_MISMATCH`).',
  )
  async suggest(@Body() body: SuggestRequestDto): Promise<SuggestionsDto> {
    const suggestions = await this.suggestService.suggest(body.toQuery());
    return SuggestionsDto.fromDomain(suggestions);
  }
}
