import { ApiProperty } from '@nestjs/swagger';
import { FavoriteState } from '../../application/favorites.service';

/**
 * `POST /v1/discounts/favorites/toggle` result — the state after the operation.
 * D19: no `favoritesCount` here; it read two different ways and no screen uses it.
 */
export class FavoriteToggleDto {
  @ApiProperty({ example: 'lst_01H8X7Qv2K' })
  listingId!: string;

  @ApiProperty({ example: true })
  saved!: boolean;

  static fromDomain(state: FavoriteState): FavoriteToggleDto {
    const dto = new FavoriteToggleDto();
    dto.listingId = state.listingId;
    dto.saved = state.saved;
    return dto;
  }
}
