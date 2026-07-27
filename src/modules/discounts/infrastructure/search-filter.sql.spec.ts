import type { SearchFilter, SortBy } from '../domain/search.repository';
import {
  countQuery,
  hasSearchableText,
  searchOrderBy,
  searchWhere,
  type SynonymPair,
} from './search-filter.sql';

const BASE: SearchFilter = {
  types: ['NATIONAL_FOOD'],
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
  flags: {
    withImagesOnly: false,
    favoritesOnly: false,
    hasDeliveryOnly: false,
    newOnly: false,
  },
  attributes: [],
  attributesMatch: 'ALL',
};

function filter(overrides: Partial<SearchFilter> = {}): SearchFilter {
  return { ...BASE, ...overrides };
}

function attribute(overrides: Partial<SearchFilter['attributes'][number]>) {
  return {
    key: 'k',
    op: 'EXISTS' as const,
    text: null,
    number: null,
    boolean: null,
    values: [],
    min: null,
    max: null,
    ...overrides,
  };
}

const ALL_SORTS: SortBy[] = [
  'DISTANCE',
  'DISCOUNT_PERCENT',
  'PRICE_FINAL',
  'PRICE_ORIGINAL',
  'SAVED_AMOUNT',
  'NEWEST',
  'ENDING_SOON',
  'POPULAR',
  'RELEVANCE',
];

describe('searchOrderBy', () => {
  it.each(ALL_SORTS)('ends %s with the id tie-break so pages cannot repeat rows', (by) => {
    expect(searchOrderBy(by, 'DESC', 'osh').text.trimEnd()).toMatch(/, l\.id ASC$/);
  });

  it('keeps regular listings last instead of dropping them from a discount sort', () => {
    expect(searchOrderBy('DISCOUNT_PERCENT', 'DESC', null).text).toContain(
      'l.discount_percent DESC NULLS LAST',
    );
    expect(searchOrderBy('SAVED_AMOUNT', 'DESC', null).text).toContain('NULLS LAST');
  });

  it('sorts unlocated listings last under DISTANCE', () => {
    expect(searchOrderBy('DISTANCE', 'ASC', null).text).toContain(
      'nb.branch_distance_meters ASC NULLS LAST',
    );
  });

  it('falls back to NEWEST when RELEVANCE has no query to rank against', () => {
    expect(searchOrderBy('RELEVANCE', 'DESC', null).text).toContain('l.created_at DESC');
    expect(searchOrderBy('RELEVANCE', 'DESC', 'osh').text).toContain('ts_rank(l.search_vector');
  });

  it('honours the requested direction', () => {
    expect(searchOrderBy('PRICE_FINAL', 'ASC', null).text).toContain('l.final_price ASC');
    expect(searchOrderBy('PRICE_FINAL', 'DESC', null).text).toContain('l.final_price DESC');
  });
});

describe('searchWhere', () => {
  it('always applies the visibility rules and the type scope (Q4, Q3)', () => {
    const where = searchWhere(filter(), null, []);

    expect(where.text).toContain("l.status = 'ACTIVE'");
    expect(where.text).toContain("b.status = 'APPROVED'");
    expect(where.text).toContain('l.valid_from <= now()');
    expect(where.text).toContain('b.type IN');
    expect(where.values).toContain('NATIONAL_FOOD');
  });

  it('matches nothing, and stays valid SQL, when a group expands to no type', () => {
    const where = searchWhere(filter({ types: [] }), null, []);

    expect(where.text).toContain('false');
    expect(where.text).not.toContain('b.type IN ()');
  });

  it('lets an ALL-category listing answer a category request', () => {
    const where = searchWhere(filter({ categoryKeys: ['PALOV'] }), null, []);

    expect(where.text).toContain("l.category_key IN ($2) OR l.category_key = 'ALL'");
  });

  it('excludes ALL-category listings when the client opts out', () => {
    const where = searchWhere(
      filter({ categoryKeys: ['PALOV'], includeAllCategory: false }),
      null,
      [],
    );

    expect(where.text).toContain("l.category_key <> 'ALL'");
    expect(where.text).not.toContain("OR l.category_key = 'ALL'");
  });

  it('matches text through the search vector or a synonym category', () => {
    const synonyms: SynonymPair[] = [{ businessType: 'NATIONAL_FOOD', categoryKey: 'PALOV' }];
    const where = searchWhere(filter({ query: 'osh' }), null, synonyms);

    expect(where.text).toContain('l.search_vector @@ to_tsquery');
    expect(where.text).toContain('(b.type, l.category_key) IN');
    // The raw query only ever travels as a bind parameter.
    expect(where.values).toContain('osh');
    expect(where.text).not.toContain('osh');
  });

  it('counts a multi-branch listing once when filtering by radius', () => {
    const where = searchWhere(
      filter({ geo: { ...BASE.geo, point: { lat: 41.3, lng: 69.2, radiusMeters: 5000 } } }),
      null,
      [],
    );

    expect(where.text).toContain('EXISTS');
    expect(where.text).toContain('ST_DWithin');
    expect(where.values).toEqual(expect.arrayContaining([41.3, 69.2, 5000]));
  });

  it('narrows every mode by the viewport, and counts a multi-branch listing once', () => {
    const bbox = { minLat: 41.28, minLng: 69.2, maxLat: 41.35, maxLng: 69.31 };
    const where = searchWhere(filter({ geo: { ...BASE.geo, bbox } }), null, []);

    expect(where.text).toContain('EXISTS');
    expect(where.text).toContain('ST_MakeEnvelope');
    // lng before lat: ST_MakeEnvelope takes x/y, not lat/lng.
    expect(where.values).toEqual(expect.arrayContaining([69.2, 41.28, 69.31, 41.35]));
  });

  it('compares prices against the requested basis', () => {
    expect(searchWhere(filter({ price: { ...BASE.price, min: 1000 } }), null, []).text).toContain(
      'l.final_price >= ',
    );
    expect(
      searchWhere(filter({ price: { ...BASE.price, max: 1000, basis: 'ORIGINAL' } }), null, [])
        .text,
    ).toContain('l.original_price <= ');
  });

  it('maps listingKind onto the denormalised discount flag', () => {
    expect(searchWhere(filter({ listingKind: 'REGULAR' }), null, []).text).toContain(
      'l.is_discount = false',
    );
    expect(searchWhere(filter({ listingKind: 'DISCOUNT' }), null, []).text).toContain(
      'l.is_discount = true',
    );
    expect(searchWhere(filter({ listingKind: 'ALL' }), null, []).text).not.toContain(
      'l.is_discount =',
    );
  });

  it('reads hasDeliveryOnly from the listing attribute, not the branch (D12)', () => {
    const where = searchWhere(
      filter({ flags: { ...BASE.flags, hasDeliveryOnly: true } }),
      null,
      [],
    );

    expect(where.text).toContain("l.attributes->>'hasDelivery' = 'true'");
    expect(where.text).not.toContain('delivery_zone');
  });

  it('matches nothing rather than everything when favoritesOnly arrives without a student', () => {
    const favorites = { ...BASE.flags, favoritesOnly: true };

    expect(searchWhere(filter({ flags: favorites }), null, []).text).toContain('false');
    expect(searchWhere(filter({ flags: favorites }), 'stu_1', []).values).toContain('stu_1');
  });
});

