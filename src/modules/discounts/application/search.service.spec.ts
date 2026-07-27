import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { CatalogRepository } from '../../catalog/domain/catalog.repository';
import { AttributeSpec } from '../../catalog/domain/entities/attribute-spec.entity';
import { CatalogGroup } from '../../catalog/domain/entities/catalog-group.entity';
import { Category } from '../../catalog/domain/entities/category.entity';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import { Gender } from '../../catalog/domain/enums/gender.enum';
import { FacetRepository } from '../domain/facet.repository';
import { ListingFacets } from '../domain/facets.model';
import { MapMarker } from '../domain/map-marker.model';
import { MapMarkerPage, SearchFilter, SearchRepository } from '../domain/search.repository';
import type { SearchQuery } from './search-query.model';
import { SearchService } from './search.service';

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

const FILTER: SearchFilter & { groupKeys: string[] } = {
  groupKeys: ['FOOD'],
  types: [],
  categoryKeys: [],
  includeAllCategory: true,
  includeCustomCategories: true,
  businessIds: [],
  branchIds: [],
  listingIds: [],
  excludeListingIds: [],
  query: null,
  geo: { point: null, bbox: null, regionIds: [], districtIds: [], onlineOnly: false },
  price: { min: null, max: null, basis: 'FINAL', units: [] },
  listingKind: 'ALL',
  discount: { types: [], minPercent: null, maxPercent: null, minSavedAmount: null },
  redemption: { methods: [], hasPromoCode: null, onlyAvailable: false },
  flags: { withImagesOnly: false, favoritesOnly: false, hasDeliveryOnly: false, newOnly: false },
  availability: { openNow: false, openAt: null, validAt: null, endingWithinHours: null },
  attributes: [],
  attributesMatch: 'ALL',
};

function query(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return {
    mode: 'LIST',
    filter: FILTER,
    sort: { by: 'NEWEST', direction: null },
    page: { number: 0, size: 20 },
    studentId: null,
    ...overrides,
  };
}

function withFilter(overrides: Partial<SearchFilter & { groupKeys: string[] }>): SearchQuery {
  return query({ filter: { ...FILTER, ...overrides } });
}

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

function category(key: string, nameUz: string, gender: Gender | null = null): Category {
  return {
    key,
    businessType: 'NATIONAL_FOOD',
    nameUz,
    nameRu: null,
    iconUrl: null,
    sortOrder: 0,
    requiresCustomName: false,
    fields: [],
    gender,
  };
}

function spec(key: string, kind: AttributeFieldType): AttributeSpec {
  return {
    businessType: 'NATIONAL_FOOD',
    key,
    label: key,
    kind,
    required: false,
    suffix: null,
    options: null,
  };
}

function makeCatalog(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    findBusinessTypes: jest.fn().mockResolvedValue([]),
    findGroups: jest
      .fn()
      .mockResolvedValue([
        group('FOOD', ['NATIONAL_FOOD', 'FAST_FOOD']),
        group('SPORT', ['TENNIS']),
      ]),
    findBusinessTypesByGroups: jest.fn().mockResolvedValue([]),
    groupExists: jest.fn().mockResolvedValue(true),
    countVisibleListingsByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    countCategoriesByType: jest.fn().mockResolvedValue(new Map<string, number>()),
    findCategoriesByType: jest.fn().mockResolvedValue([category('PALOV', 'Osh')]),
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

function makeSearch(overrides: Partial<SearchRepository> = {}): SearchRepository {
  return {
    search: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    count: jest.fn().mockResolvedValue(0),
    searchMarkers: jest.fn().mockResolvedValue({ markers: [], total: 0, markersTotal: 0 }),
    ...overrides,
  };
}

function makeFacets(facets: Partial<ListingFacets> = {}): FacetRepository {
  return { findFacets: jest.fn().mockResolvedValue({ ...EMPTY_FACETS, ...facets }) };
}

function makeService(
  parts: {
    search?: SearchRepository;
    facets?: FacetRepository;
    catalog?: CatalogRepository;
  } = {},
): SearchService {
  return new SearchService(
    parts.search ?? makeSearch(),
    parts.facets ?? makeFacets(),
    parts.catalog ?? makeCatalog(),
  );
}

/** Asserts the thrown AppException carries the code and status the spec names (§10). */
async function expectFailure(promise: Promise<unknown>, code: string, status = 422): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppException);
  await promise.catch((error: AppException) => {
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
    expect(Object.keys(error.fields).length).toBeGreaterThan(0);
  });
}

