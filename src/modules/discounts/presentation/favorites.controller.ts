import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { FavoritesService } from '../application/favorites.service';
import { SearchService } from '../application/search.service';
import { FavoriteToggleRequestDto } from './dto/favorite-toggle-request.dto';
import { FavoriteToggleDto } from './dto/favorite-toggle.dto';
import { FavoritesSearchRequestDto } from './dto/favorites-search-request.dto';
import { SearchListResponseDto } from './dto/search-response.dto';

/**
 * Saved listings. Unlike the rest of the feed this surface is not public: a student token is
 * mandatory (D5), so no token → 401 and a business-owner token → 403.
 */
@ApiTags('Discounts (student feed)')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account — favourites are student-only (D5).')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('discounts')
export class FavoritesController {
  constructor(
    private readonly favoritesService: FavoritesService,
    private readonly searchService: SearchService,
  ) {}

  @Post('favorites/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save or unsave a listing',
    description:
      'The body carries the wanted state, so repeating a request is harmless: saving an already saved listing and unsaving one that was never saved both succeed. Saving requires the listing to be visible (Q4); unsaving does not, so a listing that expired inside the favourites can still be removed.',
  })
  @ApiOkEnvelope(FavoriteToggleDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.LISTING_NOT_FOUND,
    'On save only: no listing with this id, or it is not visible to students (Q4).',
    'E’lon topilmadi',
  )
  async toggle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: FavoriteToggleRequestDto,
  ): Promise<FavoriteToggleDto> {
    const state = await this.favoritesService.toggle(user.id, body.listingId, body.saved);
    return FavoriteToggleDto.fromDomain(state);
  }

  @Post('favorites/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List the saved listings',
    description:
      'The same filter, sort and page model as `POST /discounts/search`, so the client reuses one filter screen. `filter.groupKeys`/`filter.types` are OPTIONAL here — the explicit Q3 exception, since favourites are already a bounded set.',
  })
  @ApiOkEnvelope(SearchListResponseDto)
  async searchFavorites(
    @Body() body: FavoritesSearchRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SearchListResponseDto> {
    const result = await this.searchService.searchFavorites(body.toQuery(user.id));
    // `searchFavorites` always runs in LIST mode, so the COUNT arm of the union is unreachable.
    return SearchListResponseDto.fromResult(result as Extract<typeof result, { mode: 'LIST' }>);
  }
}
