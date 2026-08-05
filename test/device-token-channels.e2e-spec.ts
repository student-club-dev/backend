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
import {
  DEVICE_TOKEN_REPOSITORY,
  type DeviceTokenRepository,
} from '../src/modules/notifications/domain/device-token.repository';
import { DeviceTokenType } from '../src/modules/notifications/domain/enums/device-token-type.enum';

const EMAIL = 'e2e-device-channels@example.com';

const APNS_TOKEN = 'a'.repeat(64);
const VOIP_TOKEN = 'b'.repeat(64);
const FCM_TOKEN = 'android-fcm-token';

/**
 * The channel split, against real SQL (calls spec §7.3).
 *
 * This is the one property in the calls work whose failure is invisible and expensive: an ordinary
 * notification delivered on the VoIP channel makes iOS kill the app, and a device that sees that a
 * few times stops receiving VoIP pushes **for good** — the user simply never gets called again, and
 * nothing anywhere looks broken. The exclusion lives in a `where` clause, so only a test against
 * the database can prove it holds.
 */
describe('Device token channels — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let devices: DeviceTokenRepository;
  let token: string;
  let studentId: string;

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
    devices = app.get(DEVICE_TOKEN_REPOSITORY);
    await cleanup();

    const res = await request(app.getHttpServer())
      .post('/v1/auth/student/register')
      .send({ email: EMAIL, password: 'password123' })
      .expect(201);
    token = res.body.result.accessToken as string;
    studentId = (await prisma.student.findUniqueOrThrow({ where: { email: EMAIL } })).id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup(): Promise<void> {
    await prisma.student.deleteMany({ where: { email: EMAIL } });
  }

  function register(body: object): request.Test {
    return request(app.getHttpServer())
      .post('/v1/devices')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('defaults an iPhone to APNS, not FCM — this backend talks to Apple directly', async () => {
    await register({ token: APNS_TOKEN, platform: 'IOS' }).expect(200);

    const row = await prisma.deviceToken.findUniqueOrThrow({ where: { token: APNS_TOKEN } });
    expect(row.tokenType).toBe('APNS');
  });

  it('defaults Android to FCM', async () => {
    await register({ token: FCM_TOKEN, platform: 'ANDROID' }).expect(200);

    const row = await prisma.deviceToken.findUniqueOrThrow({ where: { token: FCM_TOKEN } });
    expect(row.tokenType).toBe('FCM');
  });

  it('stores the PushKit token as a second row — one iPhone, two tokens (§7.3)', async () => {
    await register({ token: VOIP_TOKEN, platform: 'IOS', tokenType: 'APNS_VOIP' }).expect(200);

    const rows = await prisma.deviceToken.findMany({ where: { studentId } });
    expect(rows).toHaveLength(3);
    // The ordinary iOS row survived: replacing one with the other is what silently disables either
    // messages or calls.
    expect(rows.map((row) => row.token).sort()).toEqual([APNS_TOKEN, FCM_TOKEN, VOIP_TOKEN].sort());
  });

  it('⛔ never hands a VoIP token to an ordinary notification', async () => {
    const targets = await devices.targetsFor(studentId);

    expect(targets.map((target) => target.token).sort()).toEqual([APNS_TOKEN, FCM_TOKEN].sort());
    expect(targets.some((target) => target.tokenType === DeviceTokenType.APNS_VOIP)).toBe(false);
  });

  it('selects only the VoIP token for a call', async () => {
    const targets = await devices.callTargetsFor(studentId, DeviceTokenType.APNS_VOIP);

    expect(targets).toHaveLength(1);
    expect(targets[0].token).toBe(VOIP_TOKEN);
  });

  it('rejects a PushKit registration whose token is not APNs-shaped', async () => {
    await register({ token: 'not-a-token', platform: 'IOS', tokenType: 'APNS_VOIP' }).expect(422);
  });

  it('rejects an unknown tokenType', async () => {
    await register({ token: APNS_TOKEN, platform: 'IOS', tokenType: 'PIGEON' }).expect(422);
  });
});