describe('SearchService — type resolution (Q3)', () => {
  it('expands groupKeys into their types before searching', async () => {
    const search = makeSearch();

    await makeService({ search }).search(query());

    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({ types: ['NATIONAL_FOOD', 'FAST_FOOD'] }),
      }),
    );
  });

  it('narrows the expansion when explicit types are given', async () => {
    const search = makeSearch();

    await makeService({ search }).search(withFilter({ types: ['NATIONAL_FOOD'] }));

    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ types: ['NATIONAL_FOOD'] }) }),
    );
  });

  it('accepts explicit types without any group', async () => {
    const search = makeSearch();

    await makeService({ search }).search(withFilter({ groupKeys: [], types: ['TENNIS'] }));

    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({ filter: expect.objectContaining({ types: ['TENNIS'] }) }),
    );
  });

  it('refuses to answer "everything"', async () => {
    await expectFailure(
      makeService().search(withFilter({ groupKeys: [], types: [] })),
      ERROR_CODE.TYPE_REQUIRED,
    );
  });

  it('caps groups at three, but never the types they expand to (D1)', async () => {
    await expectFailure(
      makeService().search(withFilter({ groupKeys: ['A', 'B', 'C', 'D'] })),
      ERROR_CODE.TOO_MANY_GROUPS,
    );
  });

  it('caps explicit types at ten', async () => {
    const types = Array.from({ length: 11 }, (_, index) => `T${index}`);

    await expectFailure(makeService().search(withFilter({ types })), ERROR_CODE.TOO_MANY_TYPES);
  });

  it('rejects a group the catalog does not know', async () => {
    await expectFailure(
      makeService().search(withFilter({ groupKeys: ['GHOST'] })),
      ERROR_CODE.UNKNOWN_GROUP,
    );
  });

  it('rejects a type the catalog does not know', async () => {
    await expectFailure(
      makeService().search(withFilter({ groupKeys: [], types: ['GHOST'] })),
      ERROR_CODE.UNKNOWN_TYPE,
    );
  });

  it('rejects a known type that sits outside the chosen groups', async () => {
    await expectFailure(
      makeService().search(withFilter({ groupKeys: ['FOOD'], types: ['TENNIS'] })),
      ERROR_CODE.TYPE_GROUP_MISMATCH,
    );
  });

  it('rejects a category that belongs to no selected type', async () => {
    await expectFailure(
      makeService().search(withFilter({ categoryKeys: ['PALOV', 'GHOST'] })),
      ERROR_CODE.UNKNOWN_CATEGORY,
    );
  });
});

describe('SearchService — request limits (§10)', () => {
  it('rejects a page larger than fifty', async () => {
    await expectFailure(
      makeService().search(query({ page: { number: 0, size: 51 } })),
      ERROR_CODE.PAGE_SIZE_EXCEEDED,
    );
  });

  it('rejects an inverted price range', async () => {
    await expectFailure(
      makeService().search(withFilter({ price: { min: 100, max: 10, basis: 'FINAL', units: [] } })),
      ERROR_CODE.INVALID_PRICE_RANGE,
    );
  });

  it('rejects sorting by distance without coordinates', async () => {
    await expectFailure(
      makeService().search(query({ sort: { by: 'DISTANCE', direction: null } })),
      ERROR_CODE.GEO_REQUIRED_FOR_SORT,
    );
  });

  it('allows the distance sort once coordinates are present', async () => {
    const geo = {
      point: { lat: 41.3, lng: 69.2, radiusMeters: 5000 },
      bbox: null,
      regionIds: [],
      districtIds: [],
      onlineOnly: false,
    };
    const request = { ...withFilter({ geo }), sort: { by: 'DISTANCE' as const, direction: null } };

    await expect(makeService().search(request)).resolves.toBeDefined();
  });

  it('requires a student token for a favourites-only feed', async () => {
    const request = withFilter({
      flags: { withImagesOnly: false, favoritesOnly: true, hasDeliveryOnly: false, newOnly: false },
    });

    await expect(makeService().search(request)).rejects.toMatchObject({
      code: ERROR_CODE.UNAUTHORIZED,
      status: 401,
    });
  });
});

