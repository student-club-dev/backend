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
import { removeFixture, seedFixture } from './helpers/listing-fixture';

interface Facet {
  key: string;
  count: number;
}

interface AttributeFacet {
  key: string;
  kind: string;
  operators: string[];
  values?: { value: string; count: number }[];
  range?: { min: number; max: number };
}

/**
 * Filter schema — e2e. Seeds its own listings (the dev database has none) and asserts the facet
 * counts against exact expected numbers.
 */
describe('Filter schema (student feed) — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  const body = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    groupKeys: ['FOOD'],
    ...extra,
  });

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

    await seedFixture(prisma, redis, 'NATIONAL_FOOD', [
      {
        categoryKey: 'PALOV',
        attributes: { isHalal: 'true', spicyLevel: 'Yengil', portionGrams: '450' },
        originalPrice: 30_000,
        finalPrice: 21_000,
        isDiscount: true,
        discountPercent: 30,
      },
      {
        categoryKey: 'PALOV',
        attributes: { isHalal: 'true', spicyLevel: "Yo'q", portionGrams: '150', _regular: '1' },
        originalPrice: 25_000,
        finalPrice: 25_000,
        isDiscount: false,
        discountPercent: null,
      },
      {
        categoryKey: 'KABOB',
        attributes: { isHalal: 'false', portionGrams: '800' },
        originalPrice: 40_000,
        finalPrice: 20_000,
        isDiscount: true,
        discountPercent: 50,
      },
    ]);
  });

  afterAll(async () => {
    await removeFixture(prisma, redis);
    await app.close();
  });

  it('counts categories over the visible listings', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const categories = res.body.result.categories as (Facet & { label: string; typeKey: string })[];

    expect(categories.find((c) => c.key === 'PALOV')).toMatchObject({
      count: 2,
      label: 'Osh / Palov',
      typeKey: 'NATIONAL_FOOD',
    });
    expect(categories.find((c) => c.key === 'KABOB')).toMatchObject({ count: 1 });
    expect(res.body.result.total).toBe(3);
  });

  it('splits listingKind so DISCOUNT + REGULAR equals ALL', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const byKey = Object.fromEntries(
      (res.body.result.listingKind as Facet[]).map((k) => [k.key, k.count]),
    );

    expect(byKey.DISCOUNT).toBe(2);
    expect(byKey.REGULAR).toBe(1);
    expect(byKey.DISCOUNT + byKey.REGULAR).toBe(byKey.ALL);
  });

  it('reports only attribute values that occur, with counts', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const attributes = res.body.result.attributes as AttributeFacet[];
    const halal = attributes.find((a) => a.key === 'isHalal');
    const spicy = attributes.find((a) => a.key === 'spicyLevel');

    expect(halal?.values).toEqual(
      expect.arrayContaining([
        { value: 'true', count: 2 },
        { value: 'false', count: 1 },
      ]),
    );
    // The catalog declares four spice levels; only the two used come back (§9).
    expect(spicy?.values?.map((v) => v.value).sort()).toEqual(['Yengil', "Yo'q"]);
  });

  it('reports NUMBER attributes as a range rather than a value list', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const portion = (res.body.result.attributes as AttributeFacet[]).find(
      (a) => a.key === 'portionGrams',
    );

    expect(portion?.range).toEqual({ min: 150, max: 800 });
    expect(portion?.values).toBeUndefined();
  });

  it('never exposes the reserved keys as filters', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const keys = (res.body.result.attributes as AttributeFacet[]).map((a) => a.key);

    expect(keys).not.toContain('_regular');
    expect(keys).not.toContain('_phone');
    expect(keys).not.toContain('_gender');
  });

  it('reports the price and discount ranges', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    expect(res.body.result.priceRange).toEqual({ min: 20_000, max: 25_000 });
    expect(res.body.result.discountPercentRange).toEqual({ min: 30, max: 50 });
  });

  it('narrows every count when categoryKeys is given', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body({ categoryKeys: ['KABOB'] }))
      .expect(200);

    const byKey = Object.fromEntries(
      (res.body.result.listingKind as Facet[]).map((k) => [k.key, k.count]),
    );

    expect(res.body.result.total).toBe(1);
    expect(byKey.REGULAR).toBe(0);
  });

  it('reports the district the branch sits in', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const districts = res.body.result.districts as Facet[];

    expect(districts).toHaveLength(1);
    expect(districts[0].count).toBe(3);
  });

  it('rejects a type outside the selected groups', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body({ types: ['TENNIS'] }))
      .expect(422);

    expect(res.body.error.fields).toHaveProperty(['types']);
  });

  it('rejects an unknown group key', async () => {
    await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send({ groupKeys: ['NOPE'] })
      .expect(422);
  });

  it('returns the sorts the feed offers', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/catalog/filter-schema')
      .send(body())
      .expect(200);

    const sorts = res.body.result.sorts as { key: string; requiresGeo: boolean }[];

    expect(sorts.find((s) => s.key === 'DISTANCE')?.requiresGeo).toBe(true);
    expect(sorts.map((s) => s.key)).toContain('DISCOUNT_PERCENT');
  });
});
