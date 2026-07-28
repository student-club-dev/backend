import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthProvider } from '../src/common/enums/auth-provider.enum';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import type { Env } from '../src/config/env';
import { RedisService } from '../src/infrastructure/cache/redis.service';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { OAuthIdentity, OAuthProvider } from '../src/modules/auth/domain/oauth/oauth-provider';
import { GoogleOAuthProvider } from '../src/modules/auth/infrastructure/oauth/google-oauth.provider';

/**
 * M-auth pod-4 — device sessions (D3), set/change password (D9) and SMS password reset (D5) for the
 * student app. Runs against a real DB + Redis with the Dev SMS provider (dev code 111111); the Google
 * provider is faked so the OAuth-account set-password path runs without a real token. Run manually.
 */
class FakeGoogleOAuthProvider implements OAuthProvider {
  identity: OAuthIdentity = {
    provider: AuthProvider.GOOGLE,
    providerAccountId: 'unset',
    email: null,
    emailVerified: false,
    firstName: null,
    lastName: null,
    avatarUrl: null,
  };

  verify(): Promise<OAuthIdentity> {
    return Promise.resolve(this.identity);
  }
}

const DEV_CODE = '111111';

const EMAIL_SESSIONS = 'e2e-p4-sessions@example.com';
const EMAIL_OAUTH = 'e2e-p4-oauth@example.com';
const SUB_OAUTH = 'e2e-p4-google-sub';
const PHONE_RESET = '+998900000021';

function resetKeys(phone: string): string[] {
  return [
    `otp:student:phone_verify:${phone}`,
    `otp:cooldown:student:phone_verify:${phone}`,
    `otp:resend:student:phone_verify:${phone}`,
    `otp:student:password_reset:${phone}`,
    `otp:cooldown:student:password_reset:${phone}`,
    `otp:resend:student:password_reset:${phone}`,
  ];
}

