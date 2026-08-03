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

const OWNER_EMAIL = 'e2e-listings-owner@example.com';
const STRANGER_EMAIL = 'e2e-listings-stranger@example.com';

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString();

/** A pin in Chilonzor — inside Uzbekistan, so it satisfies the location rules. */
const CHILONZOR = {
  lat: 41.2856,
  lng: 69.2034,
  address: 'Chilonzor 9-kvartal, 42-uy',
  regionId: 'TOSHKENT_SHAHRI',
  districtId: 'CHILONZOR',
};

/**
 * Everything a publishable RENTAL needs; individual tests break one field at a time.
 *
 * The title is unique per call because §6 rejects a repeat of the same kind + title + price within
 * 24 hours — without this, the second test to publish a rental would fail on the anti-spam rule
 * rather than on whatever it set out to check. The rule itself is covered explicitly below.
 */
function rentalPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'RENTAL',
    title: `Chilonzorda sherik kerak ${randomUUID()}`,
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
      currentTenants: 2,
      neededTenants: 1,
      gender: 'MALE',
      period: 'MONTHLY',
    },
    ...overrides,
  };
}

/**
 * Student listings — end-to-end against a real database.
 *
 * Covers what unit tests cannot: the envelope, the DTO pipe, the guard, and the visibility rules as
 * two different students actually experience them.
 */
