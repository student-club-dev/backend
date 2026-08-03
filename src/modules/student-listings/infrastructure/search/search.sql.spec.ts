import type { Prisma } from '@prisma/client';
import {
  EmploymentType,
  PropertyType,
  ServiceFormat,
  ServiceType,
  TaskCategory,
  TaskFormat,
  TenantGender,
  WorkShift,
} from '../../domain/enums/detail.enums';
import { StudentListingKind } from '../../domain/enums/student-listing-kind.enum';
import {
  EMPTY_KIND_FILTER,
  ListingSort,
  type GeoFilter,
  type KindFilter,
} from '../../domain/search/search-criteria';
import {
  cursorCondition,
  effectiveSort,
  geoFilter,
  kindFilter,
  orderBy,
  textSearch,
  visibleListing,
} from './search.sql';

/**
 * The Postgres form of a fragment, whitespace collapsed so assertions read like the SQL rather
 * than matching its indentation. `.text` (not `.sql`) because it numbers placeholders `$1, $2`
 * the way the driver actually sends them.
 */
function sqlOf(fragment: Prisma.Sql): string {
  return fragment.text.replace(/\s+/g, ' ').trim();
}

function filter(overrides: Partial<KindFilter> = {}): KindFilter {
  return { ...EMPTY_KIND_FILTER, ...overrides };
}

function geo(overrides: Partial<GeoFilter> = {}): GeoFilter {
  return {
    lat: null,
    lng: null,
    radiusMeters: null,
    regionIds: [],
    districtIds: [],
    bbox: null,
    ...overrides,
  };
}

describe('visibleListing (§7.2.0)', () => {
  const sql = sqlOf(visibleListing('usr_viewer'));

  it.each([
    ['excludes soft-deleted rows', 'l.deleted_at IS NULL'],
    ['requires ACTIVE', "l.status = 'ACTIVE'"],
    ['requires the window to be open', 'l.valid_from <= now()'],
    ['requires the window not to have closed', 'l.valid_to > now()'],
    ['drops a task past its deadline', 'l.task_deadline > now()'],
    ['requires an unbanned owner', 'FROM students s'],
    ['excludes blocked pairs', 'FROM blocks bl'],
  ])('%s', (_label, expected) => {
    expect(sql).toContain(expected);
  });

  it('checks blocks in both directions', () => {
    // Hiding only the blocker's view would still let the blocked student watch their listings.
    expect(sql).toContain('bl.blocker_id = $1 AND bl.blocked_id = l.owner_id');
    expect(sql).toContain('bl.blocker_id = l.owner_id AND bl.blocked_id = $2');
    expect(visibleListing('usr_viewer').values).toEqual(['usr_viewer', 'usr_viewer']);
  });
});

