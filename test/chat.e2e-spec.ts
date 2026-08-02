import { randomUUID } from 'node:crypto';
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
import { Call } from '../src/modules/calls/domain/entities/call.entity';
import { CallEndReason } from '../src/modules/calls/domain/enums/call-end-reason.enum';
import { CallMedia } from '../src/modules/calls/domain/enums/call-media.enum';
import { CallParty } from '../src/modules/calls/domain/enums/call-party.enum';
import { CallStatus } from '../src/modules/calls/domain/enums/call-status.enum';
import { ChatService } from '../src/modules/chat/application/chat.service';

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

  // ---- Phase 2: the endpoints §18 listed as missing ----

  it('returns one conversation in the same shape as a list row (§18)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/conversations/${conversationId}`)
      .set('Authorization', auth(bToken))
      .expect(200);

    expect(res.body.result.conversation.id).toBe(conversationId);
    expect(res.body.result.other.id).toBe(aId);
    expect(res.body.result).toHaveProperty('unreadCount');
    expect(res.body.result).toHaveProperty('myReadSeq');
    expect(res.body.result).toHaveProperty('peerDeliveredSeq');
  });

  it('404s a conversation the caller is not a member of (§18)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/conversations/${conversationId}`)
      .set('Authorization', auth(cToken))
      .expect(404);
    expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('reports unread totals for the tab badge (§18)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/conversations/unread-count')
      .set('Authorization', auth(bToken))
      .expect(200);

    expect(typeof res.body.result.total).toBe('number');
    expect(typeof res.body.result.conversations).toBe('number');
    expect(res.body.result.total).toBeGreaterThanOrEqual(res.body.result.conversations);
  });

  it('lists only the students the caller blocked, never who blocked them (§18)', async () => {
    // A blocked C earlier in this file. From C's side that block must be invisible.
    const mine = await request(app.getHttpServer())
      .get('/v1/blocks')
      .set('Authorization', auth(aToken))
      .expect(200);
    expect(mine.body.result.items.map((i: { student: { id: string } }) => i.student.id)).toContain(
      cId,
    );

    const theirs = await request(app.getHttpServer())
      .get('/v1/blocks')
      .set('Authorization', auth(cToken))
      .expect(200);
    expect(theirs.body.result.items).toHaveLength(0);
  });

  it('refuses to delete a message you did not send (§18)', async () => {
    const mine = await prisma.message.findFirstOrThrow({
      where: { conversationId, senderId: aId, deletedAt: null },
    });
    const res = await request(app.getHttpServer())
      .delete(`/v1/messages/${mine.id}`)
      .set('Authorization', auth(bToken)) // B is a member, but not the sender
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('404s a message in a conversation you do not belong to (§18)', async () => {
    const mine = await prisma.message.findFirstOrThrow({ where: { conversationId } });
    const res = await request(app.getHttpServer())
      .delete(`/v1/messages/${mine.id}`)
      .set('Authorization', auth(cToken))
      .expect(404);
    expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('soft-deletes your own message and drops it from unread (§18)', async () => {
    // A fresh unread message from A to B, so the unread delta is unambiguous.
    const sent = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', auth(aToken))
      .send({ body: 'xato yubordim' })
      .expect(201);
    const messageId = sent.body.result.id as string;

    const before = await request(app.getHttpServer())
      .get('/v1/conversations/unread-count')
      .set('Authorization', auth(bToken))
      .expect(200);

    const deleted = await request(app.getHttpServer())
      .delete(`/v1/messages/${messageId}`)
      .set('Authorization', auth(aToken))
      .expect(200);
    expect(deleted.body.result.body).toBeNull();
    expect(deleted.body.result.deletedAt).not.toBeNull();
    expect(deleted.body.result.seq).toBe(sent.body.result.seq); // the seq stays put

    // Idempotent.
    await request(app.getHttpServer())
      .delete(`/v1/messages/${messageId}`)
      .set('Authorization', auth(aToken))
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/v1/conversations/unread-count')
      .set('Authorization', auth(bToken))
      .expect(200);
    expect(after.body.result.total).toBe(before.body.result.total - 1);

    // Still in the history, as a tombstone — the row must not vanish or `seq` gains a hole.
    const history = await request(app.getHttpServer())
      .get(`/v1/conversations/${conversationId}/messages?size=50`)
      .set('Authorization', auth(bToken))
      .expect(200);
    const tombstone = history.body.result.items.find(
      (item: { id: string }) => item.id === messageId,
    );
    expect(tombstone).toBeDefined();
    expect(tombstone.body).toBeNull();
    expect(tombstone.deletedAt).not.toBeNull();
  });

  // §A4.6 acceptance criteria. Each runs against its own conversation with an exact message set.
  describe('multi-select delete (§A2, §A4.6)', () => {
    let seed = 0;
    const seeded: string[] = [];

    // Left behind, these push the shared list past page 1 — where the §17.7 test looks.
    afterAll(async () => {
      await prisma.conversation.deleteMany({ where: { id: { in: seeded } } });
    });

    /** A conversation between A and B with `count` messages, seq 1..count. */
    async function seedConversation(count: number, senderOf: (index: number) => string) {
      seed += 1;
      const convo = await prisma.conversation.create({
        data: {
          directKey: `bulk-${seed}:${aId}`,
          nextSeq: count + 1,
          lastMessageAt: new Date(),
          members: { create: [{ studentId: aId }, { studentId: bId }] },
        },
      });
      seeded.push(convo.id);
      if (count > 0) {
        await prisma.message.createMany({
          data: Array.from({ length: count }, (_, index) => ({
            conversationId: convo.id,
            senderId: senderOf(index),
            seq: index + 1,
            type: 'TEXT' as const,
            body: `xabar ${index + 1}`,
          })),
        });
      }
      return convo.id;
    }

    async function idsOfSeqs(convId: string, from: number, to: number): Promise<string[]> {
      const rows = await prisma.message.findMany({
        where: { conversationId: convId, seq: { gte: from, lte: to } },
        orderBy: { seq: 'asc' },
        select: { id: true },
      });
      return rows.map((row) => row.id);
    }

    /** Walks the whole history with `?before=`, the way the client scrolls up. */
    async function fullHistory(
      token: string,
      convId: string,
      size = 50,
    ): Promise<{ id: string; seq: number; deletedAt: string | null }[]> {
      const items: { id: string; seq: number; deletedAt: string | null }[] = [];
      let before: number | undefined;
      for (;;) {
        const cursor = before === undefined ? '' : `&before=${before}`;
        const res = await request(app.getHttpServer())
          .get(`/v1/conversations/${convId}/messages?size=${size}${cursor}`)
          .set('Authorization', auth(token))
          .expect(200);
        const page = res.body.result.items as typeof items;
        items.push(...page);
        if (!res.body.result.hasMore || page.length === 0) {
          break;
        }
        before = page[page.length - 1]!.seq;
      }
      return items.sort((left, right) => left.seq - right.seq);
    }

    async function unreadIn(token: string, convId: string): Promise<number> {
      const res = await request(app.getHttpServer())
        .get('/v1/conversations?page=1&size=100')
        .set('Authorization', auth(token))
        .expect(200);
      const row = (
        res.body.result.items as { conversation: { id: string }; unreadCount: number }[]
      ).find((item) => item.conversation.id === convId);
      return row?.unreadCount ?? 0;
    }

    const deleteMessages = (token: string, ids: string[], scope: 'ME' | 'EVERYONE') =>
      request(app.getHttpServer())
        .post('/v1/messages/delete')
        .set('Authorization', auth(token))
        .send({ ids, scope });

    it('1. EVERYONE keeps the list length and every seq position, on both sides', async () => {
      const convId = await seedConversation(50, () => aId);
      const ids = await idsOfSeqs(convId, 21, 30);

      const res = await deleteMessages(aToken, ids, 'EVERYONE').expect(200);
      expect(res.body.result.deleted).toHaveLength(10);
      expect(res.body.result.skipped).toEqual([]);

      for (const token of [aToken, bToken]) {
        const history = await fullHistory(token, convId);
        expect(history).toHaveLength(50);
        expect(history.map((item) => item.seq)).toEqual(
          Array.from({ length: 50 }, (_, index) => index + 1),
        );
        expect(history.filter((item) => item.deletedAt !== null).map((item) => item.seq)).toEqual([
          21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
        ]);
      }
    });

    it('2. ME shortens the requester’s history and leaves the peer’s untouched', async () => {
      const convId = await seedConversation(50, () => aId);
      const ids = await idsOfSeqs(convId, 21, 30);

      await deleteMessages(aToken, ids, 'ME').expect(200);

      const mine = await fullHistory(aToken, convId);
      const theirs = await fullHistory(bToken, convId);
      expect(mine).toHaveLength(40);
      expect(theirs).toHaveLength(50);
      expect(mine.map((item) => item.seq)).toEqual(
        theirs.map((item) => item.seq).filter((seq) => seq < 21 || seq > 30),
      );
    });

    it('2b. ME works on the other member’s messages too — nothing is mutated', async () => {
      const convId = await seedConversation(4, () => bId);
      const ids = await idsOfSeqs(convId, 1, 2);

      const res = await deleteMessages(aToken, ids, 'ME').expect(200);
      expect(res.body.result.deleted).toHaveLength(2);
      expect(await fullHistory(aToken, convId)).toHaveLength(2);
      expect(await fullHistory(bToken, convId)).toHaveLength(4);
    });

    it('3. paging with ?before= returns every visible message once — no gaps, no duplicates', async () => {
      const convId = await seedConversation(50, () => aId);
      await deleteMessages(aToken, await idsOfSeqs(convId, 10, 12), 'ME').expect(200);

      // A page size that divides neither 50 nor 47.
      const seen = await fullHistory(aToken, convId, 7);
      const seqs = seen.map((item) => item.seq);

      expect(new Set(seqs).size).toBe(seqs.length);
      expect(seqs).toEqual(
        Array.from({ length: 50 }, (_, index) => index + 1).filter((seq) => seq < 10 || seq > 12),
      );
    });

    it('5. the badge drops by what was deleted, never below zero, and is idempotent', async () => {
      const convId = await seedConversation(5, () => bId);
      expect(await unreadIn(aToken, convId)).toBe(5);

      const ids = await idsOfSeqs(convId, 1, 3);
      const first = await deleteMessages(aToken, ids, 'ME').expect(200);
      expect(first.body.result.unreadCount).toBe(2);
      expect(await unreadIn(aToken, convId)).toBe(2);

      const second = await deleteMessages(aToken, ids, 'ME').expect(200);
      expect(second.body.result.unreadCount).toBe(2);
      expect(await unreadIn(aToken, convId)).toBe(2);
    });

    it('skips the other member’s messages under EVERYONE instead of failing the batch', async () => {
      const convId = await seedConversation(4, (index) => (index % 2 === 0 ? aId : bId));
      const ids = await idsOfSeqs(convId, 1, 4);

      const res = await deleteMessages(aToken, ids, 'EVERYONE').expect(200);

      expect(res.body.result.deleted).toHaveLength(2); // seq 1 and 3 — A's own
      expect(res.body.result.skipped).toHaveLength(2);
      expect(
        (res.body.result.skipped as { reason: string }[]).every(
          (entry) => entry.reason === 'NOT_OWN',
        ),
      ).toBe(true);
    });

    it('refuses ids drawn from two conversations (422 MIXED_CONVERSATIONS)', async () => {
      const first = await seedConversation(2, () => aId);
      const second = await seedConversation(2, () => aId);
      const ids = [...(await idsOfSeqs(first, 1, 1)), ...(await idsOfSeqs(second, 1, 1))];

      const res = await deleteMessages(aToken, ids, 'EVERYONE').expect(422);
      expect(res.body.error.code).toBe('MIXED_CONVERSATIONS');
    });

    it('refuses more than 100 ids (422 TOO_MANY_IDS)', async () => {
      const ids = Array.from({ length: 101 }, (_, index) => `ghost-${index}`);
      const res = await deleteMessages(aToken, ids, 'ME').expect(422);
      expect(res.body.error.code).toBe('TOO_MANY_IDS');
    });

    it('403s a batch from a conversation the caller does not belong to', async () => {
      const convId = await seedConversation(2, () => aId);
      const ids = await idsOfSeqs(convId, 1, 1);

      const res = await deleteMessages(cToken, ids, 'ME').expect(403);
      expect(res.body.error.code).toBe('NOT_MEMBER');
    });

    it('404s when not one id resolves', async () => {
      const res = await deleteMessages(aToken, ['ghost-1', 'ghost-2'], 'ME').expect(404);
      expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');
    });

    it('4. after clearing, a new message stands alone for me and the peer keeps everything', async () => {
      const convId = await seedConversation(20, () => bId);

      const cleared = await request(app.getHttpServer())
        .delete(`/v1/conversations/${convId}/history?scope=ME`)
        .set('Authorization', auth(aToken))
        .expect(200);
      expect(cleared.body.result.clearedBeforeSeq).toBe(20);
      expect(cleared.body.result.unreadCount).toBe(0);

      expect(await fullHistory(aToken, convId)).toHaveLength(0);
      expect(await unreadIn(aToken, convId)).toBe(0);

      // Sent after the clear, so visible again — `seq` climbs past the watermark.
      await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', auth(bToken))
        .send({ body: 'tozalashdan keyin' })
        .expect(201);

      const mine = await fullHistory(aToken, convId);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.seq).toBe(21);
      expect(await fullHistory(bToken, convId)).toHaveLength(21);
    });

    it('clearing with EVERYONE empties it for both members', async () => {
      const convId = await seedConversation(6, () => aId);

      await request(app.getHttpServer())
        .delete(`/v1/conversations/${convId}/history?scope=EVERYONE`)
        .set('Authorization', auth(aToken))
        .expect(200);

      expect(await fullHistory(aToken, convId)).toHaveLength(0);
      expect(await fullHistory(bToken, convId)).toHaveLength(0);
    });

    it('keeps the conversation in the list with a null lastMessage after a clear (§B1)', async () => {
      const convId = await seedConversation(4, () => bId);
      await request(app.getHttpServer())
        .delete(`/v1/conversations/${convId}/history`)
        .set('Authorization', auth(aToken))
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/v1/conversations?page=1&size=100')
        .set('Authorization', auth(aToken))
        .expect(200);
      const row = (
        list.body.result.items as { conversation: { id: string }; lastMessage: unknown }[]
      ).find((item) => item.conversation.id === convId);

      expect(row).toBeDefined(); // the row stays; only the history goes
      expect(row!.lastMessage).toBeNull();
    });

    it('clearing is idempotent and 404s for a non-member', async () => {
      const convId = await seedConversation(3, () => aId);
      const clear = () =>
        request(app.getHttpServer())
          .delete(`/v1/conversations/${convId}/history?scope=ME`)
          .set('Authorization', auth(aToken));

      const first = await clear().expect(200);
      const second = await clear().expect(200);
      expect(second.body.result.clearedBeforeSeq).toBe(first.body.result.clearedBeforeSeq);

      const outsider = await request(app.getHttpServer())
        .delete(`/v1/conversations/${convId}/history`)
        .set('Authorization', auth(cToken))
        .expect(404);
      expect(outsider.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    // The unit test mocks the statement that could be wrong, so this one runs it for real.
    it('purges only messages BOTH members have cleared past (§B1)', async () => {
      const bothCleared = await seedConversation(5, () => aId);
      const oneCleared = await seedConversation(5, () => aId);

      await request(app.getHttpServer())
        .delete(`/v1/conversations/${bothCleared}/history?scope=EVERYONE`)
        .set('Authorization', auth(aToken))
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/v1/conversations/${oneCleared}/history?scope=ME`)
        .set('Authorization', auth(aToken))
        .expect(200);

      const removed = await app.get(ChatService).purgeClearedMessages();

      expect(removed).toBeGreaterThanOrEqual(5);
      expect(await prisma.message.count({ where: { conversationId: bothCleared } })).toBe(0);
      // B never cleared this one, so their history survives untouched.
      expect(await prisma.message.count({ where: { conversationId: oneCleared } })).toBe(5);
      expect(await fullHistory(bToken, oneCleared)).toHaveLength(5);
    });

    it('quotes a fragment and keeps the snapshot after the original is deleted (§C1/§C2)', async () => {
      const convId = await seedConversation(0, () => aId);

      const target = await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', auth(bToken))
        .send({ body: 'ertaga soat 10 da uchrashamizmi' })
        .expect(201);
      const targetId = target.body.result.id as string;

      const reply = await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', auth(aToken))
        .send({
          body: 'ha, kelaman',
          replyToMessageId: targetId,
          quote: { text: 'soat 10 da', offset: 7 },
        })
        .expect(201);

      expect(reply.body.result.replyTo).toMatchObject({
        id: targetId,
        seq: 1,
        quote: { text: 'soat 10 da', offset: 7 },
        preview: 'ertaga soat 10 da uchrashamizmi',
        originalDeleted: false,
      });

      // The quote is a snapshot and must survive the original being deleted.
      await request(app.getHttpServer())
        .delete(`/v1/messages/${targetId}`)
        .set('Authorization', auth(bToken))
        .expect(200);

      const history = await fullHistory(aToken, convId);
      const stored = history.find((item) => item.id === reply.body.result.id) as unknown as {
        replyTo: { quote: { text: string }; preview: string; originalDeleted: boolean };
      };
      expect(stored.replyTo.quote.text).toBe('soat 10 da');
      expect(stored.replyTo.preview).toBe('ertaga soat 10 da uchrashamizmi');
      expect(stored.replyTo.originalDeleted).toBe(true);
    });

    it('refuses a reply target from another conversation (422)', async () => {
      const mine = await seedConversation(2, () => aId);
      const other = await seedConversation(2, () => aId);
      const [foreignId] = await idsOfSeqs(other, 1, 1);

      const res = await request(app.getHttpServer())
        .post(`/v1/conversations/${mine}/messages`)
        .set('Authorization', auth(aToken))
        .send({ body: 'javob', replyToMessageId: foreignId })
        .expect(422);
      expect(res.body.error.code).toBe('REPLY_TARGET_NOT_FOUND');
    });

    it('refuses a quote that is not really in the target (422)', async () => {
      const convId = await seedConversation(0, () => aId);
      const target = await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', auth(aToken))
        .send({ body: 'ertaga soat 10 da' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', auth(aToken))
        .send({
          body: 'javob',
          replyToMessageId: target.body.result.id,
          quote: { text: 'soat 10 da', offset: 0 },
        })
        .expect(422);
      expect(res.body.error.code).toBe('QUOTE_NOT_FOUND');
    });

    it('refuses an oversized quote with QUOTE_TOO_LONG, not VALIDATION_ERROR (422)', async () => {
      const convId = await seedConversation(0, () => aId);
      const long = 'a'.repeat(400);
      const target = await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', auth(aToken))
        .send({ body: long })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', auth(aToken))
        .send({
          body: 'javob',
          replyToMessageId: target.body.result.id,
          quote: { text: long.slice(0, 301), offset: 0 },
        })
        .expect(422);
      expect(res.body.error.code).toBe('QUOTE_TOO_LONG');
    });

    it('refuses a quote sent without a reply target (422)', async () => {
      const convId = await seedConversation(1, () => aId);
      const res = await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', auth(aToken))
        .send({ body: 'javob', quote: { text: 'x', offset: 0 } })
        .expect(422);
      expect(res.body.error.code).toBe('QUOTE_WITHOUT_REPLY');
    });

    it('?around= returns a window centred on the seq, skipping hidden rows (§C3)', async () => {
      const convId = await seedConversation(60, () => aId);
      await deleteMessages(aToken, await idsOfSeqs(convId, 30, 30), 'ME').expect(200);

      const res = await request(app.getHttpServer())
        .get(`/v1/conversations/${convId}/messages?around=30&size=10`)
        .set('Authorization', auth(aToken))
        .expect(200);

      const seqs = (res.body.result.items as { seq: number }[]).map((item) => item.seq);
      // seq 30 is hidden, so the window fills around it rather than coming back short.
      expect(seqs).toHaveLength(10);
      expect(seqs).not.toContain(30);
      expect(seqs).toEqual([...seqs].sort((x, y) => x - y));
      expect(seqs[0]).toBeGreaterThanOrEqual(25);
      expect(seqs[seqs.length - 1]).toBeLessThanOrEqual(36);
    });

    it('refuses ?around= combined with ?before= (422)', async () => {
      const convId = await seedConversation(5, () => aId);
      const res = await request(app.getHttpServer())
        .get(`/v1/conversations/${convId}/messages?around=3&before=4`)
        .set('Authorization', auth(aToken))
        .expect(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('removes a conversation from your list and brings it back on a new message (§B2)', async () => {
      const convId = await seedConversation(6, () => bId);
      const inList = async (token: string) => {
        const res = await request(app.getHttpServer())
          .get('/v1/conversations?page=1&size=100')
          .set('Authorization', auth(token))
          .expect(200);
        return (res.body.result.items as { conversation: { id: string } }[]).some(
          (item) => item.conversation.id === convId,
        );
      };

      await request(app.getHttpServer())
        .delete(`/v1/conversations/${convId}?scope=ME`)
        .set('Authorization', auth(aToken))
        .expect(200);

      expect(await inList(aToken)).toBe(false);
      expect(await inList(bToken)).toBe(true); // the peer is untouched

      await request(app.getHttpServer())
        .post(`/v1/conversations/${convId}/messages`)
        .set('Authorization', auth(bToken))
        .send({ body: "o'chirgandan keyin" })
        .expect(201);

      // Back under the SAME id — a second conversation would fork the history.
      expect(await inList(aToken)).toBe(true);
      const mine = await fullHistory(aToken, convId);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.seq).toBe(7);
      expect(await fullHistory(bToken, convId)).toHaveLength(7);
    });

    it('keeps POST /v1/conversations idempotent after a delete (§B2)', async () => {
      const first = await request(app.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', auth(aToken))
        .send({ studentId: bId })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/v1/conversations/${first.body.result.id}?scope=ME`)
        .set('Authorization', auth(aToken))
        .expect(200);

      const again = await request(app.getHttpServer())
        .post('/v1/conversations')
        .set('Authorization', auth(aToken))
        .send({ studentId: bId })
        .expect(201);

      expect(again.body.result.id).toBe(first.body.result.id);
    });

    it('deletes for both members under EVERYONE, and 404s for a non-member', async () => {
      const convId = await seedConversation(3, () => aId);

      await request(app.getHttpServer())
        .delete(`/v1/conversations/${convId}?scope=EVERYONE`)
        .set('Authorization', auth(aToken))
        .expect(200);

      for (const token of [aToken, bToken]) {
        const res = await request(app.getHttpServer())
          .get('/v1/conversations?page=1&size=100')
          .set('Authorization', auth(token))
          .expect(200);
        expect(
          (res.body.result.items as { conversation: { id: string } }[]).some(
            (item) => item.conversation.id === convId,
          ),
        ).toBe(false);
      }

      const outsider = await request(app.getHttpServer())
        .delete(`/v1/conversations/${convId}`)
        .set('Authorization', auth(cToken))
        .expect(404);
      expect(outsider.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('hides a message from the conversation list’s lastMessage for the hider only (§A4.5)', async () => {
      const convId = await seedConversation(3, () => bId);
      await deleteMessages(aToken, await idsOfSeqs(convId, 3, 3), 'ME').expect(200);

      const forA = await request(app.getHttpServer())
        .get('/v1/conversations?page=1&size=100')
        .set('Authorization', auth(aToken))
        .expect(200);
      const forB = await request(app.getHttpServer())
        .get('/v1/conversations?page=1&size=100')
        .set('Authorization', auth(bToken))
        .expect(200);

      type Row = { conversation: { id: string }; lastMessage: { seq: number } | null };
      const rowA = (forA.body.result.items as Row[]).find((r) => r.conversation.id === convId);
      const rowB = (forB.body.result.items as Row[]).find((r) => r.conversation.id === convId);

      expect(rowA?.lastMessage?.seq).toBe(2); // A's newest visible message moved down
      expect(rowB?.lastMessage?.seq).toBe(3); // B is unaffected
    });
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

  /**
   * ⚠️ "Only a MISSED call is unread" (§14.2) used to be implemented by advancing the callee's READ
   * cursor to the CALL row's `seq`. That cursor is shared by the whole conversation and the CALL row
   * always carries its highest `seq` — so answering the phone silently marked every message the
   * callee had never opened as read. Run against a real database because the bug was in what the
   * count query returns, not in what the service intended.
   */
  describe('a finished call and the unread badge (§14.2)', () => {
    let seeded = 0;

    /** A fresh A↔B conversation holding `count` texts from A that B has never opened. */
    async function conversationWithUnread(count: number): Promise<string> {
      seeded += 1;
      const convo = await prisma.conversation.create({
        data: {
          directKey: `call-unread-${seeded}:${aId}`,
          nextSeq: count + 1,
          lastMessageAt: new Date(),
          members: { create: [{ studentId: aId }, { studentId: bId }] },
        },
      });
      await prisma.message.createMany({
        data: Array.from({ length: count }, (_, index) => ({
          conversationId: convo.id,
          senderId: aId,
          seq: index + 1,
          type: 'TEXT' as const,
          body: `o'qilmagan ${index + 1}`,
        })),
      });
      return convo.id;
    }

    async function unreadIn(token: string, convId: string): Promise<number> {
      const res = await request(app.getHttpServer())
        .get('/v1/conversations?page=1&size=100')
        .set('Authorization', auth(token))
        .expect(200);
      const row = (
        res.body.result.items as { conversation: { id: string }; unreadCount: number }[]
      ).find((item) => item.conversation.id === convId);
      return row?.unreadCount ?? 0;
    }

    /** The badge on the chat tab — a different query (raw SQL) than the per-conversation count. */
    async function unreadTotal(token: string): Promise<number> {
      const res = await request(app.getHttpServer())
        .get('/v1/conversations/unread-count')
        .set('Authorization', auth(token))
        .expect(200);
      return res.body.result.total as number;
    }

    /** A → B, answered and hung up after ~3 minutes unless overridden. */
    const finishedCall = (conversationId: string, overrides: Partial<Call> = {}): Call => ({
      id: randomUUID(),
      conversationId,
      callerId: aId,
      calleeId: bId,
      media: CallMedia.AUDIO,
      status: CallStatus.ENDED,
      startedAt: new Date('2026-08-01T10:00:00.000Z'),
      answeredAt: new Date('2026-08-01T10:00:10.000Z'),
      endedAt: new Date('2026-08-01T10:03:14.000Z'),
      endReason: CallEndReason.HANGUP,
      endedBy: CallParty.CALLEE,
      ...overrides,
    });

    it('keeps the texts B never opened unread when B answers A’s call', async () => {
      const convId = await conversationWithUnread(3);
      expect(await unreadIn(bToken, convId)).toBe(3);
      const totalBefore = await unreadTotal(bToken);

      await app.get(ChatService).appendCallMessage(finishedCall(convId));

      // 3, not 0 (the cursor used to jump to the CALL row) and not 4 (an answered call is not unread).
      expect(await unreadIn(bToken, convId)).toBe(3);
      expect(await unreadTotal(bToken)).toBe(totalBefore);
    });

    it('counts a missed call as unread, on top of the texts', async () => {
      const convId = await conversationWithUnread(2);
      const totalBefore = await unreadTotal(bToken);

      await app.get(ChatService).appendCallMessage(
        finishedCall(convId, {
          status: CallStatus.MISSED,
          answeredAt: null,
          endedAt: new Date('2026-08-01T10:00:45.000Z'),
          endReason: CallEndReason.TIMEOUT,
          endedBy: null,
        }),
      );

      expect(await unreadIn(bToken, convId)).toBe(3);
      expect(await unreadTotal(bToken)).toBe(totalBefore + 1);
    });
  });
});
