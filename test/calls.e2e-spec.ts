import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import type { Env } from '../src/config/env';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { CallEndedBus } from '../src/modules/calls/application/call-ended.bus';
import { CallEndedBroadcaster, CallsService } from '../src/modules/calls/application/calls.service';
import { CallStatus } from '../src/modules/calls/domain/enums/call-status.enum';
import { toDomainCall } from '../src/modules/calls/infrastructure/call.mapper';
import {
  CallTimerHandler,
  CallTimersQueue,
} from '../src/modules/calls/infrastructure/call-timers.queue';
import { ChatGateway } from '../src/modules/chat/chat.gateway';

// ⚠️ Must be set before `AppModule` is loaded: `ConfigModule.forRoot()` validates the environment
// at import time, and `AppConfigModule` runs it from AppModule's own module metadata. Hence the
// dynamic import in `beforeAll` — a static one would hoist above these two lines. TURN is optional
// outside production (a deployment without it answers a clean 503), but the credential path is
// what this file is here to test. CALLS_ENABLED must also be 'true' here — the master switch gates
// `ice-servers` (and `call:invite`) independently of TURN's own presence.
process.env.CALLS_ENABLED = 'true';
process.env.TURN_HOST = 'turn.e2e.test';
process.env.TURN_STATIC_SECRET = 'e2e-static-secret';

const A_EMAIL = 'e2e-calls-a@example.com';
const B_EMAIL = 'e2e-calls-b@example.com';
const C_EMAIL = 'e2e-calls-c@example.com';

/**
 * Calls REST (`GET /v1/calls`, `GET /v1/calls/ice-servers`) end-to-end, plus the one thing only a
 * booted application can prove: `CallsService` and `ChatGateway` hold the SAME `CallEndedBus`.
 */
