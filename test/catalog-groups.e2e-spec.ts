import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import type { Env } from '../src/config/env';

/**
 * Student-feed catalog endpoints — e2e. Runs against a real seeded DB + Redis.
 * Read-only: creates nothing, so there is no cleanup.
 *
 * The pipe is configured exactly as in `main.ts` (including `validationExceptionFactory`) so the
 * 422 assertions exercise the shape the app really returns.
 */
interface GroupBody {
  key: string;
  typesCount: number;
  listingsCount: number;
}

interface TypeBody {
  key: string;
  listingsCount: number;
}

describe('Catalog groups (student feed) — e2e', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the 8 groups covering all 27 types, in sortOrder', async () => {
    const response = await request(app.getHttpServer()).post('/v1/catalog/groups').send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, status: 200, error: null });

    const groups = response.body.result as GroupBody[];
    expect(groups).toHaveLength(8);
    expect(groups.map((group) => group.key)).toEqual([
      'FOOD',
      'SPORT',
      'GAMES',
      'ENTERTAINMENT',
      'EDUCATION',
      'BEAUTY',
      'SHOPPING',
      'HOUSING',
    ]);
    expect(groups.reduce((sum, group) => sum + group.typesCount, 0)).toBe(27);
  });

  it('group listingsCount equals the sum of its types listingsCount (§12.19)', async () => {
    const groupsResponse = await request(app.getHttpServer()).post('/v1/catalog/groups').send({});
    const food = (groupsResponse.body.result as GroupBody[]).find((group) => group.key === 'FOOD');

    const typesResponse = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: ['FOOD'] });

    expect(typesResponse.status).toBe(200);
    const sum = (typesResponse.body.result as TypeBody[]).reduce(
      (total, type) => total + type.listingsCount,
      0,
    );
    expect(sum).toBe(food?.listingsCount);
  });

  it('gender narrows the BEAUTY type list but not the counts (D16)', async () => {
    const all = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: ['BEAUTY'] });
    const male = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: ['BEAUTY'], gender: 'MALE' });

    const allTypes = all.body.result as TypeBody[];
    const maleTypes = male.body.result as TypeBody[];

    expect(allTypes.map((type) => type.key).sort()).toEqual(['BARBERSHOP', 'BEAUTY_SALON']);
    expect(maleTypes.map((type) => type.key)).toEqual(['BARBERSHOP']);

    const barbershopAll = allTypes.find((type) => type.key === 'BARBERSHOP');
    expect(maleTypes[0].listingsCount).toBe(barbershopAll?.listingsCount);
  });

  it('accepts 3 groups but rejects 4 (D1)', async () => {
    const three = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: ['SPORT', 'FOOD', 'GAMES'] });

    expect(three.status).toBe(200);
    // SPORT alone holds 10 types — the original per-type cap made this combination impossible.
    expect((three.body.result as TypeBody[]).length).toBe(17);

    const four = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: ['SPORT', 'FOOD', 'GAMES', 'BEAUTY'] });

    expect(four.status).toBe(422);
    expect(four.body).toMatchObject({
      success: false,
      status: 422,
      result: null,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(four.body.error.fields).toHaveProperty('groupKeys');
  });

  it('rejects an empty groupKeys list', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/catalog/types')
      .send({ groupKeys: [] });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown body field (forbidNonWhitelisted)', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/catalog/groups')
      .send({ nope: 1 });

    expect(response.status).toBe(422);
  });

  it('accepts a geo scope', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/catalog/groups')
      .send({ geo: { lat: 41.3111, lng: 69.2797, radiusMeters: 5000 } });

    expect(response.status).toBe(200);
    expect(response.body.result).toHaveLength(8);
  });

  it('rejects an out-of-range radius', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/catalog/groups')
      .send({ geo: { lat: 41.3111, lng: 69.2797, radiusMeters: 99 } });

    expect(response.status).toBe(422);
    // Array form: the key literally contains a dot ("geo.radiusMeters"), and the string form of
    // toHaveProperty would read that dot as a nested path instead.
    expect(response.body.error.fields).toHaveProperty(['geo.radiusMeters']);
  });
});
