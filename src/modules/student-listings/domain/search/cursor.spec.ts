import { ERROR_CODE } from '../../../../common/errors/error-code';
import { StudentListingKind } from '../enums/student-listing-kind.enum';
import { decodeCursor, encodeCursor, filterHashOf } from './cursor';
import { EMPTY_KIND_FILTER, ListingSort, type SearchCriteria } from './search-criteria';

function criteria(overrides: Partial<SearchCriteria> = {}): SearchCriteria {
  return {
    kind: StudentListingKind.RENTAL,
    query: null,
    geo: null,
    minPrice: null,
    maxPrice: null,
    filter: { ...EMPTY_KIND_FILTER },
    sort: ListingSort.NEWEST,
    size: 20,
    cursor: null,
    page: null,
    viewerId: 'usr_1',
    ...overrides,
  };
}

describe('search cursor', () => {
  describe('filterHashOf', () => {
    it('is stable for the same criteria', () => {
      expect(filterHashOf(criteria())).toBe(filterHashOf(criteria()));
    });

    it('ignores the page position, which is what the cursor itself carries', () => {
      expect(filterHashOf(criteria({ cursor: 'abc', size: 50 }))).toBe(filterHashOf(criteria()));
    });

    it('changes when the sort changes', () => {
      expect(filterHashOf(criteria({ sort: ListingSort.PRICE_ASC }))).not.toBe(
        filterHashOf(criteria()),
      );
    });

    it('changes when the kind changes', () => {
      expect(filterHashOf(criteria({ kind: StudentListingKind.JOB }))).not.toBe(
        filterHashOf(criteria()),
      );
    });

    it('changes when a filter changes', () => {
      const filtered = criteria({ filter: { ...EMPTY_KIND_FILTER, minRooms: 2 } });
      expect(filterHashOf(filtered)).not.toBe(filterHashOf(criteria()));
    });

    it('changes when the price range changes', () => {
      expect(filterHashOf(criteria({ maxPrice: 2_000_000 }))).not.toBe(filterHashOf(criteria()));
    });

    it('changes when the geo filter changes', () => {
      const geo = criteria({
        geo: {
          lat: 41.31,
          lng: 69.24,
          radiusMeters: 5000,
          regionIds: [],
          districtIds: [],
          bbox: null,
        },
      });
      expect(filterHashOf(geo)).not.toBe(filterHashOf(criteria()));
    });
  });

  describe('round trip', () => {
    it('restores the sort value and id', () => {
      const token = encodeCursor({ sortValue: '2026-08-03T00:00:00.000Z', id: 'lst_9' }, 'hash-1');
      expect(decodeCursor(token, 'hash-1')).toEqual({
        sortValue: '2026-08-03T00:00:00.000Z',
        id: 'lst_9',
      });
    });

    it('carries a numeric sort value without turning it into a string', () => {
      const token = encodeCursor({ sortValue: 1_500_000, id: 'lst_9' }, 'hash-1');
      expect(decodeCursor(token, 'hash-1')).toEqual({ sortValue: 1_500_000, id: 'lst_9' });
    });

    it('carries a null sort value', () => {
      const token = encodeCursor({ sortValue: null, id: 'lst_9' }, 'hash-1');
      expect(decodeCursor(token, 'hash-1')).toEqual({ sortValue: null, id: 'lst_9' });
    });
  });

  describe('rejection', () => {
    it('rejects a cursor whose filter hash no longer matches', () => {
      // The user changed a filter mid-scroll: the position is meaningless against the new query,
      // so the app is told to restart from the first page (§7.2.2).
      const token = encodeCursor({ sortValue: 1, id: 'lst_9' }, 'hash-1');
      expect(() => decodeCursor(token, 'hash-2')).toThrow(
        expect.objectContaining({ code: ERROR_CODE.PAGE_CURSOR_INVALID, status: 422 }),
      );
    });

    it.each([
      ['not base64', '!!!!'],
      ['base64 of nonsense', Buffer.from('hello').toString('base64url')],
      ['base64 of JSON missing fields', Buffer.from('{"x":1}').toString('base64url')],
      ['empty', ''],
    ])('rejects a cursor that is %s', (_label, token) => {
      expect(() => decodeCursor(token, 'hash-1')).toThrow(
        expect.objectContaining({ code: ERROR_CODE.PAGE_CURSOR_INVALID }),
      );
    });
  });
});
