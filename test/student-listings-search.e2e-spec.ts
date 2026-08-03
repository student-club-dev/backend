import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import type { Env } from '../src/config/env';
import { PrismaService } from '../src/infrastructure/database/prisma.service';

const OWNER_EMAIL = 'e2e-search-owner@example.com';
const SEEKER_EMAIL = 'e2e-search-seeker@example.com';

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString();

/** Chilonzor and Yunusobod — ~8 km apart, enough to tell a 3 km radius from a 20 km one. */
const CHILONZOR = {
  lat: 41.2856,
  lng: 69.2034,
  address: 'Chilonzor 9',
  regionId: 'TOSHKENT_SHAHRI',
  districtId: 'CHILONZOR',
};
const YUNUSOBOD = {
  lat: 41.3595,
  lng: 69.2896,
  address: 'Yunusobod 4',
  regionId: 'TOSHKENT_SHAHRI',
  districtId: 'YUNUSOBOD',
};

/**
 * The student-listing feed, end-to-end against Postgres + PostGIS.
 *
 * The SQL builder has unit tests, but they only prove the text is shaped right. These prove the
 * query actually returns what the rules say it should — soft matches, geo, sorting and paging —
 * which is the part a builder test cannot reach.
 */
describe('Student listings search — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let seekerToken: string;
  let ownerId: string;
  let seekerId: string;

  const auth = (token: string): string => `Bearer ${token}`;
  const http = () => request(app.getHttpServer());

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
    await cleanup();

    ownerToken = await register(OWNER_EMAIL);
    seekerToken = await register(SEEKER_EMAIL);
    ownerId = (await prisma.student.findUniqueOrThrow({ where: { email: OWNER_EMAIL } })).id;
    seekerId = (await prisma.student.findUniqueOrThrow({ where: { email: SEEKER_EMAIL } })).id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(async () => {
    // Each test seeds exactly the listings it reasons about, so one test's fixtures cannot
    // silently satisfy (or break) another's assertions.
    await prisma.studentListing.deleteMany({ where: { ownerId } });
    await prisma.block.deleteMany({
      where: { OR: [{ blockerId: seekerId }, { blockerId: ownerId }] },
    });
  });

  async function register(email: string): Promise<string> {
    const res = await http()
      .post('/v1/auth/student/register')
      .send({ email, password: 'password123' })
      .expect(201);
    return res.body.result.accessToken as string;
  }

  async function cleanup(): Promise<void> {
    await prisma.student.deleteMany({ where: { email: { in: [OWNER_EMAIL, SEEKER_EMAIL] } } });
  }

  /** Publishes a listing as the owner and returns its id. */
  async function publish(payload: Record<string, unknown>): Promise<string> {
    const res = await http()
      .post('/v1/student-listings')
      .set('Authorization', auth(ownerToken))
      .send({ submit: true, ...payload })
      .expect(201);
    return res.body.result.id as string;
  }

  function rental(overrides: Record<string, unknown> = {}, details: Record<string, unknown> = {}) {
    return {
      kind: 'RENTAL',
      title: `Ijara ${randomUUID()}`,
      images: ['https://cdn.example/1.jpg'],
      priceUnit: 'PER_MONTH',
      price: 1_500_000,
      contactPhone: '+998901234567',
      branches: [CHILONZOR],
      validFrom: iso(-1),
      validTo: iso(30),
      details: {
        kind: 'RENTAL',
        propertyType: 'APARTMENT',
        roomCount: 3,
        currentTenants: 1,
        neededTenants: 1,
        gender: 'MALE',
        period: 'MONTHLY',
        ...details,
      },
      ...overrides,
    };
  }

  async function search(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await http()
      .post('/v1/student-listings/search')
      .set('Authorization', auth(seekerToken))
      .send(body)
      .expect(200);
    return res.body.result;
  }

  const idsOf = (result: Record<string, unknown>): string[] =>
    (result.items as { id: string }[]).map((item) => item.id);

  describe('kind separation', () => {
    it('requires kind', async () => {
      await http()
        .post('/v1/student-listings/search')
        .set('Authorization', auth(seekerToken))
        .send({})
        .expect(422);
    });

    it('never mixes kinds', async () => {
      const rentalId = await publish(rental());
      await publish({
        kind: 'TASK',
        title: `Topshiriq ${randomUUID()}`,
        description: 'Analiz masalalari',
        priceUnit: 'PER_ITEM',
        price: 50_000,
        contactPhone: '+998901234567',
        branches: [],
        validFrom: iso(-1),
        validTo: iso(8),
        details: {
          kind: 'TASK',
          category: 'EXACT',
          typeKey: 'MATH',
          deadline: iso(9),
          format: 'ONLINE',
        },
      });

      expect(idsOf(await search({ kind: 'RENTAL' }))).toEqual([rentalId]);
    });
  });

  describe('soft-match rules (§7.2.1)', () => {
    it('a gender search also returns listings marked ANY', async () => {
      const female = await publish(rental({}, { gender: 'FEMALE' }));
      const any = await publish(rental({}, { gender: 'ANY' }));
      const male = await publish(rental({}, { gender: 'MALE' }));

      const found = idsOf(await search({ kind: 'RENTAL', filter: { gender: 'FEMALE' } }));

      expect(found).toEqual(expect.arrayContaining([female, any]));
      expect(found).not.toContain(male);
    });

    it('a maxPrice never drops a negotiable listing', async () => {
      const cheap = await publish(rental({ price: 500_000 }));
      const expensive = await publish(rental({ price: 9_000_000 }));
      const negotiable = await publish(rental({ price: 9_000_000, isNegotiable: true }));

      const found = idsOf(await search({ kind: 'RENTAL', maxPrice: 1_000_000 }));

      expect(found).toEqual(expect.arrayContaining([cheap, negotiable]));
      expect(found).not.toContain(expensive);
    });
  });

  describe('cross-kind parameters (§7.2.5)', () => {
    it('ignores a stale filter from another tab instead of erroring', async () => {
      const id = await publish(rental());

      // `propertyType` means nothing to a JOB search but must not 422 — the app leaves it behind
      // when the user switches tabs.
      const result = await search({
        kind: 'RENTAL',
        filter: { propertyType: 'APARTMENT', jobCategoryKey: 'COURIER' },
      });

      expect(idsOf(result)).toEqual([id]);
    });
  });

  describe('geo (§7.2.3)', () => {
    it('searches the whole country when no geo block is sent', async () => {
      const near = await publish(rental());
      const far = await publish(rental({ branches: [YUNUSOBOD] }));

      expect(idsOf(await search({ kind: 'RENTAL' }))).toEqual(expect.arrayContaining([near, far]));
    });

    it('narrows by radius', async () => {
      const near = await publish(rental());
      const far = await publish(rental({ branches: [YUNUSOBOD] }));

      const found = idsOf(
        await search({
          kind: 'RENTAL',
          geo: { lat: CHILONZOR.lat, lng: CHILONZOR.lng, radiusMeters: 3000 },
        }),
      );

      expect(found).toContain(near);
      expect(found).not.toContain(far);
    });

    it('narrows by several districts at once', async () => {
      const chilonzor = await publish(rental());
      const yunusobod = await publish(rental({ branches: [YUNUSOBOD] }));

      const found = idsOf(
        await search({ kind: 'RENTAL', geo: { districtIds: ['CHILONZOR', 'YUNUSOBOD'] } }),
      );
      expect(found).toEqual(expect.arrayContaining([chilonzor, yunusobod]));

      const onlyOne = idsOf(await search({ kind: 'RENTAL', geo: { districtIds: ['CHILONZOR'] } }));
      expect(onlyOne).toContain(chilonzor);
      expect(onlyOne).not.toContain(yunusobod);
    });

    it('returns a listing with several matching pins exactly once', async () => {
      const id = await publish(rental({ branches: [CHILONZOR, YUNUSOBOD] }));

      const found = idsOf(
        await search({ kind: 'RENTAL', geo: { regionIds: ['TOSHKENT_SHAHRI'] } }),
      );

      expect(found.filter((item) => item === id)).toHaveLength(1);
    });

    it('reports the distance to the nearest pin', async () => {
      await publish(rental({ branches: [YUNUSOBOD, CHILONZOR] }));

      const result = await search({
        kind: 'RENTAL',
        geo: { lat: CHILONZOR.lat, lng: CHILONZOR.lng, radiusMeters: 50_000 },
      });

      // Nearest is Chilonzor, i.e. essentially zero — not the Yunusobod pin ~8 km away.
      const [item] = result.items as { distanceMeters: number }[];
      expect(item.distanceMeters).toBeLessThan(100);
    });

    it('keeps an address-less online TASK in a geo-filtered search', async () => {
      // §7.2.3 — an online task has no place but can be done from anywhere.
      const id = await publish({
        kind: 'TASK',
        title: `Onlayn topshiriq ${randomUUID()}`,
        description: 'Analiz masalalari',
        priceUnit: 'PER_ITEM',
        price: 50_000,
        contactPhone: '+998901234567',
        branches: [],
        validFrom: iso(-1),
        validTo: iso(8),
        details: {
          kind: 'TASK',
          category: 'EXACT',
          typeKey: 'MATH',
          deadline: iso(9),
          format: 'ONLINE',
        },
      });

      const result = await search({
        kind: 'TASK',
        geo: { lat: CHILONZOR.lat, lng: CHILONZOR.lng, radiusMeters: 1000 },
      });

      expect(idsOf(result)).toContain(id);
      const item = (result.items as { id: string; distanceMeters: number | null }[]).find(
        (row) => row.id === id,
      );
      expect(item?.distanceMeters).toBeNull();
    });
  });

  describe('sorting (§7.2.2)', () => {
    it('orders by price ascending', async () => {
      const mid = await publish(rental({ price: 2_000_000 }));
      const low = await publish(rental({ price: 1_000_000 }));
      const high = await publish(rental({ price: 3_000_000 }));

      expect(idsOf(await search({ kind: 'RENTAL', sort: 'PRICE_ASC' }))).toEqual([low, mid, high]);
    });

    it('orders by price descending', async () => {
      const mid = await publish(rental({ price: 2_000_000 }));
      const low = await publish(rental({ price: 1_000_000 }));
      const high = await publish(rental({ price: 3_000_000 }));

      expect(idsOf(await search({ kind: 'RENTAL', sort: 'PRICE_DESC' }))).toEqual([high, mid, low]);
    });

    it('falls back to NEWEST when NEAREST is asked for without a coordinate', async () => {
      const first = await publish(rental());
      const second = await publish(rental());

      // No error — the app sends the sort with the tab and the coordinate with the permission.
      expect(idsOf(await search({ kind: 'RENTAL', sort: 'NEAREST' }))).toEqual([second, first]);
    });

    it('orders by distance when a coordinate is given', async () => {
      const far = await publish(rental({ branches: [YUNUSOBOD] }));
      const near = await publish(rental({ branches: [CHILONZOR] }));

      const found = idsOf(
        await search({
          kind: 'RENTAL',
          sort: 'NEAREST',
          geo: { lat: CHILONZOR.lat, lng: CHILONZOR.lng, radiusMeters: 50_000 },
        }),
      );
      expect(found).toEqual([near, far]);
    });
  });

  describe('cursor paging (§7.2.2)', () => {
    it('walks every listing exactly once across pages', async () => {
      const ids = [];
      for (let i = 0; i < 5; i += 1) {
        ids.push(await publish(rental({ price: 1_000_000 + i })));
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let guard = 0;

      do {
        const page: Record<string, unknown> = await search({
          kind: 'RENTAL',
          sort: 'PRICE_ASC',
          page: { size: 2, cursor },
        });
        seen.push(...idsOf(page));
        cursor = page.hasNext === true ? (page.nextCursor as string) : null;
        guard += 1;
      } while (cursor !== null && guard < 10);

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect(seen).toEqual(expect.arrayContaining(ids));
    });

    it('returns a null nextCursor on the last page', async () => {
      await publish(rental());
      const page = await search({ kind: 'RENTAL', page: { size: 20 } });

      expect(page.hasNext).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it('rejects a cursor whose filters changed', async () => {
      await publish(rental({ price: 1_000_000 }));
      await publish(rental({ price: 2_000_000 }));

      const first = await search({ kind: 'RENTAL', sort: 'PRICE_ASC', page: { size: 1 } });

      const res = await http()
        .post('/v1/student-listings/search')
        .set('Authorization', auth(seekerToken))
        .send({
          kind: 'RENTAL',
          sort: 'PRICE_DESC', // changed mid-scroll
          page: { size: 1, cursor: first.nextCursor },
        })
        .expect(422);

      expect(res.body.error.code).toBe('PAGE_CURSOR_INVALID');
    });

    it('supports page-number mode with a total', async () => {
      for (let i = 0; i < 5; i += 1) {
        await publish(rental({ price: 1_000_000 + i }));
      }

      const second = await search({
        kind: 'RENTAL',
        sort: 'PRICE_ASC',
        page: { size: 2, number: 2 },
      });

      expect(second.page).toBe(2);
      expect(second.total).toBe(5);
      expect(second.hasNext).toBe(true);
      expect((second.items as unknown[]).length).toBe(2);
      // Offset mode issues no cursor — the two ways of holding a position are not interchangeable.
      expect(second.nextCursor).toBeNull();
    });

    it('returns an empty last page past the end rather than erroring', async () => {
      await publish(rental());

      const page = await search({ kind: 'RENTAL', page: { size: 20, number: 9 } });

      expect(page.items).toEqual([]);
      expect(page.hasNext).toBe(false);
    });

    it('leaves page and total null in cursor mode', async () => {
      await publish(rental());
      const page = await search({ kind: 'RENTAL', page: { size: 20 } });

      expect(page.page).toBeNull();
      expect(page.total).toBeNull();
    });

    it('clamps an oversized page rather than failing', async () => {
      await publish(rental());
      const page = await search({ kind: 'RENTAL', page: { size: 500 } });
      expect(page.size).toBe(50);
    });
  });

  describe('visibility in results (§7.2.0)', () => {
    it('omits a DRAFT', async () => {
      await http()
        .post('/v1/student-listings')
        .set('Authorization', auth(ownerToken))
        .send(rental())
        .expect(201);

      expect(idsOf(await search({ kind: 'RENTAL' }))).toEqual([]);
    });

    it('omits a PAUSED listing', async () => {
      const id = await publish(rental());
      await http()
        .post(`/v1/student-listings/${id}/status`)
        .set('Authorization', auth(ownerToken))
        .send({ status: 'PAUSED' })
        .expect(200);

      expect(idsOf(await search({ kind: 'RENTAL' }))).toEqual([]);
    });

    it('omits a listing whose window has closed', async () => {
      const id = await publish(rental());
      await prisma.studentListing.update({
        where: { id },
        data: { validTo: new Date(Date.now() - DAY_MS) },
      });

      expect(idsOf(await search({ kind: 'RENTAL' }))).toEqual([]);
    });

    it('hides both parties from each other once one blocks the other', async () => {
      const id = await publish(rental());
      expect(idsOf(await search({ kind: 'RENTAL' }))).toEqual([id]);

      // The owner blocks the seeker; the seeker must stop seeing the owner's listings.
      await prisma.block.create({ data: { blockerId: ownerId, blockedId: seekerId } });

      expect(idsOf(await search({ kind: 'RENTAL' }))).toEqual([]);
    });

    it('flags the owner’s own listing with isMine', async () => {
      await publish(rental());

      const res = await http()
        .post('/v1/student-listings/search')
        .set('Authorization', auth(ownerToken))
        .send({ kind: 'RENTAL' })
        .expect(200);

      expect(res.body.result.items[0].isMine).toBe(true);
    });
  });

  describe('GET variant (§7.2.5)', () => {
    it('returns the same result as the POST body', async () => {
      const cheap = await publish(rental({ price: 1_000_000 }));
      await publish(rental({ price: 9_000_000 }));

      const viaGet = await http()
        .get('/v1/student-listings?kind=RENTAL&maxPrice=2000000&sort=PRICE_ASC')
        .set('Authorization', auth(seekerToken))
        .expect(200);

      const viaPost = await search({ kind: 'RENTAL', maxPrice: 2_000_000, sort: 'PRICE_ASC' });

      expect(idsOf(viaGet.body.result)).toEqual([cheap]);
      expect(idsOf(viaGet.body.result)).toEqual(idsOf(viaPost));
    });

    it('accepts comma-separated districts', async () => {
      const chilonzor = await publish(rental());
      const yunusobod = await publish(rental({ branches: [YUNUSOBOD] }));

      const res = await http()
        .get('/v1/student-listings?kind=RENTAL&districtIds=CHILONZOR,YUNUSOBOD')
        .set('Authorization', auth(seekerToken))
        .expect(200);

      expect(idsOf(res.body.result)).toEqual(expect.arrayContaining([chilonzor, yunusobod]));
    });

    it('requires kind', async () => {
      await http().get('/v1/student-listings').set('Authorization', auth(seekerToken)).expect(422);
    });
  });

  describe('full-text query', () => {
    it('matches on the title', async () => {
      const match = await publish(rental({ title: `Chilonzorda sherik kerak ${randomUUID()}` }));
      await publish(rental({ title: `Yunusobodda xona ${randomUUID()}` }));

      expect(idsOf(await search({ kind: 'RENTAL', query: 'Chilonzorda' }))).toEqual([match]);
    });
  });
});
