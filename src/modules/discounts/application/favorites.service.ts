import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { FAVORITES_REPOSITORY, FavoritesRepository } from '../domain/favorites.repository';

/** The state of one listing in one student's favourites, after the operation (D19). */
export interface FavoriteState {
  listingId: string;
  saved: boolean;
}

/**
 * Saving and unsaving a listing (STUDENT_FEED.md §9). Both directions are idempotent: the client
 * sends the state it wants, not a flip, so a retried request cannot land the user on the opposite
 * state from the one their heart icon shows.
 */
@Injectable()
export class FavoritesService {
  constructor(@Inject(FAVORITES_REPOSITORY) private readonly favorites: FavoritesRepository) {}

  async toggle(studentId: string, listingId: string, saved: boolean): Promise<FavoriteState> {
    if (!saved) {
      // No visibility check here on purpose: a listing can expire inside someone's favourites and
      // they must still be able to clear it.
      await this.favorites.remove(studentId, listingId);
      return { listingId, saved: false };
    }

    // Q4 — a student may not bookmark what they cannot see; an unknown and a hidden listing are
    // reported identically so the status is not disclosed.
    const visible = await this.favorites.isListingVisible(listingId);
    if (!visible) {
      throw AppException.notFound(ERROR_CODE.LISTING_NOT_FOUND, 'E’lon topilmadi');
    }

    await this.favorites.add(studentId, listingId);
    return { listingId, saved: true };
  }
}