describe('kindFilter (§7.2.1)', () => {
  it('always constrains the kind — lists never mix', () => {
    expect(sqlOf(kindFilter(StudentListingKind.RENTAL, filter(), null, null))).toContain(
      'l.kind = $1',
    );
  });

  describe('soft-match rules', () => {
    it('gender also matches a listing marked ANY', () => {
      const sql = sqlOf(
        kindFilter(StudentListingKind.RENTAL, filter({ gender: TenantGender.FEMALE }), null, null),
      );
      expect(sql).toContain("l.rental_gender = $2 OR l.rental_gender = 'ANY'");
    });

    it('service format also matches HYBRID', () => {
      const sql = sqlOf(
        kindFilter(
          StudentListingKind.SERVICE,
          filter({ serviceFormat: ServiceFormat.ONLINE }),
          null,
          null,
        ),
      );
      expect(sql).toContain("l.service_format = $2 OR l.service_format = 'HYBRID'");
    });

    it('shift also matches FLEXIBLE', () => {
      const sql = sqlOf(
        kindFilter(StudentListingKind.JOB, filter({ shift: WorkShift.MORNING }), null, null),
      );
      expect(sql).toContain("l.job_shift = $2 OR l.job_shift = 'FLEXIBLE'");
    });

    it('task format also matches ANY', () => {
      const sql = sqlOf(
        kindFilter(StudentListingKind.TASK, filter({ taskFormat: TaskFormat.ONLINE }), null, null),
      );
      expect(sql).toContain("l.task_format = $2 OR l.task_format = 'ANY'");
    });

    it('a maxPrice never drops a negotiable listing', () => {
      const sql = sqlOf(kindFilter(StudentListingKind.RENTAL, filter(), null, 2_000_000));
      expect(sql).toContain('l.price <= $2 OR l.is_negotiable = true');
    });
  });

  describe('cross-kind parameters are ignored, not rejected', () => {
    it('ignores a RENTAL filter on a JOB search', () => {
      // The app leaves stale params behind when switching tabs (§7.2.5).
      const sql = sqlOf(
        kindFilter(
          StudentListingKind.JOB,
          filter({ propertyType: PropertyType.APARTMENT, minRooms: 3 }),
          null,
          null,
        ),
      );
      expect(sql).not.toContain('rental_property_type');
      expect(sql).not.toContain('rental_room_count');
    });

    it('ignores a JOB filter on a RENTAL search', () => {
      const sql = sqlOf(
        kindFilter(
          StudentListingKind.RENTAL,
          filter({ jobCategoryKey: 'COURIER', employment: EmploymentType.DAILY }),
          null,
          null,
        ),
      );
      expect(sql).not.toContain('job_category_key');
      expect(sql).not.toContain('job_employment');
    });
  });

  describe('hard filters', () => {
    it('applies RENTAL rooms and availability', () => {
      const sql = sqlOf(
        kindFilter(
          StudentListingKind.RENTAL,
          filter({ minRooms: 2, onlyAvailable: true }),
          null,
          null,
        ),
      );
      expect(sql).toContain('l.rental_room_count >= $2');
      expect(sql).toContain('l.rental_needed_tenants > 0');
    });

    it('applies SERVICE type and free trial', () => {
      const sql = sqlOf(
        kindFilter(
          StudentListingKind.SERVICE,
          filter({ serviceType: ServiceType.TUTOR, onlyFreeTrial: true }),
          null,
          null,
        ),
      );
      expect(sql).toContain('l.service_type = $2');
      expect(sql).toContain('l.service_has_free_trial = true');
    });

    it('applies JOB no-experience', () => {
      const sql = sqlOf(
        kindFilter(StudentListingKind.JOB, filter({ noExperienceOnly: true }), null, null),
      );
      expect(sql).toContain("l.job_experience = 'NONE'");
    });

    it('applies TASK category and open deadline', () => {
      const sql = sqlOf(
        kindFilter(
          StudentListingKind.TASK,
          filter({ taskCategory: TaskCategory.EXACT, onlyOpenDeadline: true }),
          null,
          null,
        ),
      );
      expect(sql).toContain('l.task_category = $2');
      expect(sql).toContain('l.task_deadline > now()');
    });

    it('binds prices as bigint so a so‘m amount never loses precision', () => {
      const fragment = kindFilter(StudentListingKind.RENTAL, filter(), 100, 2_000_000);
      expect(fragment.values).toContain(100n);
      expect(fragment.values).toContain(2_000_000n);
    });
  });
});

describe('textSearch', () => {
  it.each([null, '', '   '])('emits nothing for %p', (query) => {
    expect(sqlOf(textSearch(query))).toBe('');
  });

  it('matches the search vector through uz_normalize', () => {
    const fragment = textSearch('Chilonzor');
    expect(sqlOf(fragment)).toContain('l.search_vector @@ plainto_tsquery');
    expect(fragment.values).toEqual(['Chilonzor']);
  });
});

describe('geoFilter (§7.2.3)', () => {
  it('emits nothing when no geo block is sent — the search covers the country', () => {
    expect(sqlOf(geoFilter(null))).toBe('');
    expect(sqlOf(geoFilter(geo()))).toBe('');
  });

  it('uses EXISTS so a listing with several matching pins appears once', () => {
    const sql = sqlOf(geoFilter(geo({ districtIds: ['CHILONZOR'] })));
    expect(sql).toContain('EXISTS ( SELECT 1 FROM student_listing_branches b');
    expect(sql).not.toContain('JOIN student_listing_branches');
  });

  it('keeps address-less listings in the result', () => {
    // An online TASK has no place but can still be done — dropping it would hide real work.
    const sql = sqlOf(geoFilter(geo({ districtIds: ['CHILONZOR'] })));
    expect(sql).toContain('OR NOT EXISTS');
  });

  it('applies a radius with ST_DWithin', () => {
    const sql = sqlOf(geoFilter(geo({ lat: 41.31, lng: 69.24, radiusMeters: 5000 })));
    expect(sql).toContain('ST_DWithin');
  });

  it('clamps the radius at 200 km rather than failing', () => {
    const fragment = geoFilter(geo({ lat: 41.31, lng: 69.24, radiusMeters: 999_999 }));
    expect(fragment.values).toContain(200_000);
  });

  it('accepts several districts', () => {
    const fragment = geoFilter(geo({ districtIds: ['CHILONZOR', 'UCHTEPA'] }));
    expect(sqlOf(fragment)).toContain('b.district_id IN ($1,$2)');
    expect(fragment.values).toEqual(['CHILONZOR', 'UCHTEPA']);
  });

  it('applies a bbox with ST_Intersects', () => {
    const sql = sqlOf(
      geoFilter(geo({ bbox: { minLat: 41.2, minLng: 69.1, maxLat: 41.4, maxLng: 69.4 } })),
    );
    expect(sql).toContain('ST_Intersects');
  });

  it('intersects the three modes with AND when combined', () => {
    const sql = sqlOf(
      geoFilter(
        geo({
          lat: 41.31,
          lng: 69.24,
          radiusMeters: 5000,
          districtIds: ['CHILONZOR'],
          bbox: { minLat: 41.2, minLng: 69.1, maxLat: 41.4, maxLng: 69.4 },
        }),
      ),
    );
    expect(sql).toContain('ST_DWithin');
    expect(sql).toContain('b.district_id IN');
    expect(sql).toContain('ST_Intersects');
  });
});

