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
 * Real OTP phone-verification flow (D1) for the student app. Runs against a real DB + Redis with the
 * default Dev SMS provider (SMS_PROVIDER=dev), so the code is the fixed dev code 111111. Run manually.
 */
const EMAIL = 'e2e-otp-student@example.com';
const PHONE_OK = '+998900000011';
const PHONE_WRONG = '+998900000012';
const PHONE_EXPIRED = '+998900000013';
const DEV_CODE = '111111';

function otpKeys(phone: string): string[] {
  return [
    `otp:student:${phone}`,
    `otp:cooldown:student:${phone}`,
    `otp:resend:student:${phone}`,
  ];
}

describe('OTP phone verification (student) — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let accessToken: string;

  const auth = (): string => `Bearer ${accessToken}`;

  const clearKeys = async (): Promise<void> => {
    for (const phone of [PHONE_OK, PHONE_WRONG, PHONE_EXPIRED]) {
      for (const key of otpKeys(phone)) {
        await redis.del(key);
      }
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    app.setGlobalPrefix(config.get('API_PREFIX', { infer: true }));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    await prisma.student.deleteMany({ where: { email: EMAIL } });
    await clearKeys();

    const registered = await request(app.getHttpServer())
      .post('/v1/auth/student/register')
      .send({ email: EMAIL, password: 'password123' })
      .expect(201);
    accessToken = registered.body.result.accessToken as string;
  });

  afterAll(async () => {
    await clearKeys();
    await prisma.student.deleteMany({ where: { email: EMAIL } });
    await app.close();
  });

  it('rejects an unauthenticated OTP request', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/student/otp/request')
      .send({ phoneNumber: PHONE_OK })
      .expect(401);
  });

  it('requests then verifies the OTP and marks the account phone verified', async () => {
    const requested = await request(app.getHttpServer())
      .post('/v1/auth/student/otp/request')
      .set('Authorization', auth())
      .send({ phoneNumber: PHONE_OK })
      .expect(200);
    expect(requested.body.result).toMatchObject({ sent: true, expiresInSeconds: 300 });

    const verified = await request(app.getHttpServer())
      .post('/v1/auth/student/otp/verify')
      .set('Authorization', auth())
      .send({ phoneNumber: PHONE_OK, code: DEV_CODE })
      .expect(200);
    expect(verified.body.result).toEqual({ verified: true });

    const student = await prisma.student.findUnique({ where: { email: EMAIL } });
    expect(student?.phoneVerified).toBe(true);
    expect(student?.phoneNumber).toBe(PHONE_OK);
  });

  it('rejects a wrong code with OTP_INVALID', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/student/otp/request')
      .set('Authorization', auth())
      .send({ phoneNumber: PHONE_WRONG })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/v1/auth/student/otp/verify')
      .set('Authorization', auth())
      .send({ phoneNumber: PHONE_WRONG, code: '000000' })
      .expect(422);
    expect(res.body.error.code).toBe('OTP_INVALID');
  });

  it('rejects verification of a never-requested phone with OTP_EXPIRED', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/student/otp/verify')
      .set('Authorization', auth())
      .send({ phoneNumber: PHONE_EXPIRED, code: DEV_CODE })
      .expect(410);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });
});
