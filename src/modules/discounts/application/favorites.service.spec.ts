import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { FavoritesRepository } from '../domain/favorites.repository';
import { FavoritesService } from './favorites.service';

const STUDENT_ID = 'stu_1';
const LISTING_ID = 'lst_1';

function makeRepository(overrides: Partial<FavoritesRepository> = {}): FavoritesRepository {
  return {
    isListingVisible: jest.fn().mockResolvedValue(true),
    add: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('FavoritesService', () => {
  describe('saving', () => {
    it('saves a visible listing and echoes the new state', async () => {
      const repository = makeRepository();
      const service = new FavoritesService(repository);

      const state = await service.toggle(STUDENT_ID, LISTING_ID, true);

      expect(repository.add).toHaveBeenCalledWith(STUDENT_ID, LISTING_ID);
      expect(state).toEqual({ listingId: LISTING_ID, saved: true });
    });

    it('is idempotent — saving twice reports saved both times', async () => {
      const repository = makeRepository();
      const service = new FavoritesService(repository);

      const first = await service.toggle(STUDENT_ID, LISTING_ID, true);
      const second = await service.toggle(STUDENT_ID, LISTING_ID, true);

      expect(first).toEqual(second);
      expect(repository.add).toHaveBeenCalledTimes(2);
    });

    it('rejects a listing that is not visible with 404 LISTING_NOT_FOUND', async () => {
      const repository = makeRepository({ isListingVisible: jest.fn().mockResolvedValue(false) });
      const service = new FavoritesService(repository);

      await expect(service.toggle(STUDENT_ID, LISTING_ID, true)).rejects.toMatchObject({
        code: ERROR_CODE.LISTING_NOT_FOUND,
        status: 404,
        message: 'E’lon topilmadi',
      });
      await expect(service.toggle(STUDENT_ID, LISTING_ID, true)).rejects.toBeInstanceOf(
        AppException,
      );
      expect(repository.add).not.toHaveBeenCalled();
    });
  });

  describe('unsaving', () => {
    it('removes the listing and echoes the new state', async () => {
      const repository = makeRepository();
      const service = new FavoritesService(repository);

      const state = await service.toggle(STUDENT_ID, LISTING_ID, false);

      expect(repository.remove).toHaveBeenCalledWith(STUDENT_ID, LISTING_ID);
      expect(state).toEqual({ listingId: LISTING_ID, saved: false });
    });

    it('never checks visibility — an expired listing can still be removed', async () => {
      const repository = makeRepository({ isListingVisible: jest.fn().mockResolvedValue(false) });
      const service = new FavoritesService(repository);

      const state = await service.toggle(STUDENT_ID, LISTING_ID, false);

      expect(repository.isListingVisible).not.toHaveBeenCalled();
      expect(state).toEqual({ listingId: LISTING_ID, saved: false });
    });

    it('is a no-op success when the listing was never saved', async () => {
      const repository = makeRepository();
      const service = new FavoritesService(repository);

      await expect(service.toggle(STUDENT_ID, LISTING_ID, false)).resolves.toEqual({
        listingId: LISTING_ID,
        saved: false,
      });
    });
  });
});