describe('Calls REST — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenC: string;
  let idA: string;
  let idB: string;
  let conversationId: string;

  const auth = (token: string): string => `Bearer ${token}`;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
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

    tokenA = await register(A_EMAIL);
    await register(B_EMAIL);
    tokenC = await register(C_EMAIL); // C is the outsider: never a party to any call here
    idA = (await prisma.student.findUniqueOrThrow({ where: { email: A_EMAIL } })).id;
    idB = (await prisma.student.findUniqueOrThrow({ where: { email: B_EMAIL } })).id;

    conversationId = (
      await prisma.conversation.create({
        data: {
          directKey: [idA, idB].sort().join(':'),
          members: { create: [{ studentId: idA }, { studentId: idB }] },
        },
      })
    ).id;
    await prisma.call.create({
      data: {
        id: randomUUID(),
        conversationId,
        callerId: idA,
        calleeId: idB,
        media: 'AUDIO',
        status: CallStatus.ENDED,
        answeredAt: new Date('2026-08-01T10:00:10.000Z'),
        endedAt: new Date('2026-08-01T10:03:14.000Z'),
        endReason: 'HANGUP',
        endedBy: 'CALLER',
      },
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

  async function cleanup(): Promise<void> {
    const students = await prisma.student.findMany({
      where: { email: { in: [A_EMAIL, B_EMAIL, C_EMAIL] } },
    });
    const ids = students.map((s) => s.id);
    if (ids.length > 0) {
      await prisma.call.deleteMany({
        where: { OR: [{ callerId: { in: ids } }, { calleeId: { in: ids } }] },
      });
      await prisma.conversation.deleteMany({
        where: { members: { some: { studentId: { in: ids } } } },
      });
    }
    await prisma.student.deleteMany({ where: { email: { in: [A_EMAIL, B_EMAIL, C_EMAIL] } } });
  }

  it('requires authentication for ice-servers', async () => {
    await request(app.getHttpServer()).get('/v1/calls/ice-servers').expect(401);
  });

  it('issues a TURN credential to a student', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/calls/ice-servers')
      .set('Authorization', auth(tokenA))
      .expect(200);
    expect(res.body.result.ttlSeconds).toBe(3600);
    expect(res.body.result.iceServers[1].username).toContain(':');
    // ⚠️ coturn keys its per-user quota on this — it must be the token's student, nothing else.
    expect(res.body.result.iceServers[1].username).toContain(idA);
  });

  // ⚠️ IDOR — the filter must be in SQL, not in a mapper.
  it("never returns another student's calls", async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/calls?page=1&size=20')
      .set('Authorization', auth(tokenC))
      .expect(200);
    expect(res.body.result.items).toEqual([]);
  });

  it('paginates with the project envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/calls?page=1&size=20')
      .set('Authorization', auth(tokenA))
      .expect(200);
    expect(res.body).toMatchObject({ success: true, status: 200 });
    expect(Object.keys(res.body.result)).toEqual(
      expect.arrayContaining(['items', 'page', 'size', 'total', 'hasNext']),
    );
    expect(res.body.result.items[0]).toMatchObject({
      direction: 'OUTGOING',
      peerId: idB,
      durationMs: 184_000,
    });
  });

  /**
   * ⚠️ Until `ChatModule` imported `CallsModule`, each provided its OWN `CallEndedBus`: the service
   * published into one instance and the gateway subscribed to another, so no call ever produced a
   * chat message — with every unit test still green. Publishing through the instance `CallsService`
   * actually holds, and asserting the row `ChatGateway`'s subscriber writes, is the only check that
   * fails when that regresses.
   */
  it('shares one CallEndedBus between CallsService and ChatGateway', async () => {
    const injected = (app.get(CallsService) as unknown as { endedBus: CallEndedBus }).endedBus;
    const subscriber = (app.get(ChatGateway) as unknown as { callEnded: CallEndedBus }).callEnded;
    expect(injected).toBe(subscriber);

    const call = await prisma.call.findFirstOrThrow({ where: { callerId: idA } });
    // `publish` awaits its listeners, so the row is there by the time this resolves.
    await injected.publish(toDomainCall(call));

    const message = await prisma.message.findFirst({
      where: { conversationId, callId: call.id },
      select: { id: true, type: true },
    });
    expect(message).toMatchObject({ type: 'CALL' });
  });

  /**
   * ⚠️ The counterpart to the timer-handler check below, for the other half of a timer close: the
   * job fires, the call is closed — and `call:ended` reaches the two phones only if `CallsGateway`
   * registered its broadcaster. Asserted against a booted app, because the registration happens in
   * the gateway's `onModuleInit` and a hand-constructed gateway proves nothing about wiring.
   */
  it('registers the call:ended broadcaster at boot', () => {
    const service = app.get(CallsService) as unknown as {
      broadcaster: CallEndedBroadcaster | null;
    };
    expect(service.broadcaster).not.toBeNull();
  });

  /**
   * ⚠️ `CallTimersQueue` logs an error and drops a timer that fires with no handler, so a missed
   * registration is invisible until a real 45s ring-out never closes. `CallsModule` registers it
   * from a factory — which Nest runs during instantiation, i.e. before ANY `onModuleInit`, so the
   * worker cannot start first. From an init hook this would silently depend on provider order.
   */
  it('registers the timer handler at boot, before the worker can consume a job', () => {
    const queue = app.get(CallTimersQueue) as unknown as { handler: CallTimerHandler | null };
    expect(queue.handler).not.toBeNull();
  });

  /**
   * ⚠️ C2: the throttler's default tracker is `req.ip`, which behind Nginx is the proxy for every
   * request — a shared bucket would let one student's ten fetches 429 the entire platform, and every
   * call starts by fetching a credential. The bucket must be per student.
   *
   * Declared last on purpose: it exhausts A's own bucket for the rest of the window.
   */
  it('throttles the credential per student, not platform-wide', async () => {
    let exhausted = false;
    for (let attempt = 0; attempt < 12 && !exhausted; attempt += 1) {
      const res = await request(app.getHttpServer())
        .get('/v1/calls/ice-servers')
        .set('Authorization', auth(tokenA));
      exhausted = res.status === 429;
    }
    expect(exhausted).toBe(true);

    // A different student is untouched by A's spending.
    await request(app.getHttpServer())
      .get('/v1/calls/ice-servers')
      .set('Authorization', auth(tokenC))
      .expect(200);
  });
});