describe('effectiveSort (§7.2.2)', () => {
  it('falls back to NEWEST for NEAREST without a coordinate, rather than erroring', () => {
    expect(effectiveSort(ListingSort.NEAREST, null)).toBe(ListingSort.NEWEST);
    expect(effectiveSort(ListingSort.NEAREST, geo())).toBe(ListingSort.NEWEST);
  });

  it('keeps NEAREST when a coordinate is present', () => {
    expect(effectiveSort(ListingSort.NEAREST, geo({ lat: 41.3, lng: 69.2 }))).toBe(
      ListingSort.NEAREST,
    );
  });

  it('maps RELEVANCE to NEWEST until the university ranking ships', () => {
    expect(effectiveSort(ListingSort.RELEVANCE, null)).toBe(ListingSort.NEWEST);
  });

  it.each([
    ListingSort.NEWEST,
    ListingSort.PRICE_ASC,
    ListingSort.PRICE_DESC,
    ListingSort.DEADLINE,
  ])('leaves %s alone', (sort) => {
    expect(effectiveSort(sort, null)).toBe(sort);
  });
});

describe('orderBy (§7.2.2)', () => {
  it.each([
    [ListingSort.NEWEST, 'ORDER BY l.created_at DESC, l.id DESC'],
    [ListingSort.PRICE_ASC, 'ORDER BY l.price ASC, l.id DESC'],
    [ListingSort.PRICE_DESC, 'ORDER BY l.price DESC, l.id DESC'],
    [ListingSort.NEAREST, 'ORDER BY dist.d ASC NULLS LAST, l.id DESC'],
    [ListingSort.DEADLINE, 'ORDER BY l.task_deadline ASC NULLS LAST, l.id DESC'],
  ])('%s orders by %s', (sort, expected) => {
    expect(sqlOf(orderBy(sort))).toBe(expected);
  });

  it('always ends in id so pages are stable', () => {
    for (const sort of Object.values(ListingSort)) {
      expect(sqlOf(orderBy(sort))).toContain('l.id DESC');
    }
  });
});

describe('cursorCondition (§7.2.2)', () => {
  it('resumes a NEWEST page strictly after the last row', () => {
    const sql = sqlOf(
      cursorCondition(ListingSort.NEWEST, {
        sortValue: '2026-08-03T00:00:00.000Z',
        id: 'lst_9',
      }),
    );
    expect(sql).toContain('l.created_at < $1');
    expect(sql).toContain('l.created_at = $2 AND l.id < $3');
  });

  it('flips the comparison for an ascending price sort', () => {
    const sql = sqlOf(cursorCondition(ListingSort.PRICE_ASC, { sortValue: 500, id: 'lst_9' }));
    expect(sql).toContain('l.price > $1');
  });

  it('flips it back for a descending price sort', () => {
    const sql = sqlOf(cursorCondition(ListingSort.PRICE_DESC, { sortValue: 500, id: 'lst_9' }));
    expect(sql).toContain('l.price < $1');
  });

  it('keeps the null tail reachable while the cursor is still before it', () => {
    // NEAREST puts address-less listings last; paging must not stop before reaching them.
    const sql = sqlOf(cursorCondition(ListingSort.NEAREST, { sortValue: 640, id: 'lst_9' }));
    expect(sql).toContain('dist.d > $1');
    expect(sql).toContain('dist.d IS NULL');
  });

  it('pages within the null tail by id once the cursor is inside it', () => {
    const sql = sqlOf(cursorCondition(ListingSort.NEAREST, { sortValue: null, id: 'lst_9' }));
    expect(sql).toContain('dist.d IS NULL AND l.id < $1');
    expect(sql).not.toContain('dist.d > ');
  });

  it('binds a DEADLINE cursor as a timestamp, not a string', () => {
    const fragment = cursorCondition(ListingSort.DEADLINE, {
      sortValue: '2026-08-14T18:00:00.000Z',
      id: 'lst_9',
    });
    expect(fragment.values[0]).toBeInstanceOf(Date);
  });
});