describe('SearchService — attribute filters (§5)', () => {
  const catalog = () =>
    makeCatalog({
      findAttributeSpecs: jest
        .fn()
        .mockResolvedValue([
          spec('portionGrams', AttributeFieldType.NUMBER),
          spec('games', AttributeFieldType.TAGS),
        ]),
    });

  function attribute(overrides: Partial<SearchFilter['attributes'][number]>) {
    return {
      key: 'portionGrams',
      op: 'GTE' as const,
      text: null,
      number: 100,
      boolean: null,
      values: [],
      min: null,
      max: null,
      ...overrides,
    };
  }

  it('passes an operator the catalog allows for that kind', async () => {
    const search = makeSearch();

    await makeService({ search, catalog: catalog() }).search(
      withFilter({ attributes: [attribute({})] }),
    );

    expect(search.search).toHaveBeenCalled();
  });

  it('rejects an attribute key no selected type declares', async () => {
    await expectFailure(
      makeService({ catalog: catalog() }).search(
        withFilter({ attributes: [attribute({ key: 'ghost' })] }),
      ),
      ERROR_CODE.UNKNOWN_ATTRIBUTE,
    );
  });

  it('rejects an operator the attribute kind forbids', async () => {
    await expectFailure(
      makeService({ catalog: catalog() }).search(
        withFilter({ attributes: [attribute({ key: 'games', op: 'BETWEEN', min: 1, max: 2 })] }),
      ),
      ERROR_CODE.ATTRIBUTE_OP_MISMATCH,
    );
  });

  it('lets the technical keys through without a catalog entry (D18)', async () => {
    const search = makeSearch();

    await makeService({ search, catalog: catalog() }).search(
      withFilter({
        attributes: [attribute({ key: '_gender', op: 'EQ', number: null, text: 'MALE' })],
      }),
    );

    expect(search.search).toHaveBeenCalled();
  });

  it('rejects an operator that arrived without its operand', async () => {
    await expectFailure(
      makeService({ catalog: catalog() }).search(
        withFilter({ attributes: [attribute({ key: 'games', op: 'ANY', values: [] })] }),
      ),
      ERROR_CODE.VALIDATION_ERROR,
    );
  });
});

describe('SearchService — availability (§4)', () => {
  const OPEN_NOW: SearchFilter['availability'] = {
    openNow: true,
    openAt: null,
    validAt: null,
    endingWithinHours: null,
  };

  it('hands the availability block to the LIST query untouched', async () => {
    const search = makeSearch();

    await makeService({ search }).search(withFilter({ availability: OPEN_NOW }));

    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({ availability: OPEN_NOW }),
        now: expect.any(Date),
      }),
    );
  });

  it('gives COUNT the instant openNow asks about, so its total still matches LIST', async () => {
    const search = makeSearch();

    await makeService({ search }).search({
      ...withFilter({ availability: OPEN_NOW }),
      mode: 'COUNT',
    });

    expect(search.count).toHaveBeenCalledWith(
      expect.objectContaining({ availability: OPEN_NOW }),
      null,
      expect.any(Date),
    );
  });

  it('gives MAP that instant too, so a pin and a card never disagree on "open"', async () => {
    const search = makeSearch();
    const geo = {
      ...FILTER.geo,
      bbox: { minLat: 41.28, minLng: 69.2, maxLat: 41.35, maxLng: 69.31 },
    };

    await makeService({ search }).search({
      ...withFilter({ availability: OPEN_NOW, geo }),
      mode: 'MAP',
    });

    expect(search.searchMarkers).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({ availability: OPEN_NOW }),
        now: expect.any(Date),
      }),
    );
  });
});