describe('attribute conditions', () => {
  function conditionFor(overrides: Partial<SearchFilter['attributes'][number]>) {
    return searchWhere(filter({ attributes: [attribute(overrides)] }), null, []);
  }

  it('guards a numeric comparison so a non-numeric value cannot raise', () => {
    const where = conditionFor({ key: 'portionGrams', op: 'GTE', number: 100 });

    expect(where.text).toContain('CASE WHEN');
    expect(where.text).toContain('::numeric');
    expect(where.text).toContain('~ ');
  });

  it('builds BETWEEN from whichever bound arrived', () => {
    expect(conditionFor({ op: 'BETWEEN', min: 30, max: null }).values).toContain(30);
    expect(conditionFor({ op: 'BETWEEN', min: null, max: 120 }).values).toContain(120);
  });

  it('compares booleans against the stored "true"/"false" text', () => {
    expect(conditionFor({ key: 'isHalal', op: 'EQ', boolean: true }).values).toContain('true');
  });

  it('normalises both sides of CONTAINS', () => {
    const where = conditionFor({ key: 'brand', op: 'CONTAINS', text: 'zara' });

    expect(where.text).toContain('position(uz_normalize(');
    expect(where.values).toContain('zara');
  });

  it('splits comma-joined TAGS for ANY and ALL (D10)', () => {
    const any = conditionFor({ key: 'games', op: 'ANY', values: ['CS2', 'Dota 2'] });
    const all = conditionFor({ key: 'games', op: 'ALL', values: ['CS2'] });

    expect(any.text).toContain('string_to_array');
    expect(any.text).toContain('&&');
    expect(any.values).toContain('cs2,dota 2');
    expect(all.text).toContain('@>');
  });

  it('treats a missing key as satisfying the negative operators', () => {
    expect(conditionFor({ op: 'NEQ', text: 'x' }).text).toContain('NOT COALESCE');
    expect(conditionFor({ op: 'NOT_IN', values: ['x'] }).text).toContain('NOT COALESCE');
  });

  it('reads EXISTS as "the key is filled"', () => {
    expect(conditionFor({ key: 'model', op: 'EXISTS' }).text).toContain("<> ''");
  });

  it('joins several conditions with the requested match mode', () => {
    const conditions = [
      attribute({ key: 'a', op: 'EXISTS' }),
      attribute({ key: 'b', op: 'EXISTS' }),
    ];

    expect(searchWhere(filter({ attributes: conditions }), null, []).text).toContain(
      "COALESCE(l.attributes->>$2, '') <> '' AND COALESCE(l.attributes->>$3, '') <> ''",
    );
    expect(
      searchWhere(filter({ attributes: conditions, attributesMatch: 'ANY' }), null, []).text,
    ).toContain("<> '' OR COALESCE");
  });
});

describe('countQuery', () => {
  it('reuses the search predicate over the two tables it needs', () => {
    const where = searchWhere(filter(), null, []);
    const query = countQuery(where);

    expect(query.text).toContain('SELECT COUNT(*)::int AS count');
    expect(query.text).toContain('FROM listings l');
    expect(query.text).toContain('JOIN businesses b');
    expect(query.text).toContain("l.status = 'ACTIVE'");
  });
});

describe('hasSearchableText', () => {
  it.each(['osh', 'PS5', 'Тошкент', "o'quv"])('accepts %s', (query) => {
    expect(hasSearchableText(query)).toBe(true);
  });

  it.each(['???', '  ', '---'])(
    'rejects %s, which would normalise to an empty tsquery',
    (query) => {
      expect(hasSearchableText(query)).toBe(false);
    },
  );
});
