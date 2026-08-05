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

const EMAIL = 'e2e-profile-address@example.com';

/**
 * The address round-trip (mobile 01-QOLGAN_ISHLAR §2).
 *
 * `PATCH /v1/profile/me` accepted `regionId`/`districtId` from the day the job digest needed them,
 * but `GET` never returned them — so the value went to the server and could not be read back. The
 * app worked around it by keeping the address in a local cache, which broke on reinstall and on a
 * second device: the user saw an empty field for something they had already filled in.
 *
 * A unit test cannot show this. The bug lived in the gap between the write DTO, the domain entity
 * and the read DTO, and only a real round-trip crosses all three.
 */
describe('Profile address round-trip — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const auth = (): string => `Bearer ${token}`;

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

    const res = await request(app.getHttpServer())
      .post('/v1/auth/student/register')
      .send({ email: EMAIL, password: 'password123' })
      .expect(201);
    token = res.body.result.accessToken as string;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup(): Promise<void> {
    await prisma.student.deleteMany({ where: { email: EMAIL } });
  }

  const getProfile = (): request.Test =>
    request(app.getHttpServer()).get('/v1/profile/me').set('Authorization', auth()).expect(200);

  const patchProfile = (body: object): request.Test =>
    request(app.getHttpServer()).put('/v1/profile/me').set('Authorization', auth()).send(body);

  it('returns null for both before anything is set', async () => {
    const res = await getProfile();

    expect(res.body.result.regionId).toBeNull();
    expect(res.body.result.districtId).toBeNull();
  });

  it('returns the address that was written — the whole point', async () => {
    await patchProfile({ regionId: 'TOSHKENT_SHAHRI', districtId: 'CHILONZOR' }).expect(200);

    const res = await getProfile();
    expect(res.body.result.regionId).toBe('TOSHKENT_SHAHRI');
    expect(res.body.result.districtId).toBe('CHILONZOR');
  });

  it('persists it — a fresh read, not an echo of the write', async () => {
    const row = await prisma.student.findUniqueOrThrow({ where: { email: EMAIL } });

    expect(row.regionId).toBe('TOSHKENT_SHAHRI');
    expect(row.districtId).toBe('CHILONZOR');
  });

  it('leaves the address alone when the update does not mention it', async () => {
    await patchProfile({ firstName: 'Aziz' }).expect(200);

    const res = await getProfile();
    expect(res.body.result.firstName).toBe('Aziz');
    expect(res.body.result.regionId).toBe('TOSHKENT_SHAHRI');
  });

  /**
   * Not a foreign key, deliberately: the seeded district set and the client's GeoCatalog have not
   * been reconciled, and a hard FK would reject a legitimate pin the moment the two lists drift.
   */
  it('accepts an id the seed does not have yet', async () => {
    await patchProfile({ regionId: 'FUTURE_REGION', districtId: 'FUTURE_DISTRICT' }).expect(200);

    const res = await getProfile();
    expect(res.body.result.regionId).toBe('FUTURE_REGION');
  });
});
