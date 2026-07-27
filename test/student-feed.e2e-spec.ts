import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import type { Env } from '../src/config/env';
import { RedisService } from '../src/infrastructure/cache/redis.service';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { TASHKENT, clearFeedCache, removeFeed, seedFeed } from './helpers/feed-fixture';

const STUDENT_EMAIL = 'e2e-feed-reader@example.com';

interface Card {
  id: string;
  title: string;
  categoryKey: string;
  categoryLabel: string;
  isDiscount: boolean;
  savedAmount: number | null;
  discount: { badge: string } | null;
  matchedVia: string;
  isFavorite: boolean;
  branchesCount: number;
  nearestBranch: { branchId: string; distanceMeters: number | null; isOpenNow: boolean } | null;
}

/**
 * The whole student feed against one real dataset — the "Ovqat › Osh" journey of STUDENT_FEED.md
 * §12: groups → filter schema → search → detail → suggest → favourites.
 *
 * Fixture (all NATIONAL_FOOD, business APPROVED):
 *   osh      PALOV  30 000 → 21 000  discount 30%  near branch   halal, 450g
 *   plov2    PALOV  25 000 → 25 000  REGULAR                     halal, 150g
 *   kabob    KABOB  40 000 → 20 000  discount 50%  far branch    not halal, 800g
 *   allMenu  ALL    50 000 → 45 000  discount 10%  near branch   — answers any category
 *   paused   PALOV                   PAUSED — must never be visible (Q4)
 */
