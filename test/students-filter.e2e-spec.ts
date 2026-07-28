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

const ME_EMAIL = 'e2e-dir-me@example.com';
const A_EMAIL = 'e2e-dir-a@example.com';
const B_EMAIL = 'e2e-dir-b@example.com';
const C_EMAIL = 'e2e-dir-c@example.com';
const EMAILS = [ME_EMAIL, A_EMAIL, B_EMAIL, C_EMAIL];

interface Row {
  id: string;
  universityId: string | null;
  gender: string | null;
  courseYear: string | null;
  online: boolean;
  lastSeenAt: string | null;
  connectionStatus: string;
}

/**
 * `GET /v1/students` — the filtered directory that replaced the search-only endpoint, plus the
 * presence-visibility rule and the conversation read cursors. Runs against a real database.
 */
describe('Students directory (filters + presence visibility) — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let meToken: string;
  let aToken: string;
  let bToken: string;
  let meId: string;
  let aId: string;
  let bId: string;
  let cId: string;

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
    await cleanup();

    meToken = await register(ME_EMAIL);
    aToken = await register(A_EMAIL);
    bToken = await register(B_EMAIL);
    await register(C_EMAIL);
    meId = await idOf(ME_EMAIL);
    aId = await idOf(A_EMAIL);
    bId = await idOf(B_EMAIL);
    cId = await idOf(C_EMAIL);

    // A: TATU, 2nd year, male.  B: INHA, master, female.  C: TATU, 2nd year, female.
    await patchProfile(aToken, {
      universityId: 'emis-142',
      courseYear: '2',
      gender: 'MALE',
      birthYear: 2004,
    });
    await patchProfile(bToken, {
      universityId: 'emis-77',
      courseYear: 'MASTER',
      gender: 'FEMALE',
      birthYear: 2000,
    });
    await prisma.student.update({
      where: { id: cId },
      data: { universityId: 'emis-142', courseYear: 'YEAR_2', gender: 'FEMALE', birthYear: 2005 },
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function register(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/student/register')
      .send({ email, password: 'password123' })
      .expect(201);
    return res.body.result.accessToken as string;
  }

  async function idOf(email: string): Promise<string> {
    return (await prisma.student.findUniqueOrThrow({ where: { email } })).id;
  }

  async function patchProfile(token: string, body: Record<string, unknown>): Promise<void> {
    await request(app.getHttpServer())
      .put('/v1/profile/me')
      .set('Authorization', auth(token))
      .send(body)
      .expect(200);
  }

  /** The directory as `me` sees it, restricted to the four accounts this suite created. */
  async function list(query: string, token = meToken): Promise<Row[]> {
    const res = await request(app.getHttpServer())
      .get(`/v1/students${query}`)
      .set('Authorization', auth(token))
      .expect(200);
    const mine = new Set([meId, aId, bId, cId]);
    return (res.body.result.items as Row[]).filter((item) => mine.has(item.id));
  }

  async function cleanup(): Promise<void> {
    const students = await prisma.student.findMany({ where: { email: { in: EMAILS } } });
    const ids = students.map((s) => s.id);
    if (ids.length > 0) {
      await prisma.conversation.deleteMany({
        where: { members: { some: { studentId: { in: ids } } } },
      });
    }
    await prisma.student.deleteMany({ where: { email: { in: EMAILS } } });
  }

  it('rejects an anonymous call with 401', async () => {
    const res = await request(app.getHttpServer()).get('/v1/students').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns a paginated list with no filters, excluding the caller', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/students?size=100')
      .set('Authorization', auth(meToken))
      .expect(200);

    expect(res.body.result).toMatchObject({ page: 1, size: 100 });
    expect(typeof res.body.result.hasNext).toBe('boolean');
    const ids = (res.body.result.items as Row[]).map((item) => item.id);
    expect(ids).not.toContain(meId);
    expect(ids).toEqual(expect.arrayContaining([aId, bId, cId]));
  });

  it('exposes the discovery fields the client filters on', async () => {
    const rows = await list('?size=100');
    const a = rows.find((row) => row.id === aId);
    expect(a).toMatchObject({
      universityId: 'emis-142',
      gender: 'MALE',
      courseYear: '2',
      connectionStatus: 'NONE',
    });
  });

  it('filters by universityId', async () => {
    const rows = await list('?universityId=emis-142&size=100');
    expect(rows.map((row) => row.id).sort()).toEqual([aId, cId].sort());
  });

  it('accepts several universityIds, comma-separated', async () => {
    const rows = await list('?universityId=emis-142,emis-77&size=100');
    expect(rows.map((row) => row.id).sort()).toEqual([aId, bId, cId].sort());
  });

  it('combines universityId + courseYear + gender (AND)', async () => {
    const rows = await list('?universityId=emis-142&courseYear=2&gender=FEMALE&size=100');
    expect(rows.map((row) => row.id)).toEqual([cId]);
  });

  it('filters by a birth-year range', async () => {
    const rows = await list('?birthYearFrom=2004&birthYearTo=2006&size=100');
    expect(rows.map((row) => row.id).sort()).toEqual([aId, cId].sort());
  });

  it('rejects an unknown enum value with 422', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/students?gender=OTHER')
      .set('Authorization', auth(meToken))
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty('gender');
  });

  it('narrows by connectionStatus once a connection exists', async () => {
    const sent = await request(app.getHttpServer())
      .post('/v1/connections/requests')
      .set('Authorization', auth(meToken))
      .send({ addresseeId: aId })
      .expect(201);

    // Still only a pending request: PENDING_OUT sees A, CONNECTED sees nobody.
    expect((await list('?connectionStatus=PENDING_OUT&size=100')).map((row) => row.id)).toEqual([
      aId,
    ]);
    expect(await list('?connectionStatus=CONNECTED&size=100')).toEqual([]);
    // NONE excludes every existing relationship — A has one, so A drops out.
    expect((await list('?connectionStatus=NONE&size=100')).map((row) => row.id).sort()).toEqual(
      [bId, cId].sort(),
    );

    await request(app.getHttpServer())
      .post(`/v1/connections/requests/${sent.body.result.id}/accept`)
      .set('Authorization', auth(aToken))
      .expect(200);

    const connected = await list('?connectionStatus=CONNECTED&size=100');
    expect(connected.map((row) => row.id)).toEqual([aId]);
    expect(connected[0]?.connectionStatus).toBe('CONNECTED');
  });

  it('hides last-seen from a non-connection but shows it to a connection (CONNECTIONS default)', async () => {
    const seen = new Date('2026-07-20T10:00:00Z');
    await prisma.student.updateMany({
      where: { id: { in: [aId, bId] } },
      data: { lastSeenAt: seen },
    });

    const rows = await list('?size=100');
    // A is connected (previous test) → visible. B is a stranger → hidden.
    expect(rows.find((row) => row.id === aId)?.lastSeenAt).toBe(seen.toISOString());
    expect(rows.find((row) => row.id === bId)?.lastSeenAt).toBeNull();
  });

  it('shows last-seen to everyone once the student opts into EVERYONE', async () => {
    await patchProfile(bToken, { lastSeenVisibility: 'EVERYONE' });

    const profile = await request(app.getHttpServer())
      .get('/v1/profile/me')
      .set('Authorization', auth(bToken))
      .expect(200);
    expect(profile.body.result.lastSeenVisibility).toBe('EVERYONE');

    const rows = await list('?size=100');
    expect(rows.find((row) => row.id === bId)?.lastSeenAt).toBe('2026-07-20T10:00:00.000Z');
  });

  it('hides last-seen even from a connection once the student picks NOBODY', async () => {
    await patchProfile(aToken, { lastSeenVisibility: 'NOBODY' });

    const rows = await list('?size=100');
    const a = rows.find((row) => row.id === aId);
    expect(a?.lastSeenAt).toBeNull();
    expect(a?.online).toBe(false);
  });

  it('keeps the deprecated /students/search working, now with an optional q', async () => {
    const withQuery = await request(app.getHttpServer())
      .get('/v1/students/search?q=e2e-dir')
      .set('Authorization', auth(meToken))
      .expect(200);
    expect(Array.isArray(withQuery.body.result.items)).toBe(true);

    // `q` used to be required (422); it is now optional and behaves like the full list.
    const withoutQuery = await request(app.getHttpServer())
      .get('/v1/students/search?size=100')
      .set('Authorization', auth(meToken))
      .expect(200);
    expect((withoutQuery.body.result.items as Row[]).map((row) => row.id)).toEqual(
      expect.arrayContaining([aId, bId, cId]),
    );
  });

  it('returns the read cursors on the conversation list so ✓✓ survives a restart', async () => {
    const conversation = await request(app.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', auth(meToken))
      .send({ studentId: aId })
      .expect(201);
    const conversationId = conversation.body.result.id as string;

    await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', auth(meToken))
      .send({ body: 'salom' })
      .expect(201);

    // Before A reads, my message is only "sent".
    const before = await request(app.getHttpServer())
      .get('/v1/conversations')
      .set('Authorization', auth(meToken))
      .expect(200);
    expect(before.body.result.items[0]).toMatchObject({ peerReadSeq: 0, myReadSeq: 0 });

    await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/read`)
      .set('Authorization', auth(aToken))
      .send({ seq: 1 })
      .expect(200);

    // A fresh REST call — the state a restarted app would rebuild from — now reports ✓✓.
    const after = await request(app.getHttpServer())
      .get('/v1/conversations')
      .set('Authorization', auth(meToken))
      .expect(200);
    expect(after.body.result.items[0].peerReadSeq).toBe(1);
  });
});
