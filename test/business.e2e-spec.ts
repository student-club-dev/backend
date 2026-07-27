import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import type { Env } from '../src/config/env';
import { RedisService } from '../src/infrastructure/cache/redis.service';
import { PrismaService } from '../src/infrastructure/database/prisma.service';

/**
 * Business module (owner CRUD) + admin business-type CRUD — e2e. Runs against a real DB + Redis
 * with the Dev SMS provider (dev OTP 111111). Requires ADMIN_API_KEY to be set for the admin block.
 * Written to run manually — NOT part of the default suite.
 */
const DEV_CODE = '111111';

const OWNER_EMAIL = 'e2e-biz-owner@example.com';
const OWNER_PHONE = '+998900000055';
const STUDENT_EMAIL = 'e2e-biz-student@example.com';
const ADMIN_TYPE = 'E2E_TEST_TYPE';

function otpKeys(phone: string): string[] {
  return [
    `otp:business:phone_verify:${phone}`,
    `otp:cooldown:business:phone_verify:${phone}`,
    `otp:resend:business:phone_verify:${phone}`,
  ];
}

describe('Business (owner CRUD) + admin business types — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let adminKey: string | undefined;

  const clearAll = async (): Promise<void> => {
    for (const key of otpKeys(OWNER_PHONE)) {
      await redis.del(key);
    }
    await prisma.business.deleteMany({ where: { owner: { email: OWNER_EMAIL } } });
    await prisma.businessOwner.deleteMany({
      where: { OR: [{ email: OWNER_EMAIL }, { phoneNumber: OWNER_PHONE }] },
    });
    await prisma.student.deleteMany({ where: { email: STUDENT_EMAIL } });
    await prisma.businessTypeInfo.deleteMany({ where: { type: ADMIN_TYPE } });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    adminKey = config.get('ADMIN_API_KEY', { infer: true });
    app.setGlobalPrefix(config.get('API_PREFIX', { infer: true }));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await clearAll();
  });

  afterAll(async () => {
    await clearAll();
    await app.close();
  });

  describe('owner CRUD (phone-verified business account)', () => {
    it('create → get → my → update → immutable-type → archive → 404', async () => {
      // Register a business owner and verify the phone (D1 gate).
      const registered = await request(app.getHttpServer())
        .post('/v1/auth/business/register')
        .send({ email: OWNER_EMAIL, phoneNumber: OWNER_PHONE, password: 'password123' })
        .expect(201);
      const auth = `Bearer ${registered.body.result.accessToken as string}`;

      await request(app.getHttpServer())
        .post('/v1/auth/business/otp/request')
        .set('Authorization', auth)
        .send({ phoneNumber: OWNER_PHONE })
        .expect(200);
      await request(app.getHttpServer())
        .post('/v1/auth/business/otp/verify')
        .set('Authorization', auth)
        .send({ phoneNumber: OWNER_PHONE, code: DEV_CODE })
        .expect(200);

      // Create — starts as DRAFT.
      const created = await request(app.getHttpServer())
        .post('/v1/business')
        .set('Authorization', auth)
        .send({ type: 'NATIONAL_FOOD', name: 'Navruz Cafe', phone: OWNER_PHONE })
        .expect(201);
      // APPROVED, not DRAFT: new businesses are auto-approved for the MVP and moderation is
      // deferred to Level 2 (commit 5315542).
      expect(created.body.result.status).toBe('APPROVED');
      expect(created.body.result.ownerUserId).toBeDefined();
      const businessId = created.body.result.id as string;

      // Get one + list mine.
      await request(app.getHttpServer())
        .get(`/v1/business/${businessId}`)
        .set('Authorization', auth)
        .expect(200);
      const mine = await request(app.getHttpServer())
        .get('/v1/business/my')
        .set('Authorization', auth)
        .expect(200);
      expect(mine.body.result).toHaveLength(1);

      // Update the name.
      const updated = await request(app.getHttpServer())
        .put(`/v1/business/${businessId}`)
        .set('Authorization', auth)
        .send({ name: 'Navruz Cafe 2' })
        .expect(200);
      expect(updated.body.result.name).toBe('Navruz Cafe 2');

      // The type is immutable.
      const immutable = await request(app.getHttpServer())
        .put(`/v1/business/${businessId}`)
        .set('Authorization', auth)
        .send({ type: 'PLAYSTATION' })
        .expect(422);
      expect(immutable.body.error.code).toBe('BUSINESS_TYPE_IMMUTABLE');

      // Archive (soft-delete) → 200 result null.
      const archived = await request(app.getHttpServer())
        .delete(`/v1/business/${businessId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(archived.body.result).toBeNull();

      // The archived business is gone from reads.
      const afterArchive = await request(app.getHttpServer())
        .get(`/v1/business/${businessId}`)
        .set('Authorization', auth)
        .expect(404);
      expect(afterArchive.body.error.code).toBe('BUSINESS_NOT_FOUND');
      const emptyList = await request(app.getHttpServer())
        .get('/v1/business/my')
        .set('Authorization', auth)
        .expect(200);
      expect(emptyList.body.result).toHaveLength(0);
    });

    it('rejects creation without a verified phone (403 PHONE_NOT_VERIFIED)', async () => {
      const registered = await request(app.getHttpServer())
        .post('/v1/auth/business/register')
        .send({ email: `unverified-${OWNER_EMAIL}`, password: 'password123' })
        .expect(201);
      const auth = `Bearer ${registered.body.result.accessToken as string}`;

      const res = await request(app.getHttpServer())
        .post('/v1/business')
        .set('Authorization', auth)
        .send({ type: 'NATIONAL_FOOD', name: 'No Phone', phone: '+998900000056' })
        .expect(403);
      expect(res.body.error.code).toBe('PHONE_NOT_VERIFIED');

      await prisma.businessOwner.deleteMany({ where: { email: `unverified-${OWNER_EMAIL}` } });
    });

    it('rejects a student token with 403 FORBIDDEN', async () => {
      const student = await request(app.getHttpServer())
        .post('/v1/auth/student/register')
        .send({ email: STUDENT_EMAIL, password: 'password123' })
        .expect(201);
      const auth = `Bearer ${student.body.result.accessToken as string}`;

      const res = await request(app.getHttpServer())
        .post('/v1/business')
        .set('Authorization', auth)
        .send({ type: 'NATIONAL_FOOD', name: 'Nope', phone: '+998900000057' })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('admin business-type CRUD (X-Admin-Key)', () => {
    it('rejects a request without a valid admin key (403)', async () => {
      await request(app.getHttpServer())
        .post('/v1/admin/business-types')
        .send({ type: ADMIN_TYPE, nameUz: 'Test', defaultPriceUnit: 'PER_ITEM' })
        .expect(403);
    });

    it('creates then deletes a business type', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/admin/business-types')
        .set('X-Admin-Key', adminKey ?? '')
        .send({
          type: ADMIN_TYPE,
          groupKey: 'SHOPPING',
          nameUz: 'Test turi',
          defaultPriceUnit: 'PER_ITEM',
        })
        .expect(201);
      expect(created.body.result.type).toBe(ADMIN_TYPE);

      // Duplicate key → 409.
      const dup = await request(app.getHttpServer())
        .post('/v1/admin/business-types')
        .set('X-Admin-Key', adminKey ?? '')
        .send({
          type: ADMIN_TYPE,
          groupKey: 'SHOPPING',
          nameUz: 'Test turi',
          defaultPriceUnit: 'PER_ITEM',
        })
        .expect(409);
      expect(dup.body.error.code).toBe('BUSINESS_TYPE_EXISTS');

      // Unreferenced → delete succeeds.
      const deleted = await request(app.getHttpServer())
        .delete(`/v1/admin/business-types/${ADMIN_TYPE}`)
        .set('X-Admin-Key', adminKey ?? '')
        .expect(200);
      expect(deleted.body.result).toBeNull();
    });
  });
});
