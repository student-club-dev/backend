import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccountType } from '../../../common/enums/account-type.enum';
import { OptionalJwtAuthGuard } from '../../../common/guards/optional-jwt-auth.guard';
import {
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { SearchService } from '../application/search.service';
import { SearchRequestDto } from './dto/search-request.dto';
import {
  SearchCountResponseDto,
  SearchListResponseDto,
  SearchMapResponseDto,
} from './dto/search-response.dto';

/**
 * The feed's single read (Q1): filter + text search + sort + pagination in one POST, with every id
 * in the body and never in the URL (Q2).
 *
 * Public with optional auth (D5): anonymous students get the same offers, only without
 * personalisation (`isFavorite` stays false). A token that is present but invalid still fails —
 * otherwise an expired session would quietly look like a signed-out one.
 */
@ApiTags('Discounts (student feed)')
@Controller('discounts')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Search the offers feed (LIST), map it (MAP) or count it with facets (COUNT)',
    description:
      '`filter.groupKeys` or `filter.types` is mandatory — "everything" is never an answer (Q3). ' +
      'Only visible listings are returned: ACTIVE, business APPROVED, within its validity window (Q4). ' +
      '`mode: "LIST"` returns a page of cards; `mode: "COUNT"` returns the same total plus facets ' +
      'and loads no rows; `mode: "MAP"` returns one marker per branch inside `filter.geo.bbox` or ' +
      'the `lat`/`lng` radius, which it requires. On a map `total` still counts LISTINGS and equals ' +
      'the LIST total, while `markersTotal` counts markers and may exceed it (D15).',
  })
  @ApiOkEnvelope(
    SearchListResponseDto,
    'LIST → `{items, page, size, total, hasNext}`. COUNT → `{total, facets}` (SearchCountResponseDto). ' +
      'MAP → `{markers, clusters, bounds, total, markersTotal, truncated}` (SearchMapResponseDto).',
  )
  @ApiUnauthorizedEnvelope()
  @ApiValidationEnvelope(
    'Invalid body, or a filter the catalog rejects: no type/group (`TYPE_REQUIRED`), more than 3 ' +
      'groups (`TOO_MANY_GROUPS`) or 10 types (`TOO_MANY_TYPES`), unknown group/type/category/attribute, ' +
      'an operator the attribute kind forbids (`ATTRIBUTE_OP_MISMATCH`), `sort.by=DISTANCE` without ' +
      'coordinates (`GEO_REQUIRED_FOR_SORT`), `mode=MAP` without a bbox or point (`GEO_REQUIRED`), ' +
      'an inverted or non-Uzbek bbox (`INVALID_BBOX`), `page.size` above 50 or `map.maxMarkers` above ' +
      '2000 (`PAGE_SIZE_EXCEEDED`) or `price.min > price.max` (`INVALID_PRICE_RANGE`).',
  )
  @ApiExtraModels(SearchCountResponseDto, SearchMapResponseDto)
  async search(
    @Body() body: SearchRequestDto,
    @Req() request: Request & { user?: AuthenticatedUser },
  ): Promise<SearchListResponseDto | SearchCountResponseDto | SearchMapResponseDto> {
    const result = await this.searchService.search(body.toQuery(studentId(request)));
    switch (result.mode) {
      case 'LIST':
        return SearchListResponseDto.fromResult(result);
      case 'COUNT':
        return SearchCountResponseDto.fromResult(result);
      case 'MAP':
        return SearchMapResponseDto.fromResult(result);
    }
  }
}

/** Personalisation is for students only — a business-owner token reads the feed anonymously. */
function studentId(request: Request & { user?: AuthenticatedUser }): string | null {
  return request.user?.type === AccountType.STUDENT ? request.user.id : null;
}
