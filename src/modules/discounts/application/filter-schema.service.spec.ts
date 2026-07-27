import { AppException } from '../../../common/exceptions/app.exception';
import { CatalogRepository } from '../../catalog/domain/catalog.repository';
import { CatalogGroup } from '../../catalog/domain/entities/catalog-group.entity';
import { FacetRepository } from '../domain/facet.repository';
import { ListingFacets } from '../domain/facets.model';
import { FilterSchemaService } from './filter-schema.service';

const EMPTY_FACETS: ListingFacets = {
  total: 0,
  categories: [],
  attributes: [],
  priceUnits: [],
  priceRange: null,
  discountTypes: [],
  discountPercentRange: null,
  redemptionMethods: [],
  listingKind: { discount: 0, regular: 0 },
  regions: [],
  districts: [],
  tradeCenters: [],
};

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

function makeCatalog(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    findBusinessTypes: jest.fn().mockResolvedValue([]),
    findGroups: jest.fn().mockResolvedValue([group('FOOD', ['NATIONAL_FOOD', 'FAST_FOOD'])]),
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
    ...overrides,
  };
}

function makeFacets(facets: Partial<ListingFacets> = {}): FacetRepository {
  return { findFacets: jest.fn().mockResolvedValue({ ...EMPTY_FACETS, ...facets }) };
}

const QUERY = { groupKeys: ['FOOD'], types: [], categoryKeys: [], geo: null };

describe('FilterSchemaService', () => {
  it('expands groupKeys into their types before querying facets', async () => {
    const facets = makeFacets();
    const service = new FilterSchemaService(makeCatalog(), facets);

    await service.getSchema(QUERY);

    expect(facets.findFacets).toHaveBeenCalledWith(
      expect.objectContaining({ types: ['NATIONAL_FOOD', 'FAST_FOOD'] }),
    );
  });

  it('narrows the expansion when explicit types are given', async () => {
    const facets = makeFacets();
    const service = new FilterSchemaService(makeCatalog(), facets);

    await service.getSchema({ ...QUERY, types: ['NATIONAL_FOOD'] });

    expect(facets.findFacets).toHaveBeenCalledWith(
      expect.objectContaining({ types: ['NATIONAL_FOOD'] }),
    );
  });

  it('rejects a type that is not in the selected groups', async () => {
    const service = new FilterSchemaService(makeCatalog(), makeFacets());

    await expect(service.getSchema({ ...QUERY, types: ['TENNIS'] })).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('rejects an unknown group key', async () => {
    const service = new FilterSchemaService(
      makeCatalog({ findGroups: jest.fn().mockResolvedValue([]) }),
      makeFacets(),
    );

    await expect(service.getSchema(QUERY)).rejects.toBeInstanceOf(AppException);
  });

  it('reports listingKind buckets that sum to the total', async () => {
    const service = new FilterSchemaService(
      makeCatalog(),
      makeFacets({ total: 12, listingKind: { discount: 8, regular: 4 } }),
    );

    const schema = await service.getSchema(QUERY);

    expect(schema.total).toBe(12);
    expect(schema.listingKind).toEqual([
      { key: 'ALL', count: 12 },
      { key: 'DISCOUNT', count: 8 },
      { key: 'REGULAR', count: 4 },
    ]);
  });

  it('passes the geo scope straight through to the facet query', async () => {
    const facets = makeFacets();
    const service = new FilterSchemaService(makeCatalog(), facets);

    await service.getSchema({ ...QUERY, geo: { lat: 41.31, lng: 69.27, radiusMeters: 5000 } });

    expect(facets.findFacets).toHaveBeenCalledWith(
      expect.objectContaining({ geo: { lat: 41.31, lng: 69.27, radiusMeters: 5000 } }),
    );
  });

  it('drops a facet category the catalog does not know', async () => {
    const service = new FilterSchemaService(
      makeCatalog({
        findCategoriesByType: jest.fn().mockResolvedValue([
          {
            key: 'PALOV',
            businessType: 'NATIONAL_FOOD',
            nameUz: 'Osh',
            nameRu: null,
            iconUrl: null,
            sortOrder: 0,
            requiresCustomName: false,
            fields: [],
            gender: null,
          },
        ]),
      }),
      makeFacets({
        categories: [
          { key: 'PALOV', count: 5 },
          { key: 'GHOST', count: 2 },
        ],
      }),
    );

    const schema = await service.getSchema(QUERY);

    expect(schema.categories).toEqual([
      { key: 'PALOV', label: 'Osh', typeKey: 'NATIONAL_FOOD', count: 5 },
    ]);
  });

  it('always offers the sorts, marking the one that needs coordinates', async () => {
    const service = new FilterSchemaService(makeCatalog(), makeFacets());

    const schema = await service.getSchema(QUERY);

    expect(schema.sorts.find((sort) => sort.key === 'DISTANCE')?.requiresGeo).toBe(true);
    expect(schema.sorts.map((sort) => sort.key)).toContain('DISCOUNT_PERCENT');
  });
});