describe('SearchService — LIST (§8.1)', () => {
  it('returns exactly the pagination envelope, with nothing extra (D3)', async () => {
    const search = makeSearch({ search: jest.fn().mockResolvedValue({ items: [], total: 137 }) });

    const result = await makeService({ search }).search(query({ page: { number: 2, size: 20 } }));

    expect(Object.keys(result).sort()).toEqual(
      ['hasNext', 'items', 'mode', 'page', 'size', 'total'].sort(),
    );
    expect(result).toMatchObject({ mode: 'LIST', page: 2, size: 20, total: 137, hasNext: true });
  });

  it('reports no next page on the last one', async () => {
    const search = makeSearch({ search: jest.fn().mockResolvedValue({ items: [], total: 40 }) });

    const result = await makeService({ search }).search(query({ page: { number: 1, size: 20 } }));

    expect(result).toMatchObject({ hasNext: false });
  });

  it.each([
    ['DISTANCE', 'ASC'],
    ['PRICE_FINAL', 'ASC'],
    ['ENDING_SOON', 'ASC'],
    ['NEWEST', 'DESC'],
    ['POPULAR', 'DESC'],
    ['DISCOUNT_PERCENT', 'DESC'],
  ] as const)('defaults %s to %s', async (by, direction) => {
    const search = makeSearch();
    const geo = {
      point: { lat: 41.3, lng: 69.2, radiusMeters: 5000 },
      bbox: null,
      regionIds: [],
      districtIds: [],
      onlineOnly: false,
    };

    await makeService({ search }).search({
      ...withFilter({ geo }),
      sort: { by, direction: null },
    });

    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({ sort: { by, direction } }),
    );
  });

  it('keeps an explicit direction', async () => {
    const search = makeSearch();

    await makeService({ search }).search(query({ sort: { by: 'NEWEST', direction: 'ASC' } }));

    expect(search.search).toHaveBeenCalledWith(
      expect.objectContaining({ sort: { by: 'NEWEST', direction: 'ASC' } }),
    );
  });

  it('passes the student id through for personalisation (D5)', async () => {
    const search = makeSearch();

    await makeService({ search }).search(query({ studentId: 'stu_1' }));

    expect(search.search).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'stu_1' }));
  });
});

describe('SearchService — COUNT (§8.3)', () => {
  it('counts through the search port so the total matches LIST (§12.15)', async () => {
    const search = makeSearch({ count: jest.fn().mockResolvedValue(137) });
    const facets = makeFacets({ total: 999 });

    const result = await makeService({ search, facets }).search(query({ mode: 'COUNT' }));

    expect(result).toMatchObject({ mode: 'COUNT', total: 137 });
    expect(search.search).not.toHaveBeenCalled();
  });

  it('scopes the facets by type, category and location', async () => {
    const facets = makeFacets();
    const geo = {
      point: { lat: 41.3, lng: 69.2, radiusMeters: 3000 },
      bbox: null,
      regionIds: [],
      districtIds: [],
      onlineOnly: false,
    };

    await makeService({ facets }).search({
      ...withFilter({ categoryKeys: ['PALOV'], geo }),
      mode: 'COUNT',
    });

    expect(facets.findFacets).toHaveBeenCalledWith({
      types: ['NATIONAL_FOOD', 'FAST_FOOD'],
      categoryKeys: ['PALOV'],
      geo: { lat: 41.3, lng: 69.2, radiusMeters: 3000 },
    });
  });

  it('labels categories from the catalog and rolls them up per type', async () => {
    const facets = makeFacets({ categories: [{ key: 'PALOV', count: 54 }] });

    const result = await makeService({ facets }).search(query({ mode: 'COUNT' }));

    expect(result).toMatchObject({
      facets: expect.objectContaining({
        byCategory: [{ key: 'PALOV', label: 'Osh', count: 54 }],
        byType: [{ key: 'NATIONAL_FOOD', count: 54 }],
      }),
    });
  });

  it('splits DISCOUNT and REGULAR so the two sum to the facet scope', async () => {
    const facets = makeFacets({ listingKind: { discount: 88, regular: 49 } });

    const result = await makeService({ facets }).search(query({ mode: 'COUNT' }));

    expect(result).toMatchObject({
      facets: expect.objectContaining({
        byListingKind: [
          { key: 'DISCOUNT', count: 88 },
          { key: 'REGULAR', count: 49 },
        ],
      }),
    });
  });

  it('groups attribute buckets by key', async () => {
    const facets = makeFacets({
      attributes: [
        { key: 'hallType', value: 'VIP', count: 22 },
        { key: 'hallType', value: 'STANDARD', count: 8 },
        { key: 'isHalal', value: 'true', count: 30 },
      ],
    });

    const result = await makeService({ facets }).search(query({ mode: 'COUNT' }));

    expect(result).toMatchObject({
      facets: expect.objectContaining({
        byAttribute: {
          hallType: [
            { value: 'VIP', count: 22 },
            { value: 'STANDARD', count: 8 },
          ],
          isHalal: [{ value: 'true', count: 30 }],
        },
      }),
    });
  });

  it('reports the discount range under the keys the client reads', async () => {
    const facets = makeFacets({ discountPercentRange: { min: 5, max: 70 } });

    const result = await makeService({ facets }).search(query({ mode: 'COUNT' }));

    expect(result).toMatchObject({
      facets: expect.objectContaining({ discountRange: { minPercent: 5, maxPercent: 70 } }),
    });
  });
});

