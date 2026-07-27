import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { CatalogRepository } from '../../catalog/domain/catalog.repository';
import { CatalogGroup } from '../../catalog/domain/entities/catalog-group.entity';
import { SuggestRepository } from '../domain/suggest.repository';
import { Suggestion, SuggestionKind } from '../domain/suggestion.model';
import { SuggestService } from './suggest.service';

function group(key: string, typeKeys: string[]): CatalogGroup {
  return {
    key,
    nameUz: key,
    nameRu: null,
    emoji: null,
    icon: null,
    accentColor: null,
    sortOrder: 1,
    typeKeys,
  };
}

const GROUPS = [group('FOOD', ['NATIONAL_FOOD', 'FAST_FOOD']), group('SPORT', ['GYM', 'TENNIS'])];

function makeCatalog(groups: CatalogGroup[] = GROUPS): CatalogRepository {
  return {
    findBusinessTypes: jest.fn().mockResolvedValue([]),
    findGroups: jest.fn().mockResolvedValue(groups),
    findBusinessTypesByGroups: jest.fn().mockResolvedValue([]),
    groupExists: jest.fn().mockResolvedValue(true),
    countVisibleListingsByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    countCategoriesByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    findCategoriesByType: jest.fn().mockResolvedValue([]),
    findAttributeSpecs: jest.fn().mockResolvedValue([]),
    typeExists: jest.fn().mockResolvedValue(true),
    createType: jest.fn(),
    updateType: jest.fn(),
    deleteType: jest.fn(),
    countBusinessesOfType: jest.fn().mockResolvedValue(0),
    countCategoriesOfType: jest.fn().mockResolvedValue(0),
  };
}

function makeSuggestions(candidates: Suggestion[] = []): SuggestRepository {
  return { findCandidates: jest.fn().mockResolvedValue(candidates) };
}

function suggestion(kind: SuggestionKind, label: string, count: number): Suggestion {
  return {
    kind,
    label,
    typeKey: kind === 'CATEGORY' || kind === 'TYPE' ? 'NATIONAL_FOOD' : null,
    categoryKey: kind === 'CATEGORY' ? label.toUpperCase() : null,
    businessId: kind === 'BUSINESS' ? 'biz_1' : null,
    listingId: kind === 'LISTING' ? 'lst_1' : null,
    count,
  };
}

const REQUEST = { query: 'osh', groupKeys: ['FOOD'], types: [], limit: 8 };

