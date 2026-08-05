import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NotificationTargetType, NotificationType } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import type { Env } from '../src/config/env';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { NotificationListService } from '../src/modules/notifications/application/notification-list.service';

const OWNER_EMAIL = 'e2e-notifications-owner@example.com';
const OTHER_EMAIL = 'e2e-notifications-other@example.com';

const DAY_MS = 24 * 60 * 60 * 1000;

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  target: { type: string; id: string | null } | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * The notifications list — end-to-end against a real database.
 *
 * The unit tests mock the repository, which leaves the parts that actually *are* this feature with
 * no coverage: the `createdAt DESC, id DESC` ordering, an `unreadCount` that spans the history
 * rather than the page, the `readAt IS NULL` filter that makes marking idempotent, and above all
 * the `studentId` in every `WHERE` that stops one student marking another's rows. Each assertion
 * below is one of the acceptance criteria in `01-NOTIFICATIONS_BACKEND.md` §5.
 */
describe('Notifications list — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationListService;
  let ownerToken: string;
  let otherToken: string;
  let ownerId: string;
  let otherId: string;

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
    notifications = app.get(NotificationListService);
    await cleanup();

    ownerToken = await register(OWNER_EMAIL);
    otherToken = await register(OTHER_EMAIL);
    ownerId = await idOf(OWNER_EMAIL);
    otherId = await idOf(OTHER_EMAIL);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { studentId: { in: [ownerId, otherId] } } });
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

  async function cleanup(): Promise<void> {
    await prisma.student.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
  }

  /** Writes a row directly: what raises the event is branch 02's business, not this file's. */
  async function seed(
    studentId: string,
    overrides: Partial<{
      type: NotificationType;
      title: string;
      body: string | null;
      targetType: NotificationTargetType | null;
      targetId: string | null;
      readAt: Date | null;
      createdAt: Date;
    }> = {},
  ): Promise<string> {
    const row = await prisma.notification.create({
      data: {
        studentId,
        type: overrides.type ?? NotificationType.CHAT,
        title: overrides.title ?? 'Yangi xabar',
        body: overrides.body === undefined ? 'Dilnoza sizga xabar yozdi.' : overrides.body,
        targetType: overrides.targetType ?? null,
        targetId: overrides.targetId ?? null,
        readAt: overrides.readAt ?? null,
        ...(overrides.createdAt === undefined ? {} : { createdAt: overrides.createdAt }),
      },
    });
    return row.id;
  }

  function list(token: string, query = ''): request.Test {
    return request(app.getHttpServer())
      .get(`/v1/notifications${query}`)
      .set('Authorization', auth(token))
      .expect(200);
  }

  describe('GET /v1/notifications', () => {
    it('returns newest first and counts unread across the whole history', async () => {
      const now = Date.now();
      await seed(ownerId, { title: 'oldest', createdAt: new Date(now - 3000), readAt: new Date() });
      await seed(ownerId, { title: 'middle', createdAt: new Date(now - 2000) });
      await seed(ownerId, { title: 'newest', createdAt: new Date(now - 1000) });

      const res = await list(ownerToken);
      const items = res.body.result.items as NotificationRow[];

      expect(items.map((n) => n.title)).toEqual(['newest', 'middle', 'oldest']);
      expect(res.body.result.unreadCount).toBe(2);
    });

    it('counts unread beyond the limit — the bell must not shrink with the page (§2.2)', async () => {
      const now = Date.now();
      for (let i = 0; i < 5; i += 1) {
        await seed(ownerId, { title: `n${i}`, createdAt: new Date(now - i * 1000) });
      }

      const res = await list(ownerToken, '?limit=2');
      expect(res.body.result.items).toHaveLength(2);
      expect(res.body.result.unreadCount).toBe(5);
    });

    it('breaks a same-instant tie on id, so the order is stable between requests (§2.1)', async () => {
      const sameMoment = new Date();
      await seed(ownerId, { title: 'a', createdAt: sameMoment });
      await seed(ownerId, { title: 'b', createdAt: sameMoment });
      await seed(ownerId, { title: 'c', createdAt: sameMoment });

      const first = await list(ownerToken);
      const second = await list(ownerToken);
      const idsOf = (res: { body: { result: { items: NotificationRow[] } } }): string[] =>
        res.body.result.items.map((n) => n.id);

      expect(idsOf(first)).toEqual(idsOf(second));
      expect(idsOf(first)).toEqual([...idsOf(first)].sort().reverse());
    });

    it('shapes target as {type, id} and serialises dates as ISO-8601 (§1.2, §2.3)', async () => {
      await seed(ownerId, {
        type: NotificationType.CHAT,
        targetType: NotificationTargetType.CHAT,
        targetId: 'cnv_e2e',
      });

      const [item] = (await list(ownerToken)).body.result.items as NotificationRow[];
      expect(item.type).toBe('CHAT');
      expect(item.target).toEqual({ type: 'CHAT', id: 'cnv_e2e' });
      expect(item.readAt).toBeNull();
      expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('sends target: null for a row that opens nothing, and a null body', async () => {
      await seed(ownerId, { type: NotificationType.SYSTEM, title: 'Xush kelibsiz', body: null });

      const [item] = (await list(ownerToken)).body.result.items as NotificationRow[];
      expect(item.target).toBeNull();
      expect(item.body).toBeNull();
    });

    it('never leaks another student’s notifications', async () => {
      await seed(otherId, { title: 'not yours' });

      const res = await list(ownerToken);
      expect(res.body.result.items).toHaveLength(0);
      expect(res.body.result.unreadCount).toBe(0);
    });

    it('rejects a limit above 100 (§2)', async () => {
      await request(app.getHttpServer())
        .get('/v1/notifications?limit=101')
        .set('Authorization', auth(ownerToken))
        .expect(422);
    });

    it('requires a token', async () => {
      await request(app.getHttpServer()).get('/v1/notifications').expect(401);
    });
  });

  describe('POST /v1/notifications/read', () => {
    const markRead = (token: string, body: object): request.Test =>
      request(app.getHttpServer())
        .post('/v1/notifications/read')
        .set('Authorization', auth(token))
        .send(body);

    it('marks the listed ids and leaves the rest alone', async () => {
      const first = await seed(ownerId, { title: 'a' });
      await seed(ownerId, { title: 'b' });

      await markRead(ownerToken, { ids: [first] }).expect(200);

      const res = await list(ownerToken);
      expect(res.body.result.unreadCount).toBe(1);
      const marked = (res.body.result.items as NotificationRow[]).find((n) => n.id === first);
      expect(marked?.readAt).not.toBeNull();
    });

    it('marks everything with { all: true }', async () => {
      await seed(ownerId, { title: 'a' });
      await seed(ownerId, { title: 'b' });

      await markRead(ownerToken, { all: true }).expect(200);

      expect((await list(ownerToken)).body.result.unreadCount).toBe(0);
    });

    it('is idempotent — a second mark leaves the original readAt untouched (§3.2)', async () => {
      const id = await seed(ownerId);

      await markRead(ownerToken, { ids: [id] }).expect(200);
      const firstReadAt = (await prisma.notification.findUniqueOrThrow({ where: { id } })).readAt;

      await markRead(ownerToken, { ids: [id] }).expect(200);
      const secondReadAt = (await prisma.notification.findUniqueOrThrow({ where: { id } })).readAt;

      expect(secondReadAt).toEqual(firstReadAt);
    });

    it('ignores unknown ids but still marks the real ones (§3.3)', async () => {
      const id = await seed(ownerId);

      await markRead(ownerToken, { ids: ['ntf_does_not_exist', id] }).expect(200);

      expect((await list(ownerToken)).body.result.unreadCount).toBe(0);
    });

    it('cannot mark another student’s notification', async () => {
      const theirs = await seed(otherId);

      // Silently skipped, exactly like an unknown id — the id is not this caller's to address.
      await markRead(ownerToken, { ids: [theirs] }).expect(200);

      const row = await prisma.notification.findUniqueOrThrow({ where: { id: theirs } });
      expect(row.readAt).toBeNull();
    });

    it('marks all only within the caller’s own rows', async () => {
      await seed(ownerId);
      const theirs = await seed(otherId);

      await markRead(ownerToken, { all: true }).expect(200);

      expect((await list(otherToken)).body.result.unreadCount).toBe(1);
      const row = await prisma.notification.findUniqueOrThrow({ where: { id: theirs } });
      expect(row.readAt).toBeNull();
    });

    it('rejects a body with neither mode, and one with both (§3.1)', async () => {
      await markRead(ownerToken, {}).expect(422);
      await markRead(ownerToken, { ids: ['x'], all: true }).expect(422);
    });

    it('rejects more than 200 ids (§3.5)', async () => {
      const ids = Array.from({ length: 201 }, (_, i) => `ntf_${i}`);
      await markRead(ownerToken, { ids }).expect(422);
    });

    it('returns a null result — there is no body to read (§3.4)', async () => {
      const res = await markRead(ownerToken, { all: true }).expect(200);
      expect(res.body.result).toBeNull();
      expect(res.body.success).toBe(true);
    });
  });

  describe('retention sweep (§1.3)', () => {
    it('deletes rows past the window and keeps everything inside it', async () => {
      const now = Date.now();
      const stale = await seed(ownerId, { title: 'old', createdAt: new Date(now - 91 * DAY_MS) });
      const fresh = await seed(ownerId, { title: 'new', createdAt: new Date(now - 89 * DAY_MS) });

      const removed = await notifications.purgeOlderThan(90);
      expect(removed).toBeGreaterThanOrEqual(1);

      expect(await prisma.notification.findUnique({ where: { id: stale } })).toBeNull();
      expect(await prisma.notification.findUnique({ where: { id: fresh } })).not.toBeNull();
    });
  });
});