describe('Auth account (student) — sessions, set/reset password — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const fakeGoogle = new FakeGoogleOAuthProvider();

  const clearAll = async (): Promise<void> => {
    for (const key of resetKeys(PHONE_RESET)) {
      await redis.del(key);
    }
    await prisma.student.deleteMany({
      where: {
        OR: [{ email: { in: [EMAIL_SESSIONS, EMAIL_OAUTH] } }, { phoneNumber: PHONE_RESET }],
      },
    });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleOAuthProvider)
      .useValue(fakeGoogle)
      .compile();

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
    await clearAll();
  });

  afterAll(async () => {
    await clearAll();
    await app.close();
  });

  describe('device sessions (D3)', () => {
    it('lists two sessions, revokes one, then logs out of all', async () => {
      const registered = await request(app.getHttpServer())
        .post('/v1/auth/student/register')
        .send({ email: EMAIL_SESSIONS, password: 'password123', deviceName: 'iPhone 15' })
        .expect(201);
      const accessToken = registered.body.result.accessToken as string;

      // A second login → a second device session.
      await request(app.getHttpServer())
        .post('/v1/auth/student/login')
        .send({ email: EMAIL_SESSIONS, password: 'password123', deviceName: 'Pixel 8' })
        .expect(200);

      const auth = `Bearer ${accessToken}`;

      const listed = await request(app.getHttpServer())
        .get('/v1/auth/student/sessions')
        .set('Authorization', auth)
        .expect(200);
      const sessions = listed.body.result as Array<{ id: string; tokenHash?: unknown }>;
      expect(sessions).toHaveLength(2);
      // The token hash is never exposed.
      expect(sessions[0]).not.toHaveProperty('tokenHash');

      // Revoke a single session → one left.
      await request(app.getHttpServer())
        .delete(`/v1/auth/student/sessions/${sessions[0].id}`)
        .set('Authorization', auth)
        .expect(200);

      const afterDelete = await request(app.getHttpServer())
        .get('/v1/auth/student/sessions')
        .set('Authorization', auth)
        .expect(200);
      expect(afterDelete.body.result).toHaveLength(1);

      // Revoking an already-revoked / unknown session id → 404 SESSION_NOT_FOUND.
      const notFound = await request(app.getHttpServer())
        .delete(`/v1/auth/student/sessions/${sessions[0].id}`)
        .set('Authorization', auth)
        .expect(404);
      expect(notFound.body.error.code).toBe('SESSION_NOT_FOUND');

      // Logout everywhere → zero sessions (the access token is stateless, so the list still loads).
      await request(app.getHttpServer())
        .post('/v1/auth/student/sessions/logout-all')
        .set('Authorization', auth)
        .expect(200);

      const afterLogoutAll = await request(app.getHttpServer())
        .get('/v1/auth/student/sessions')
        .set('Authorization', auth)
        .expect(200);
      expect(afterLogoutAll.body.result).toHaveLength(0);
    });
  });

  describe('set / change password (D9)', () => {
    it('an OAuth-only account sets, then changes, its password', async () => {
      fakeGoogle.identity = {
        provider: AuthProvider.GOOGLE,
        providerAccountId: SUB_OAUTH,
        email: EMAIL_OAUTH,
        emailVerified: true,
        firstName: 'Ali',
        lastName: 'Valiev',
        avatarUrl: null,
      };

      const oauth = await request(app.getHttpServer())
        .post('/v1/auth/student/oauth/google')
        .send({ idToken: 'fake-token' })
        .expect(200);
      const auth = `Bearer ${oauth.body.result.accessToken as string}`;

      // First-time set — no current password required.
      await request(app.getHttpServer())
        .post('/v1/auth/student/password/set')
        .set('Authorization', auth)
        .send({ newPassword: 'firstpass123' })
        .expect(200);

      // The account can now log in with email + password.
      await request(app.getHttpServer())
        .post('/v1/auth/student/login')
        .send({ email: EMAIL_OAUTH, password: 'firstpass123' })
        .expect(200);

      // A wrong current password on a change → 401 INVALID_CREDENTIALS.
      const wrong = await request(app.getHttpServer())
        .post('/v1/auth/student/password/set')
        .set('Authorization', auth)
        .send({ currentPassword: 'not-it', newPassword: 'secondpass123' })
        .expect(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

      // Correct current password → change succeeds.
      await request(app.getHttpServer())
        .post('/v1/auth/student/password/set')
        .set('Authorization', auth)
        .send({ currentPassword: 'firstpass123', newPassword: 'secondpass123' })
        .expect(200);

      // The new password works; the old one no longer does.
      await request(app.getHttpServer())
        .post('/v1/auth/student/login')
        .send({ email: EMAIL_OAUTH, password: 'secondpass123' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/v1/auth/student/login')
        .send({ email: EMAIL_OAUTH, password: 'firstpass123' })
        .expect(401);
    });
  });

  describe('password reset via SMS (D5)', () => {
    it('register → verify phone → forgot → reset → login with the new password; old refresh token revoked', async () => {
      const registered = await request(app.getHttpServer())
        .post('/v1/auth/student/register')
        .send({ phoneNumber: PHONE_RESET, password: 'password123' })
        .expect(201);
      const auth = `Bearer ${registered.body.result.accessToken as string}`;
      const oldRefreshToken = registered.body.result.refreshToken as string;

      // Verify the phone so a reset OTP is allowed to be sent.
      await request(app.getHttpServer())
        .post('/v1/auth/student/otp/request')
        .set('Authorization', auth)
        .send({ phoneNumber: PHONE_RESET })
        .expect(200);
      await request(app.getHttpServer())
        .post('/v1/auth/student/otp/verify')
        .set('Authorization', auth)
        .send({ phoneNumber: PHONE_RESET, code: DEV_CODE })
        .expect(200);

      // Forgot always succeeds (anti-enumeration) and sends a password_reset OTP here.
      await request(app.getHttpServer())
        .post('/v1/auth/student/password/forgot')
        .send({ phoneNumber: PHONE_RESET })
        .expect(200);

      // Reset with the dev OTP.
      const reset = await request(app.getHttpServer())
        .post('/v1/auth/student/password/reset')
        .send({ phoneNumber: PHONE_RESET, code: DEV_CODE, newPassword: 'reset12345' })
        .expect(200);
      expect(reset.body.result).toEqual({ reset: true });

      // The new password logs in.
      await request(app.getHttpServer())
        .post('/v1/auth/student/login')
        .send({ phoneNumber: PHONE_RESET, password: 'reset12345' })
        .expect(200);

      // All pre-reset refresh tokens were revoked (D3) — the old one no longer rotates.
      const refreshed = await request(app.getHttpServer())
        .post('/v1/auth/student/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401);
      expect(refreshed.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('forgot for an unknown phone still returns success (anti-enumeration)', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/student/password/forgot')
        .send({ phoneNumber: '+998900000099' })
        .expect(200);
    });
  });
});
