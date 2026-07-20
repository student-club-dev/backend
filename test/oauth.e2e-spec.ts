import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthProvider } from '../src/common/enums/auth-provider.enum';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import type { Env } from '../src/config/env';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import {
  OAuthIdentity,
  OAuthProvider,
} from '../src/modules/auth/domain/oauth/oauth-provider';
import { GoogleOAuthProvider } from '../src/modules/auth/infrastructure/oauth/google-oauth.provider';

/**
 * Real-flow OAuth coverage without a real Google token: GoogleOAuthProvider is overridden with a
 * fake returning a canned identity, so the actual /v1/auth/student/oauth/google endpoint and the
 * D4 account-resolution flow run end-to-end against the DB. Needs a database (run manually).
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

/** The access token's `sub` (account id) — decoded without verifying (we only need the claim). */
function decodeSub(accessToken: string): string {
  const payload = accessToken.split('.')[1];
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return (JSON.parse(json) as { sub: string }).sub;
}

const EMAIL_CREATE = 'e2e-oauth-create@example.com';
const EMAIL_LINK = 'e2e-oauth-link@example.com';
const SUB_CREATE = 'e2e-google-sub-create';
const SUB_LINK = 'e2e-google-sub-link';

describe('OAuth (student) — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const fakeGoogle = new FakeGoogleOAuthProvider();

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
    await prisma.student.deleteMany({ where: { email: { in: [EMAIL_CREATE, EMAIL_LINK] } } });
  });

  afterAll(async () => {
    await prisma.student.deleteMany({ where: { email: { in: [EMAIL_CREATE, EMAIL_LINK] } } });
    await app.close();
  });

  it('creates an account on first Google login and reuses it on the second', async () => {
    fakeGoogle.identity = {
      provider: AuthProvider.GOOGLE,
      providerAccountId: SUB_CREATE,
      email: EMAIL_CREATE,
      emailVerified: true,
      firstName: 'Ali',
      lastName: 'Valiev',
      avatarUrl: null,
    };

    const first = await request(app.getHttpServer())
      .post('/v1/auth/student/oauth/google')
      .send({ idToken: 'fake-token' })
      .expect(200);
    const second = await request(app.getHttpServer())
      .post('/v1/auth/student/oauth/google')
      .send({ idToken: 'fake-token' })
      .expect(200);

    const firstId = decodeSub(first.body.result.accessToken);
    const secondId = decodeSub(second.body.result.accessToken);
    expect(firstId).toBe(secondId);

    const links = await prisma.studentOAuthAccount.count({
      where: { providerAccountId: SUB_CREATE },
    });
    expect(links).toBe(1);
  });

  it('links a Google identity to an existing account with the same verified email', async () => {
    const registered = await request(app.getHttpServer())
      .post('/v1/auth/student/register')
      .send({ email: EMAIL_LINK, password: 'password123' })
      .expect(201);
    const registeredId = decodeSub(registered.body.result.accessToken);

    fakeGoogle.identity = {
      provider: AuthProvider.GOOGLE,
      providerAccountId: SUB_LINK,
      email: EMAIL_LINK,
      emailVerified: true,
      firstName: null,
      lastName: null,
      avatarUrl: null,
    };

    const oauth = await request(app.getHttpServer())
      .post('/v1/auth/student/oauth/google')
      .send({ idToken: 'fake-token' })
      .expect(200);
    const oauthId = decodeSub(oauth.body.result.accessToken);

    expect(oauthId).toBe(registeredId);
  });
});
