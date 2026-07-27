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
import { TASHKENT, removeFeed, seedFeed } from './helpers/feed-fixture';

const STUDENT_EMAIL = 'e2e-fav-student@example.com';
const OWNER_EMAIL = 'e2e-fav-owner@example.com';

/**
 * Favourites toggle — e2e. Exercises the auth split (public feed vs student-only writes) and the
 * Q4 visibility rule against a real database.
 */
describe('Favourites toggle (student feed) — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let studentToken: string;
  let ownerToken: string;
  let activeListingId: string;
  let expiredListingId: string;

  const auth = (token: string): string => `Bearer ${token}`;

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

    await cleanAccounts();
    const seeded = await seedFeed(prisma, redis, [
      {
        key: 'choyxona',
        type: 'NATIONAL_FOOD',
        name: 'Choyxona Navruz',
        branches: [{ key: 'markaz', name: 'Markaziy', lat: TASHKENT.lat, lng: TASHKENT.lng }],
        listings: [
          {
            key: 'osh',
            categoryKey: 'PALOV',
            title: 'Osh (1 porsiya)',
            branchKeys: ['markaz'],
            originalPrice: 30_000,
            finalPrice: 21_000,
            isDiscount: true,
          },
          {
            key: 'expired',
            categoryKey: 'KABOB',
            title: 'Muddati tugagan kabob',
            branchKeys: ['markaz'],
            originalPrice: 40_000,
            finalPrice: 30_000,
            isDiscount: true,
            // Already over: the student must not be able to bookmark it.
            validFromOffsetMs: -10 * 86_400_000,
            validToOffsetMs: -86_400_000,
          },
        ],
      },
    ]);
    activeListingId = seeded.listingIds.osh;
    expiredListingId = seeded.listingIds.expired;

    const student = await request(app.getHttpServer())
      .post('/v1/auth/student/register')
      .send({ email: STUDENT_EMAIL, password: 'password123' })
      .expect(201);
    studentToken = student.body.result.accessToken as string;

    const owner = await request(app.getHttpServer())
      .post('/v1/auth/business/register')
      .send({ email: OWNER_EMAIL, password: 'password123' })
      .expect(201);
    ownerToken = owner.body.result.accessToken as string;
  });

  afterAll(async () => {
    await removeFeed(prisma, redis);
    await cleanAccounts();
    await app.close();
  });

  async function cleanAccounts(): Promise<void> {
    await prisma.student.deleteMany({ where: { email: STUDENT_EMAIL } });
    await prisma.businessOwner.deleteMany({ where: { email: OWNER_EMAIL } });
  }

  it('rejects an anonymous request with 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/discounts/favorites/toggle')
      .send({ listingId: activeListingId, saved: true })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a business-owner token with 403 — a valid identity for the wrong app', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/discounts/favorites/toggle')
      .set('Authorization', auth(ownerToken))
      .send({ listingId: activeListingId, saved: true })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('saves a visible listing and persists it', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/discounts/favorites/toggle')
      .set('Authorization', auth(studentToken))
      .send({ listingId: activeListingId, saved: true })
      .expect(200);

    expect(res.body.result).toEqual({ listingId: activeListingId, saved: true });
    expect(await prisma.studentFavorite.count({ where: { listingId: activeListingId } })).toBe(1);
  });

  it('is idempotent — saving twice leaves exactly one row', async () => {
    await request(app.getHttpServer())
      .post('/v1/discounts/favorites/toggle')
      .set('Authorization', auth(studentToken))
      .send({ listingId: activeListingId, saved: true })
      .expect(200);

    expect(await prisma.studentFavorite.count({ where: { listingId: activeListingId } })).toBe(1);
  });

  it('does not return favoritesCount (D19)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/discounts/favorites/toggle')
      .set('Authorization', auth(studentToken))
      .send({ listingId: activeListingId, saved: true })
      .expect(200);

    expect(res.body.result).not.toHaveProperty('favoritesCount');
  });

  it('unsaves, and unsaving again is a no-op success', async () => {
    await request(app.getHttpServer())
      .post('/v1/discounts/favorites/toggle')
      .set('Authorization', auth(studentToken))
      .send({ listingId: activeListingId, saved: false })
      .expect(200);

    const again = await request(app.getHttpServer())
      .post('/v1/discounts/favorites/toggle')
      .set('Authorization', auth(studentToken))
      .send({ listingId: activeListingId, saved: false })
      .expect(200);

    expect(again.body.result).toEqual({ listingId: activeListingId, saved: false });
    expect(await prisma.studentFavorite.count({ where: { listingId: activeListingId } })).toBe(0);
  });

  it('refuses to save a listing that is past its validity window (Q4)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/discounts/favorites/toggle')
      .set('Authorization', auth(studentToken))
      .send({ listingId: expiredListingId, saved: true })
      .expect(404);

    expect(res.body.error.code).toBe('LISTING_NOT_FOUND');
  });

  it('refuses to save an unknown listing with the same 404 — the status is never disclosed', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/discounts/favorites/toggle')
      .set('Authorization', auth(studentToken))
      .send({ listingId: 'lst_does_not_exist', saved: true })
      .expect(404);

    expect(res.body.error.code).toBe('LISTING_NOT_FOUND');
  });

  it('still lets a student remove an expired listing they had saved', async () => {
    // Saved directly: the API would refuse, but a listing can expire while already bookmarked.
    const student = await prisma.student.findUniqueOrThrow({ where: { email: STUDENT_EMAIL } });
    await prisma.studentFavorite.create({
      data: { studentId: student.id, listingId: expiredListingId },
    });

    await request(app.getHttpServer())
      .post('/v1/discounts/favorites/toggle')
      .set('Authorization', auth(studentToken))
      .send({ listingId: expiredListingId, saved: false })
      .expect(200);

    expect(await prisma.studentFavorite.count({ where: { listingId: expiredListingId } })).toBe(0);
  });
});
