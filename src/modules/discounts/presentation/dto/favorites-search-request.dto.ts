import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import type { SearchQuery } from '../../application/search-query.model';
import { SearchFilterDto, SearchPageDto, SearchSortDto } from './search-request.dto';

const DEFAULT_FAVORITES_PAGE_SIZE = 20;

/**
 * `POST /v1/discounts/favorites/search` body — the same filter model as the open feed (§9), which
 * is the point: the client reuses one filter screen for both.
 *
 * `filter` itself is optional here. Favourites are already a bounded set, so Q3's "a type or group
 * is mandatory" does not apply — an empty body means "everything I saved".
 */
export class FavoritesSearchRequestDto {
  @ApiProperty({
    required: false,
    type: SearchFilterDto,
    description: 'Same shape as `POST /discounts/search`; `groupKeys`/`types` are optional here.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchFilterDto)
  filter?: SearchFilterDto;

  @ApiProperty({ required: false, type: SearchSortDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchSortDto)
  sort?: SearchSortDto;

  @ApiProperty({ required: false, type: SearchPageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchPageDto)
  page?: SearchPageDto;

  /** Always a LIST: a facet breakdown of one's own favourites has no screen behind it. */
  toQuery(studentId: string): SearchQuery {
    const filter = this.filter ?? new SearchFilterDto();
    return {
      mode: 'LIST',
      filter: filter.toDomain(),
      // NEWEST rather than the feed's RELEVANCE default: with no text to rank, "most recently
      // saved first" is what a favourites list means.
      sort: { by: this.sort?.by ?? 'NEWEST', direction: this.sort?.direction ?? null },
      page: {
        number: this.page?.number ?? 0,
        size: this.page?.size ?? DEFAULT_FAVORITES_PAGE_SIZE,
      },
      studentId,
    };
  }
}
