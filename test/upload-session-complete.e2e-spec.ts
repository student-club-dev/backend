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

const EMAIL = 'e2e-upload-complete@example.com';

/**
 * `POST /v1/media/upload/{id}/complete` — the HTTP contract of its now-optional body.
 *
 * The unit tests cover the size arithmetic against real part storage. What they cannot cover is the
 * bit that would break existing clients: the global `ValidationPipe` runs with
 * `forbidNonWhitelisted: true`, so adding a `@Body()` to an endpoint that never had one is exactly
 * the kind of change that turns a working call into a 400. These assertions exist to prove it does
 * not.
 *
 * Sessions are opened and left empty on purpose — reaching `UPLOAD_INCOMPLETE` means the body was
 * accepted and bound, which is the whole question. No media has to exist for that.
 */
describe('Resumable upload — complete body contract (e2e)', () => {
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

  /** A story-kind session needs no conversation, which keeps this test about the body alone. */
  async function openSession(totalBytes: number): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/media/upload/init')
      .set('Authorization', auth())
      .send({ kind: 'STORY_IMAGE', totalBytes })
      .expect(200);
    return res.body.result.uploadId as string;
  }

  it('reports the bound as totalBytes and hands back a part size', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/media/upload/init')
      .set('Authorization', auth())
      .send({ kind: 'STORY_IMAGE', totalBytes: 10 * 1024 * 1024 })
      .expect(200);

    expect(res.body.result.chunkSize).toBe(5 * 1024 * 1024);
    expect(res.body.result.totalBytes).toBe(10 * 1024 * 1024);
    expect(res.body.result.received).toEqual([]);
  });

  it('accepts complete with no body at all — the pre-existing client call', async () => {
    const uploadId = await openSession(1024);

    // The point: 422 UPLOAD_INCOMPLETE, *not* a 400 from the validation pipe.
    const res = await request(app.getHttpServer())
      .post(`/v1/media/upload/${uploadId}/complete`)
      .set('Authorization', auth())
      .expect(422);
    expect(res.body.error.code).toBe('UPLOAD_INCOMPLETE');
  });

  it('accepts complete with an explicit empty body', async () => {
    const uploadId = await openSession(1024);

    const res = await request(app.getHttpServer())
      .post(`/v1/media/upload/${uploadId}/complete`)
      .set('Authorization', auth())
      .send({})
      .expect(422);
    expect(res.body.error.code).toBe('UPLOAD_INCOMPLETE');
  });

  it('accepts complete carrying the real size', async () => {
    const uploadId = await openSession(1024);

    const res = await request(app.getHttpServer())
      .post(`/v1/media/upload/${uploadId}/complete`)
      .set('Authorization', auth())
      .send({ totalBytes: 512 })
      .expect(422);
    expect(res.body.error.code).toBe('UPLOAD_INCOMPLETE');
  });

  it('rejects a non-integer size rather than coercing it', async () => {
    const uploadId = await openSession(1024);

    await request(app.getHttpServer())
      .post(`/v1/media/upload/${uploadId}/complete`)
      .set('Authorization', auth())
      .send({ totalBytes: 'lots' })
      .expect(422);
  });

  it('still refuses an unknown field, so the body is genuinely validated', async () => {
    const uploadId = await openSession(1024);

    await request(app.getHttpServer())
      .post(`/v1/media/upload/${uploadId}/complete`)
      .set('Authorization', auth())
      .send({ totalBytes: 512, sneaky: true })
      .expect(422);
  });
});