describe('Student feed — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let token: string;
  let ids: Record<string, string>;

  const post = (path: string, body: object, bearer?: string): request.Test => {
    const req = request(app.getHttpServer()).post(path).send(body);
    return bearer === undefined ? req : req.set('Authorization', `Bearer ${bearer}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    app.setGlobalPrefix(config.get('API_PREFIX', { infer: true }));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await prisma.student.deleteMany({ where: { email: STUDENT_EMAIL } });

    const seeded = await seedFeed(prisma, redis, [
      {
        key: 'choyxona',
        type: 'NATIONAL_FOOD',
        name: 'Choyxona Navruz',
        branches: [
          { key: 'yaqin', name: 'Markaziy', lat: TASHKENT.lat, lng: TASHKENT.lng },
          // ~11 km north — outside a 5 km radius.
          { key: 'uzoq', name: 'Yunusobod', lat: TASHKENT.lat + 0.1, lng: TASHKENT.lng },
        ],
        listings: [
          {
            key: 'osh',
            categoryKey: 'PALOV',
            title: 'Osh (1 porsiya)',
            branchKeys: ['yaqin'],
            originalPrice: 30_000,
            finalPrice: 21_000,
            isDiscount: true,
            discountValue: 30,
            discountPercent: 30,
            attributes: { isHalal: 'true', portionGrams: '450', _phone: '+998901112233' },
            searchText: 'Osh 1 porsiya PALOV palov choyxona',
          },
          {
            key: 'plov2',
            categoryKey: 'PALOV',
            title: 'Oddiy osh — bir narx',
            branchKeys: ['yaqin'],
            originalPrice: 25_000,
            finalPrice: 25_000,
            isDiscount: false,
            attributes: { isHalal: 'true', portionGrams: '150', _regular: '1' },
            searchText: 'Oddiy osh bir narx PALOV palov',
          },
          {
            key: 'kabob',
            categoryKey: 'KABOB',
            title: 'Kabob (2 sixcha)',
            branchKeys: ['uzoq'],
            originalPrice: 40_000,
            finalPrice: 20_000,
            isDiscount: true,
            discountValue: 50,
            discountPercent: 50,
            attributes: { isHalal: 'false', portionGrams: '800' },
            searchText: 'Kabob 2 sixcha KABOB',
          },
          {
            key: 'allMenu',
            categoryKey: 'ALL',
            title: 'Butun menyuga chegirma',
            branchKeys: ['yaqin', 'uzoq'],
            originalPrice: 50_000,
            finalPrice: 45_000,
            isDiscount: true,
            discountValue: 10,
            discountPercent: 10,
            searchText: 'Butun menyuga chegirma',
          },
          {
            key: 'paused',
            categoryKey: 'PALOV',
            title: 'Vaqtincha to‘xtatilgan osh',
            branchKeys: ['yaqin'],
            originalPrice: 30_000,
            finalPrice: 15_000,
            isDiscount: true,
            discountPercent: 50,
            status: 'PAUSED',
            searchText: 'Vaqtincha toxtatilgan osh palov',
          },
        ],
      },
    ]);
    ids = seeded.listingIds;

    const student = await request(app.getHttpServer())
      .post('/v1/auth/student/register')
      .send({ email: STUDENT_EMAIL, password: 'password123' })
      .expect(201);
    token = student.body.result.accessToken as string;
  });

  afterAll(async () => {
    await removeFeed(prisma, redis);
    await prisma.student.deleteMany({ where: { email: STUDENT_EMAIL } });
    await app.close();
  });

  describe('step 1 — catalog groups', () => {
    it('counts the visible listings under FOOD, excluding the paused one (Q4)', async () => {
      await clearFeedCache(redis);
      const res = await post('/v1/catalog/groups', {}).expect(200);

      const food = (res.body.result as { key: string; listingsCount: number }[]).find(
        (group) => group.key === 'FOOD',
      );
      expect(food?.listingsCount).toBe(4);
    });
  });

  describe('step 2 — filter schema', () => {
    it('offers only the categories and attribute values that actually occur', async () => {
      const res = await post('/v1/catalog/filter-schema', { groupKeys: ['FOOD'] }).expect(200);
      const schema = res.body.result;

      expect(schema.total).toBe(4);
      expect(
        (schema.categories as { key: string; count: number }[])
          .map((c) => `${c.key}:${c.count}`)
          .sort(),
      ).toEqual(['ALL:1', 'KABOB:1', 'PALOV:2']);

      const kinds = Object.fromEntries(
        (schema.listingKind as { key: string; count: number }[]).map((k) => [k.key, k.count]),
      );
      expect(kinds).toEqual({ ALL: 4, DISCOUNT: 3, REGULAR: 1 });

      const portion = (
        schema.attributes as { key: string; range?: { min: number; max: number } }[]
      ).find((a) => a.key === 'portionGrams');
      expect(portion?.range).toEqual({ min: 150, max: 800 });

      // `_phone` is contact data, never a filter.
      expect((schema.attributes as { key: string }[]).map((a) => a.key)).not.toContain('_phone');
    });
  });

  describe('step 3 — search', () => {
    it('returns exactly the pagination envelope, with no cursor or meta (D3)', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'] },
      }).expect(200);

      expect(Object.keys(res.body.result).sort()).toEqual([
        'hasNext',
        'items',
        'page',
        'size',
        'total',
      ]);
      expect(res.body.result.total).toBe(4);
    });

    it('hides the paused listing however it is asked for (Q4)', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'], listingIds: [ids.paused] },
      }).expect(200);

      expect(res.body.result.total).toBe(0);
    });

    it('lets an "ALL" listing answer a category request and marks it matchedVia ALL', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'], categoryKeys: ['PALOV'] },
      }).expect(200);

      const items = res.body.result.items as Card[];
      expect(items.map((i) => i.id).sort()).toEqual([ids.allMenu, ids.osh, ids.plov2].sort());
      expect(items.find((i) => i.id === ids.allMenu)?.matchedVia).toBe('ALL');
    });

    it('excludes ALL listings when includeAllCategory is false', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'], categoryKeys: ['PALOV'], includeAllCategory: false },
      }).expect(200);

      expect((res.body.result.items as Card[]).map((i) => i.id).sort()).toEqual(
        [ids.osh, ids.plov2].sort(),
      );
    });

    it('reports a regular listing with null discount fields, never zeros (Q0)', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'], listingKind: 'REGULAR' },
      }).expect(200);

      const items = res.body.result.items as Card[];
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: ids.plov2,
        isDiscount: false,
        savedAmount: null,
        discount: null,
      });
    });

    it('renders the discount badge server-side', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'], listingIds: [ids.osh] },
      }).expect(200);

      const card = (res.body.result.items as Card[])[0];
      expect(card.discount?.badge).toBe('−30%');
      expect(card.savedAmount).toBe(9000);
      expect(card.categoryLabel).toBe('Osh / Palov');
    });

    it('sinks regular listings to the end of a discount sort instead of dropping them (§12.22)', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'] },
        sort: { by: 'DISCOUNT_PERCENT', direction: 'DESC' },
      }).expect(200);

      const items = res.body.result.items as Card[];
      expect(items).toHaveLength(4);
      expect(items[items.length - 1].id).toBe(ids.plov2);
      expect(items[0].id).toBe(ids.kabob);
    });

    it('filters by a numeric attribute range without choking on a non-numeric value', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: {
          groupKeys: ['FOOD'],
          attributes: [{ key: 'portionGrams', op: 'GTE', number: 400 }],
        },
      }).expect(200);

      expect((res.body.result.items as Card[]).map((i) => i.id).sort()).toEqual(
        [ids.kabob, ids.osh].sort(),
      );
    });

    it('narrows by radius and reports the distance', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: {
          groupKeys: ['FOOD'],
          geo: { lat: TASHKENT.lat, lng: TASHKENT.lng, radiusMeters: 5000 },
        },
        sort: { by: 'DISTANCE' },
      }).expect(200);

      const items = res.body.result.items as Card[];
      // kabob sits only on the far branch, so the 5 km radius drops it.
      expect(items.map((i) => i.id)).not.toContain(ids.kabob);
      expect(items[0].nearestBranch?.distanceMeters).toBeLessThan(100);
    });

    it('rejects DISTANCE sorting without coordinates', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'] },
        sort: { by: 'DISTANCE' },
      }).expect(422);

      expect(res.body.error.code).toBe('GEO_REQUIRED_FOR_SORT');
    });

    it('finds a listing through a category synonym', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'], query: 'palov' },
      }).expect(200);

      expect(res.body.result.total).toBeGreaterThan(0);
    });

    it('does not match "osh" against "Toshkent" — word boundaries hold (§12.13)', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'], query: 'toshkent' },
      }).expect(200);

      expect(res.body.result.total).toBe(0);
    });

    it('COUNT reports the same total as LIST for the same filter (§12.15)', async () => {
      const body = { filter: { groupKeys: ['FOOD'], categoryKeys: ['PALOV'] } };
      const list = await post('/v1/discounts/search', { ...body, mode: 'LIST' }).expect(200);
      const count = await post('/v1/discounts/search', { ...body, mode: 'COUNT' }).expect(200);

      expect(count.body.result.total).toBe(list.body.result.total);
    });

    it('personalises isFavorite only for a signed-in student (D5)', async () => {
      await post(
        '/v1/discounts/favorites/toggle',
        { listingId: ids.osh, saved: true },
        token,
      ).expect(200);

      const anon = await post('/v1/discounts/search', {
        mode: 'LIST',
        filter: { groupKeys: ['FOOD'], listingIds: [ids.osh] },
      }).expect(200);
      const auth = await post(
        '/v1/discounts/search',
        { mode: 'LIST', filter: { groupKeys: ['FOOD'], listingIds: [ids.osh] } },
        token,
      ).expect(200);

      expect((anon.body.result.items as Card[])[0].isFavorite).toBe(false);
      expect((auth.body.result.items as Card[])[0].isFavorite).toBe(true);
    });
  });

  describe('step 3b — the same filter on the map', () => {
    const bbox = { minLat: 41.2, minLng: 69.1, maxLat: 41.5, maxLng: 69.4 };

    it('drops one pin per branch, so markersTotal exceeds total (D15)', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'MAP',
        filter: { groupKeys: ['FOOD'], geo: { bbox } },
      }).expect(200);

      const map = res.body.result;
      // allMenu sits on both branches, so it contributes two markers to four listings.
      expect(map.total).toBe(4);
      expect(map.markersTotal).toBe(5);
      expect(map.markers).toHaveLength(5);
      expect(map.truncated).toBe(false);

      const allMenuPins = (map.markers as { listingId: string }[]).filter(
        (m) => m.listingId === ids.allMenu,
      );
      expect(allMenuPins).toHaveLength(2);
    });

    it('reports the same total as LIST for the identical filter (D15)', async () => {
      const filter = { groupKeys: ['FOOD'], geo: { bbox } };
      const list = await post('/v1/discounts/search', { mode: 'LIST', filter }).expect(200);
      const map = await post('/v1/discounts/search', { mode: 'MAP', filter }).expect(200);

      expect(map.body.result.total).toBe(list.body.result.total);
    });

    it('keeps regular listings on the map with a null badge (Q0)', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'MAP',
        filter: { groupKeys: ['FOOD'], geo: { bbox } },
      }).expect(200);

      const regular = (
        res.body.result.markers as {
          listingId: string;
          discountBadge: string | null;
          isDiscount: boolean;
        }[]
      ).find((m) => m.listingId === ids.plov2);

      expect(regular).toBeDefined();
      expect(regular?.isDiscount).toBe(false);
      expect(regular?.discountBadge).toBeNull();
    });

    it('refuses MAP without a viewport', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'MAP',
        filter: { groupKeys: ['FOOD'] },
      }).expect(422);

      expect(res.body.error.code).toBe('GEO_REQUIRED');
    });

    it('rejects a bbox outside Uzbekistan', async () => {
      const res = await post('/v1/discounts/search', {
        mode: 'MAP',
        filter: {
          groupKeys: ['FOOD'],
          geo: { bbox: { minLat: 10, minLng: 10, maxLat: 20, maxLng: 20 } },
        },
      }).expect(422);

      expect(res.body.error.code).toBe('INVALID_BBOX');
    });
  });

  describe('step 4 — detail', () => {
    it('returns the phone attribute and the full branch list', async () => {
      const res = await post('/v1/discounts/detail', { listingId: ids.allMenu }, token).expect(200);
      const detail = res.body.result;

      expect(detail.branchesCount).toBe(2);
      expect(detail.branches).toHaveLength(2);
      expect(detail.business.name).toBe('Choyxona Navruz');
    });

    it('exposes _phone on detail, where the contact number belongs', async () => {
      const res = await post('/v1/discounts/detail', { listingId: ids.osh }, token).expect(200);

      expect(res.body.result.attributes._phone).toBe('+998901112233');
    });

    it('404s for a listing that is not visible, disclosing nothing (Q4)', async () => {
      const res = await post('/v1/discounts/detail', { listingId: ids.paused }, token).expect(404);

      expect(res.body.error.code).toBe('LISTING_NOT_FOUND');
    });
  });

  describe('step 5 — suggest', () => {
    it('suggests the category behind a typed term', async () => {
      const res = await post('/v1/discounts/suggest', {
        query: 'osh',
        groupKeys: ['FOOD'],
      }).expect(200);

      const suggestions = res.body.result.suggestions as { kind: string; count: number }[];
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.every((s) => s.count > 0)).toBe(true);
    });

    it('returns nothing rather than erroring for a single character', async () => {
      const res = await post('/v1/discounts/suggest', { query: 'o', groupKeys: ['FOOD'] }).expect(
        200,
      );

      expect(res.body.result.suggestions).toEqual([]);
    });
  });

  describe('step 6 — favourites', () => {
    it('lists the saved listings with no type filter at all (the Q3 exception)', async () => {
      const res = await post('/v1/discounts/favorites/search', {}, token).expect(200);

      const items = res.body.result.items as Card[];
      expect(items.map((i) => i.id)).toEqual([ids.osh]);
      expect(items[0].isFavorite).toBe(true);
    });

    it('accepts the same filter model as the open feed', async () => {
      const res = await post(
        '/v1/discounts/favorites/search',
        { filter: { categoryKeys: ['PALOV'] } },
        token,
      ).expect(200);

      expect((res.body.result.items as Card[]).map((i) => i.id)).toEqual([ids.osh]);
    });

    it('never leaks another student’s favourites to an anonymous caller', async () => {
      await post('/v1/discounts/favorites/search', {}).expect(401);
    });
  });
});