describe('SuggestService', () => {
  it('expands groupKeys into their types before querying', async () => {
    const suggestions = makeSuggestions();
    const service = new SuggestService(makeCatalog(), suggestions);

    await service.suggest(REQUEST);

    expect(suggestions.findCandidates).toHaveBeenCalledWith({
      term: 'osh',
      types: ['NATIONAL_FOOD', 'FAST_FOOD'],
      limit: 8,
    });
  });

  it('narrows the expansion when explicit types are given', async () => {
    const suggestions = makeSuggestions();
    const service = new SuggestService(makeCatalog(), suggestions);

    await service.suggest({ ...REQUEST, types: ['NATIONAL_FOOD'] });

    expect(suggestions.findCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ types: ['NATIONAL_FOOD'] }),
    );
  });

  it('accepts explicit types without a group', async () => {
    const suggestions = makeSuggestions();
    const service = new SuggestService(makeCatalog(), suggestions);

    await service.suggest({ ...REQUEST, groupKeys: [], types: ['GYM'] });

    expect(suggestions.findCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ types: ['GYM'] }),
    );
  });

  it('rejects a request with neither groupKeys nor types (Q3)', async () => {
    const service = new SuggestService(makeCatalog(), makeSuggestions());

    await expect(service.suggest({ ...REQUEST, groupKeys: [], types: [] })).rejects.toMatchObject({
      code: ERROR_CODE.TYPE_REQUIRED,
      status: 422,
    });
  });

  it('rejects an unknown group key', async () => {
    const service = new SuggestService(makeCatalog(), makeSuggestions());

    await expect(service.suggest({ ...REQUEST, groupKeys: ['SPACE'] })).rejects.toMatchObject({
      code: ERROR_CODE.UNKNOWN_GROUP,
      status: 422,
    });
  });

  it('rejects a type the catalog does not know', async () => {
    const service = new SuggestService(makeCatalog(), makeSuggestions());

    await expect(
      service.suggest({ ...REQUEST, groupKeys: [], types: ['SPACESHIPS'] }),
    ).rejects.toMatchObject({ code: ERROR_CODE.UNKNOWN_TYPE, status: 422 });
  });

  it('rejects a known type that is outside the selected groups', async () => {
    const service = new SuggestService(makeCatalog(), makeSuggestions());

    await expect(service.suggest({ ...REQUEST, types: ['TENNIS'] })).rejects.toMatchObject({
      code: ERROR_CODE.TYPE_GROUP_MISMATCH,
      status: 422,
    });
  });

  it('throws AppException (not a bare Error) for an invalid scope', async () => {
    const service = new SuggestService(makeCatalog(), makeSuggestions());

    await expect(service.suggest({ ...REQUEST, groupKeys: [], types: [] })).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('returns nothing for a term shorter than two characters, without querying', async () => {
    const suggestions = makeSuggestions([suggestion('CATEGORY', 'Osh', 5)]);
    const service = new SuggestService(makeCatalog(), suggestions);

    await expect(service.suggest({ ...REQUEST, query: 'o' })).resolves.toEqual([]);
    await expect(service.suggest({ ...REQUEST, query: ' o ' })).resolves.toEqual([]);
    expect(suggestions.findCandidates).not.toHaveBeenCalled();
  });

  it('validates the scope even when the term is too short', async () => {
    const service = new SuggestService(makeCatalog(), makeSuggestions());

    await expect(
      service.suggest({ ...REQUEST, query: 'o', groupKeys: [], types: [] }),
    ).rejects.toMatchObject({ code: ERROR_CODE.TYPE_REQUIRED });
  });

  it('trims the term before passing it on', async () => {
    const suggestions = makeSuggestions();
    const service = new SuggestService(makeCatalog(), suggestions);

    await service.suggest({ ...REQUEST, query: '  osh  ' });

    expect(suggestions.findCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ term: 'osh' }),
    );
  });

  it('orders by kind first, then by count', async () => {
    const service = new SuggestService(
      makeCatalog(),
      makeSuggestions([
        suggestion('LISTING', 'Osh (1 porsiya)', 1),
        suggestion('BUSINESS', 'Besh Qozon', 6),
        suggestion('TYPE', 'Milliy taomlar', 187),
        suggestion('CATEGORY', 'Osh', 54),
        suggestion('CATEGORY', 'Oshxona setlari', 90),
      ]),
    );

    const result = await service.suggest(REQUEST);

    expect(result.map((item) => [item.kind, item.count])).toEqual([
      ['CATEGORY', 90],
      ['CATEGORY', 54],
      ['TYPE', 187],
      ['BUSINESS', 6],
      ['LISTING', 1],
    ]);
  });

  it('never offers a suggestion that would yield no listing', async () => {
    const service = new SuggestService(
      makeCatalog(),
      makeSuggestions([suggestion('CATEGORY', 'Osh', 0), suggestion('CATEGORY', 'Lag‘mon', 3)]),
    );

    const result = await service.suggest(REQUEST);

    expect(result.map((item) => item.label)).toEqual(['Lag‘mon']);
  });

  it('caps the response at the requested limit', async () => {
    const service = new SuggestService(
      makeCatalog(),
      makeSuggestions([
        suggestion('CATEGORY', 'Osh', 54),
        suggestion('TYPE', 'Milliy taomlar', 187),
        suggestion('BUSINESS', 'Besh Qozon', 6),
      ]),
    );

    const result = await service.suggest({ ...REQUEST, limit: 2 });

    expect(result.map((item) => item.kind)).toEqual(['CATEGORY', 'TYPE']);
  });
});