describe('Student listings — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let strangerToken: string;

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
    strangerToken = await register(STRANGER_EMAIL);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function register(email: string): Promise<string> {
    const res = await http()
      .post('/v1/auth/student/register')
      .send({ email, password: 'password123' })
      .expect(201);
    return res.body.result.accessToken as string;
  }

  async function cleanup(): Promise<void> {
    // Listings cascade from the student, so deleting the accounts is enough.
    await prisma.student.deleteMany({
      where: { email: { in: [OWNER_EMAIL, STRANGER_EMAIL] } },
    });
  }

  /** Creates a listing as the owner and returns the response body's `result`. */
  async function create(
    payload: Record<string, unknown>,
    expected = 201,
  ): Promise<Record<string, never> & Record<string, unknown>> {
    const res = await http()
      .post('/v1/student-listings')
      .set('Authorization', auth(ownerToken))
      .send(payload)
      .expect(expected);
    return res.body.result;
  }

  it('rejects an anonymous request with 401', async () => {
    const res = await http().get('/v1/student-listings/mine').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not collide with the business listing routes', async () => {
    // /v1/listings/{id}/submit belongs to business owners and is guarded accordingly; a student
    // token must not reach the student-listing handler through it.
    const res = await http()
      .post('/v1/listings/some-id/submit')
      .set('Authorization', auth(ownerToken));
    expect(res.status).toBe(403);
  });

  describe('drafts', () => {
    it('saves a DRAFT carrying only kind and details', async () => {
      const result = await create({ kind: 'TASK', details: { kind: 'TASK' } });

      expect(result.status).toBe('DRAFT');
      expect(result.title).toBe('');
      expect(result.isMine).toBe(true);
    });

    it('wraps the response in the BaseResponse envelope', async () => {
      const res = await http()
        .post('/v1/student-listings')
        .set('Authorization', auth(ownerToken))
        .send({ kind: 'TASK', details: { kind: 'TASK' } })
        .expect(201);

      expect(res.body).toMatchObject({
        success: true,
        status: 201,
        code: null,
        error: null,
      });
      expect(res.body.result).toBeDefined();
    });
  });

  describe('publishing', () => {
    it('publishes a complete listing straight to ACTIVE, with no moderation step', async () => {
      const result = await create(rentalPayload({ submit: true }));

      expect(result.status).toBe('ACTIVE');
      expect(result.status).not.toBe('PENDING_REVIEW');
    });

    it('publishes to SCHEDULED when the window has not opened yet', async () => {
      const result = await create(
        rentalPayload({ submit: true, validFrom: iso(5), validTo: iso(40) }),
      );

      expect(result.status).toBe('SCHEDULED');
    });

    it('reports validation failures under ListingField keys', async () => {
      const payload = rentalPayload({
        submit: true,
        details: {
          kind: 'RENTAL',
          propertyType: 'APARTMENT',
          roomCount: 3,
          currentTenants: 2,
          neededTenants: 1,
        },
      });

      const res = await http()
        .post('/v1/student-listings')
        .set('Authorization', auth(ownerToken))
        .send(payload)
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('LISTING_VALIDATION_FAILED');
      expect(res.body.error.fields.GENDER).toBe('Kim uchun ekanini tanlang — qiz yoki o‘g‘il');
      expect(res.body.result).toBeNull();
    });

    it('rejects details.kind disagreeing with kind', async () => {
      const res = await http()
        .post('/v1/student-listings')
        .set('Authorization', auth(ownerToken))
        .send({ kind: 'JOB', details: { kind: 'TASK' } })
        .expect(422);

      expect(res.body.error.code).toBe('LISTING_KIND_MISMATCH');
    });

    it('publishes a DRAFT through POST /{id}/submit', async () => {
      const draft = await create(rentalPayload());
      expect(draft.status).toBe('DRAFT');

      const res = await http()
        .post(`/v1/student-listings/${String(draft.id)}/submit`)
        .set('Authorization', auth(ownerToken))
        .expect(200);

      expect(res.body.result.status).toBe('ACTIVE');
    });
  });

  describe('anti-spam', () => {
    it('rejects the same kind + title + price published twice within 24h', async () => {
      const payload = rentalPayload({ submit: true, title: `Takroriy e’lon ${randomUUID()}` });

      await create(payload);
      const res = await http()
        .post('/v1/student-listings')
        .set('Authorization', auth(ownerToken))
        .send(payload)
        .expect(409);

      expect(res.body.error.code).toBe('LISTING_DUPLICATE');
    });
  });

  describe('idempotency', () => {
    it('returns the same listing when the key is replayed', async () => {
      const key = randomUUID();
      const send = () =>
        http()
          .post('/v1/student-listings')
          .set('Authorization', auth(ownerToken))
          .set('Idempotency-Key', key)
          .send(rentalPayload({ title: `Idempotent ${key}` }));

      const first = await send().expect(201);
      const second = await send().expect(201);

      expect(second.body.result.id).toBe(first.body.result.id);
    });
  });

  describe('editing', () => {
    it('rejects a kind change with 409', async () => {
      const draft = await create({ kind: 'TASK', details: { kind: 'TASK' } });

      const res = await http()
        .patch(`/v1/student-listings/${String(draft.id)}`)
        .set('Authorization', auth(ownerToken))
        .send({ kind: 'JOB' })
        .expect(409);

      expect(res.body.error.code).toBe('LISTING_KIND_IMMUTABLE');
    });

    it('keeps an ACTIVE listing ACTIVE after an edit', async () => {
      const listing = await create(rentalPayload({ submit: true, title: 'Tahrir uchun e’lon' }));

      const res = await http()
        .patch(`/v1/student-listings/${String(listing.id)}`)
        .set('Authorization', auth(ownerToken))
        .send({ price: 1_200_000 })
        .expect(200);

      expect(res.body.result.status).toBe('ACTIVE');
      expect(res.body.result.price).toBe(1_200_000);
    });

    it('refuses an edit from a non-owner with 403', async () => {
      const listing = await create(rentalPayload({ title: 'Begona tahrir qilmasin' }));

      const res = await http()
        .patch(`/v1/student-listings/${String(listing.id)}`)
        .set('Authorization', auth(strangerToken))
        .send({ price: 1 })
        .expect(403);

      expect(res.body.error.code).toBe('LISTING_FORBIDDEN');
    });
  });

  describe('visibility', () => {
    it('hides another student’s DRAFT behind a 404, not a 403', async () => {
      const draft = await create(rentalPayload({ title: 'Yashirin qoralama' }));

      const res = await http()
        .get(`/v1/student-listings/${String(draft.id)}`)
        .set('Authorization', auth(strangerToken))
        .expect(404);

      // 403 would confirm the listing exists; §7.2.0 says a stranger must not learn that.
      expect(res.body.error.code).toBe('LISTING_NOT_FOUND');
    });

    it('shows an ACTIVE listing to a stranger with isMine false', async () => {
      const listing = await create(rentalPayload({ submit: true, title: 'Hammaga ko‘rinadi' }));

      const res = await http()
        .get(`/v1/student-listings/${String(listing.id)}`)
        .set('Authorization', auth(strangerToken))
        .expect(200);

      expect(res.body.result.isMine).toBe(false);
      expect(res.body.result.contactPhone).toBe('+998901234567');
    });

    it('nulls contactPhone once the listing is archived', async () => {
      const listing = await create(rentalPayload({ submit: true, title: 'Arxivlanadi' }));

      await http()
        .post(`/v1/student-listings/${String(listing.id)}/status`)
        .set('Authorization', auth(ownerToken))
        .send({ status: 'ARCHIVED' })
        .expect(200);

      const res = await http()
        .get(`/v1/student-listings/${String(listing.id)}`)
        .set('Authorization', auth(ownerToken))
        .expect(200);

      expect(res.body.result.status).toBe('ARCHIVED');
      expect(res.body.result.contactPhone).toBeNull();
    });
  });

  describe('status transitions', () => {
    it('pauses and re-activates', async () => {
      const listing = await create(rentalPayload({ submit: true, title: 'Pauza qilinadi' }));
      const id = String(listing.id);

      const paused = await http()
        .post(`/v1/student-listings/${id}/status`)
        .set('Authorization', auth(ownerToken))
        .send({ status: 'PAUSED' })
        .expect(200);
      expect(paused.body.result.status).toBe('PAUSED');

      const active = await http()
        .post(`/v1/student-listings/${id}/status`)
        .set('Authorization', auth(ownerToken))
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(active.body.result.status).toBe('ACTIVE');
    });

    it('rejects an unsupported status value at the DTO', async () => {
      const draft = await create({ kind: 'TASK', details: { kind: 'TASK' } });

      await http()
        .post(`/v1/student-listings/${String(draft.id)}/status`)
        .set('Authorization', auth(ownerToken))
        .send({ status: 'EXPIRED' })
        .expect(422);
    });
  });

  describe('mine and delete', () => {
    it('lists the owner’s listings in every status', async () => {
      const res = await http()
        .get('/v1/student-listings/mine?page=1&size=50')
        .set('Authorization', auth(ownerToken))
        .expect(200);

      expect(res.body.result).toMatchObject({ page: 1, size: 50 });
      expect(Array.isArray(res.body.result.items)).toBe(true);
      expect(res.body.result.total).toBeGreaterThan(0);
      // `/mine` must not be swallowed by the `:id` route.
      expect(res.body.result.items.every((item: { isMine: boolean }) => item.isMine)).toBe(true);
    });

    it('soft-deletes so the listing disappears from reads', async () => {
      const listing = await create(rentalPayload({ title: 'O‘chiriladi' }));
      const id = String(listing.id);

      await http()
        .delete(`/v1/student-listings/${id}`)
        .set('Authorization', auth(ownerToken))
        .expect(204);

      const res = await http()
        .get(`/v1/student-listings/${id}`)
        .set('Authorization', auth(ownerToken))
        .expect(404);
      expect(res.body.error.code).toBe('LISTING_NOT_FOUND');
    });
  });
});