describe('SearchService — MAP (§8.2)', () => {
  const BBOX = { minLat: 41.28, minLng: 69.2, maxLat: 41.35, maxLng: 69.31 };
  const POINT = { lat: 41.31, lng: 69.24, radiusMeters: 3000 };

  function marker(overrides: Partial<MapMarker> = {}): MapMarker {
    return {
      listingId: 'lst_1',
      branchId: 'br_1',
      lat: 41.3,
      lng: 69.24,
      priceLabel: '21k',
      finalPrice: 21000,
      discountBadge: '−30%',
      businessType: 'NATIONAL_FOOD',
      accentColor: '#EA580C',
      isDiscount: true,
      isFavorite: false,
      discountPercent: 30,
      ...overrides,
    };
  }

  /** A MAP request over the viewport; `geo` is mandatory in this mode, so it is always set. */
  function mapQuery(overrides: Partial<SearchQuery> = {}): SearchQuery {
    return {
      ...withFilter({ geo: { ...FILTER.geo, bbox: BBOX } }),
      mode: 'MAP',
      ...overrides,
    };
  }

  function makeMap(page: Partial<MapMarkerPage>): SearchRepository {
    return makeSearch({
      searchMarkers: jest
        .fn()
        .mockResolvedValue({ markers: [], total: 0, markersTotal: 0, ...page }),
    });
  }

  it('answers with the marker envelope the spec names', async () => {
    const markers = [marker(), marker({ branchId: 'br_2', lat: 41.34, lng: 69.29 })];
    const search = makeMap({ markers, total: 1, markersTotal: 2 });

    const result = await makeService({ search }).search(mapQuery());

    expect(Object.keys(result).sort()).toEqual(
      ['bounds', 'clusters', 'markers', 'markersTotal', 'mode', 'total', 'truncated'].sort(),
    );
    expect(result).toMatchObject({ mode: 'MAP', total: 1, markersTotal: 2, truncated: false });
  });

  it('counts listings in `total` and markers in `markersTotal` (D15)', async () => {
    const markers = [marker(), marker({ branchId: 'br_2' }), marker({ branchId: 'br_3' })];
    const search = makeMap({ markers, total: 1, markersTotal: 3 });

    const result = await makeService({ search }).search(mapQuery());

    // One listing across three branches: three pins, one offer.
    expect(result).toMatchObject({ total: 1, markersTotal: 3 });
    expect((result as Extract<typeof result, { mode: 'MAP' }>).markers).toHaveLength(3);
  });

  it('reports the extent of what it returns', async () => {
    const markers = [
      marker({ lat: 41.29, lng: 69.21 }),
      marker({ branchId: 'br_2', lat: 41.34, lng: 69.3 }),
    ];
    const search = makeMap({ markers, total: 2, markersTotal: 2 });

    const result = await makeService({ search }).search(mapQuery());

    expect(result).toMatchObject({
      bounds: { minLat: 41.29, minLng: 69.21, maxLat: 41.34, maxLng: 69.3 },
    });
  });

  it('has no bounds to report when the viewport is empty', async () => {
    const result = await makeService({ search: makeMap({}) }).search(mapQuery());

    expect(result).toMatchObject({ bounds: null, markers: [], clusters: [], truncated: false });
  });

  it('applies no sort — a map has no order to read', async () => {
    const search = makeMap({});

    await makeService({ search }).search(mapQuery({ sort: { by: 'POPULAR', direction: null } }));

    expect(search.searchMarkers).toHaveBeenCalledWith(
      expect.not.objectContaining({ sort: expect.anything() }),
    );
  });

  it('demands a viewport: neither bbox nor point is a 422 (§10)', async () => {
    await expectFailure(makeService().search({ ...query(), mode: 'MAP' }), ERROR_CODE.GEO_REQUIRED);
  });

  it('accepts a radius instead of a box', async () => {
    const search = makeMap({});

    await makeService({ search }).search({
      ...withFilter({ geo: { ...FILTER.geo, point: POINT } }),
      mode: 'MAP',
    });

    expect(search.searchMarkers).toHaveBeenCalled();
  });

  it.each([
    ['inverted latitudes', { ...BBOX, minLat: 41.4 }],
    ['inverted longitudes', { ...BBOX, minLng: 69.4 }],
    ['a box outside Uzbekistan', { minLat: 48, minLng: 80, maxLat: 49, maxLng: 81 }],
  ])('rejects %s', async (_case, bbox) => {
    await expectFailure(
      makeService().search(mapQuery({ filter: { ...FILTER, geo: { ...FILTER.geo, bbox } } })),
      ERROR_CODE.INVALID_BBOX,
    );
  });

  it('rejects a bbox in LIST mode too — a filter it carries is a filter it honours', async () => {
    await expectFailure(
      makeService().search(withFilter({ geo: { ...FILTER.geo, bbox: { ...BBOX, minLat: 41.4 } } })),
      ERROR_CODE.INVALID_BBOX,
    );
  });

  it('caps the markers a single read may ask for (§10)', async () => {
    await expectFailure(
      makeService().search(mapQuery({ map: { zoom: 13, clusterize: false, maxMarkers: 2001 } })),
      ERROR_CODE.PAGE_SIZE_EXCEEDED,
    );
  });

  it('cuts to maxMarkers and says so, rather than truncating silently', async () => {
    const markers = Array.from({ length: 2 }, (_, index) => marker({ branchId: `br_${index}` }));
    const search = makeMap({ markers, total: 90, markersTotal: 120 });

    const result = await makeService({ search }).search(
      mapQuery({ map: { zoom: 13, clusterize: false, maxMarkers: 2 } }),
    );

    expect(search.searchMarkers).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }));
    expect(result).toMatchObject({ truncated: true, clusters: [] });
  });

  it('folds nearby markers into clusters once the viewport overflows', async () => {
    // Two markers metres apart, one across town: the near pair collapses, the far one stays.
    const markers = [
      marker({ branchId: 'br_1', lat: 41.3, lng: 69.24, finalPrice: 21000, discountPercent: 30 }),
      marker({ branchId: 'br_2', lat: 41.3001, lng: 69.2401, finalPrice: 15000 }),
      marker({ branchId: 'br_3', lat: 41.34, lng: 69.31 }),
    ];
    const search = makeMap({ markers, total: 3, markersTotal: 3000 });

    const result = await makeService({ search }).search(
      mapQuery({ map: { zoom: 13, clusterize: true, maxMarkers: 500 } }),
    );
    const map = result as Extract<typeof result, { mode: 'MAP' }>;

    expect(map.markers).toHaveLength(1);
    expect(map.clusters).toEqual([
      expect.objectContaining({ count: 2, minPrice: 15000, maxDiscountPercent: 30 }),
    ]);
    expect(map.truncated).toBe(true);
  });

  it('scans up to the hard ceiling when clustering, so cluster counts are not capped early', async () => {
    const search = makeMap({});

    await makeService({ search }).search(
      mapQuery({ map: { zoom: 13, clusterize: true, maxMarkers: 500 } }),
    );

    expect(search.searchMarkers).toHaveBeenCalledWith(expect.objectContaining({ limit: 2000 }));
  });

  it('leaves the markers alone while they still fit', async () => {
    const markers = [marker(), marker({ branchId: 'br_2', lat: 41.3001, lng: 69.2401 })];
    const search = makeMap({ markers, total: 2, markersTotal: 2 });

    const result = await makeService({ search }).search(
      mapQuery({ map: { zoom: 13, clusterize: true, maxMarkers: 500 } }),
    );

    expect(result).toMatchObject({ clusters: [], truncated: false });
    expect((result as Extract<typeof result, { mode: 'MAP' }>).markers).toHaveLength(2);
  });

  it('keeps regular listings on the map (Q0)', async () => {
    const regular = marker({ isDiscount: false, discountBadge: null, discountPercent: null });
    const search = makeMap({ markers: [regular], total: 1, markersTotal: 1 });

    const result = await makeService({ search }).search(mapQuery());

    expect((result as Extract<typeof result, { mode: 'MAP' }>).markers).toEqual([
      expect.objectContaining({ isDiscount: false, discountBadge: null }),
    ]);
  });
});
