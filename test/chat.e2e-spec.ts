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

const A_EMAIL = 'e2e-chat-a@example.com';
const B_EMAIL = 'e2e-chat-b@example.com';
const C_EMAIL = 'e2e-chat-c@example.com';

/**
 * Connections + Chat — end-to-end against a real database. Exercises the whole flow: discover →
 * connect → open a conversation → send → unread → read, plus the connection gate, block and report.
 */
describe('Connections + Chat — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let aToken: string;
  let bToken: string;
  let cToken: string;
  let aId: string;
  let bId: string;
  let cId: string;
  let conversationId: string;

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

    aToken = await register(A_EMAIL);
    bToken = await register(B_EMAIL);
    cToken = await register(C_EMAIL); // C is the outsider: gate, block, report and non-member checks
    aId = (await prisma.student.findUniqueOrThrow({ where: { email: A_EMAIL } })).id;
    bId = (await prisma.student.findUniqueOrThrow({ where: { email: B_EMAIL } })).id;
    cId = (await prisma.student.findUniqueOrThrow({ where: { email: C_EMAIL } })).id;
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

  async function cleanup(): Promise<void> {
    const emails = [A_EMAIL, B_EMAIL, C_EMAIL];
    const students = await prisma.student.findMany({ where: { email: { in: emails } } });
    const ids = students.map((s) => s.id);
    if (ids.length > 0) {
      // Conversations have no student FK — delete them explicitly (cascades members + messages).
      await prisma.conversation.deleteMany({
        where: { members: { some: { studentId: { in: ids } } } },
      });
    }
    await prisma.student.deleteMany({ where: { email: { in: emails } } }); // cascades the rest
  }

  it('rejects an anonymous connections request with 401', async () => {
    const res = await request(app.getHttpServer()).get('/v1/connections').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('lets B claim a username, and A discovers B by it with connectionStatus NONE', async () => {
    await request(app.getHttpServer())
      .put('/v1/profile/me')
      .set('Authorization', auth(bToken))
      .send({ username: 'student_b' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/v1/students/search?q=student_b')
      .set('Authorization', auth(aToken))
      .expect(200);

    const hit = res.body.result.items.find((item: { id: string }) => item.id === bId);
    expect(hit).toBeDefined();
    expect(hit.username).toBe('student_b');
    expect(hit.connectionStatus).toBe('NONE');
  });

  it('A sends a connection request, B accepts, and both are connected', async () => {
    const sent = await request(app.getHttpServer())
      .post('/v1/connections/requests')
      .set('Authorization', auth(aToken))
      .send({ addresseeId: bId })
      .expect(201);
    expect(sent.body.result.status).toBe('PENDING');
    const requestId = sent.body.result.id as string;

    const incoming = await request(app.getHttpServer())
      .get('/v1/connections/requests?direction=incoming')
      .set('Authorization', auth(bToken))
      .expect(200);
    expect(
      incoming.body.result.items.some(
        (r: { connectionId: string }) => r.connectionId === requestId,
      ),
    ).toBe(true);

    const accepted = await request(app.getHttpServer())
      .post(`/v1/connections/requests/${requestId}/accept`)
      .set('Authorization', auth(bToken))
      .expect(200);
    expect(accepted.body.result.status).toBe('ACCEPTED');

    const aConns = await request(app.getHttpServer())
      .get('/v1/connections')
      .set('Authorization', auth(aToken))
      .expect(200);
    expect(
      aConns.body.result.items.some((c: { student: { id: string } }) => c.student.id === bId),
    ).toBe(true);
  });

  it('A opens a conversation with B and sends a message (seq 1)', async () => {
    const opened = await request(app.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', auth(aToken))
      .send({ studentId: bId })
      .expect(201);
    conversationId = opened.body.result.id as string;
    expect(opened.body.result.type).toBe('DIRECT');

    const sent = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aToken))
      .send({ body: 'Salom B!' })
      .expect(201);
    expect(sent.body.result.seq).toBe(1);
    expect(sent.body.result.body).toBe('Salom B!');
  });

  it('B sees the conversation with unread=1 and the last message, then history', async () => {
    const list = await request(app.getHttpServer())
      .get('/v1/conversations')
      .set('Authorization', auth(bToken))
      .expect(200);
    const item = list.body.result.items.find(
      (i: { conversation: { id: string } }) => i.conversation.id === conversationId,
    );
    expect(item).toBeDefined();
    expect(item.unreadCount).toBe(1);
    expect(item.other.id).toBe(aId);
    expect(item.lastMessage.body).toBe('Salom B!');

    const history = await request(app.getHttpServer())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', auth(bToken))
      .expect(200);
    expect(history.body.result.items).toHaveLength(1);
    expect(history.body.result.items[0].body).toBe('Salom B!');
  });

  it('B marks the conversation read and unread drops to 0', async () => {
    await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/read`)
      .set('Authorization', auth(bToken))
      .send({ seq: 1 })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/v1/conversations')
      .set('Authorization', auth(bToken))
      .expect(200);
    const item = list.body.result.items.find(
      (i: { conversation: { id: string } }) => i.conversation.id === conversationId,
    );
    expect(item.unreadCount).toBe(0);
  });

  it('refuses to open a conversation with a student you are not connected to (403 NOT_CONNECTED)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', auth(aToken))
      .send({ studentId: cId })
      .expect(403);
    expect(res.body.error.code).toBe('NOT_CONNECTED');
  });

  it('block prevents a connection request (403 USER_BLOCKED)', async () => {
    await request(app.getHttpServer())
      .post('/v1/blocks')
      .set('Authorization', auth(aToken))
      .send({ studentId: cId })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/v1/connections/requests')
      .set('Authorization', auth(aToken))
      .send({ addresseeId: cId })
      .expect(403);
    expect(res.body.error.code).toBe('USER_BLOCKED');
  });

  it('reports a student (201, OPEN)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/reports')
      .set('Authorization', auth(aToken))
      .send({ targetStudentId: cId, reason: 'SPAM' })
      .expect(201);
    expect(res.body.result.reason).toBe('SPAM');
    expect(res.body.result.status).toBe('OPEN');
  });

  // ---- Phase 0 fixes for the mobile team's report (docs/api/mobile_questions) ----

  it('echoes clientMsgId to the sender and hides it from the recipient (§17.1)', async () => {
    const sent = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aToken))
      .send({ body: 'ha', clientMsgId: 'cmid-e2e-1' })
      .expect(201);
    expect(sent.body.result.clientMsgId).toBe('cmid-e2e-1');

    const history = await request(app.getHttpServer())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', auth(bToken))
      .expect(200);
    const mine = history.body.result.items.find(
      (item: { id: string }) => item.id === sent.body.result.id,
    );
    expect(mine.clientMsgId).toBeNull();
  });

  it('reports hasMore = false once the history is exhausted (§17.5)', async () => {
    const firstPage = await request(app.getHttpServer())
      .get(`/v1/conversations/${conversationId}/messages?size=1`)
      .set('Authorization', auth(bToken))
      .expect(200);
    expect(firstPage.body.result.items).toHaveLength(1);
    expect(firstPage.body.result.hasMore).toBe(true);

    const wholeHistory = await request(app.getHttpServer())
      .get(`/v1/conversations/${conversationId}/messages?size=50`)
      .set('Authorization', auth(bToken))
      .expect(200);
    expect(wholeHistory.body.result.hasMore).toBe(false);
  });

  it('advances the delivered cursor over REST when the socket is down (§17.6)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/delivered`)
      .set('Authorization', auth(bToken))
      .send({ seq: 1 })
      .expect(200);

    const member = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_studentId: { conversationId, studentId: bId } },
    });
    expect(member.lastDeliveredSeq).toBe(1);
  });

  it('refuses a delivered cursor from a non-member (§17.6)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/delivered`)
      .set('Authorization', auth(cToken))
      .send({ seq: 1 })
      .expect(404);
    expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('refuses a report for a message that does not exist (§17.4)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/reports')
      .set('Authorization', auth(aToken))
      .send({ messageId: 'msg_does_not_exist', reason: 'SPAM' })
      .expect(422);
    expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it("refuses a report for a message in someone else's conversation (§17.4)", async () => {
    const message = await prisma.message.findFirstOrThrow({ where: { conversationId } });

    const res = await request(app.getHttpServer())
      .post('/v1/reports')
      .set('Authorization', auth(cToken)) // C is not a member of A↔B
      .send({ messageId: message.id, reason: 'SPAM' })
      .expect(422);
    expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('accepts a report for a message you can see, and snapshots it (§17.4)', async () => {
    const message = await prisma.message.findFirstOrThrow({ where: { conversationId } });

    const res = await request(app.getHttpServer())
      .post('/v1/reports')
      .set('Authorization', auth(bToken))
      .send({ messageId: message.id, reason: 'HARASSMENT' })
      .expect(201);

    const stored = await prisma.report.findUniqueOrThrow({ where: { id: res.body.result.id } });
    expect(stored.messageId).toBe(message.id);
    expect(stored.contentSnapshot).toBe(message.body);
  });

  it('sorts conversations that never received a message last (§17.7)', async () => {
    // Created straight through Prisma on purpose: what is under test is the list ordering, not the
    // connection gate that `POST /v1/conversations` enforces (A has blocked C by now).
    await prisma.conversation.create({
      data: {
        directKey: `${aId}:empty`,
        members: { create: [{ studentId: aId }, { studentId: cId }] },
      },
    });

    const res = await request(app.getHttpServer())
      .get('/v1/conversations?page=1&size=20')
      .set('Authorization', auth(aToken))
      .expect(200);

    const stamps = (
      res.body.result.items as { conversation: { lastMessageAt: string | null } }[]
    ).map((row) => row.conversation.lastMessageAt);

    const firstEmpty = stamps.indexOf(null);
    expect(firstEmpty).toBeGreaterThan(-1);
    // Once the empty ones start they must not be interrupted — Postgres used to put them first.
    expect(stamps.slice(firstEmpty).every((stamp) => stamp === null)).toBe(true);
  });
});
