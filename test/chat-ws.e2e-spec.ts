import type { AddressInfo } from 'net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import type { Env } from '../src/config/env';
import { PrismaService } from '../src/infrastructure/database/prisma.service';

const A_EMAIL = 'e2e-ws-a@example.com';
const B_EMAIL = 'e2e-ws-b@example.com';

/** Resolves with the first payload of `event`, or rejects after `timeoutMs`. */
function waitFor<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Chat WebSocket gateway (`/chat`) — live end-to-end. Boots a listening server and drives real
 * socket.io clients: JWT handshake, `message:send` ack + `message:new` fan-out, and read receipts.
 */
describe('Chat gateway (/chat WS) — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;
  let aToken: string;
  let bToken: string;
  let bId: string;
  let conversationId: string;
  const sockets: Socket[] = [];

  const auth = (token: string): string => `Bearer ${token}`;
  /** Let the server finish its async handleConnection (room join) before emitting. */
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 250));
  const connect = (token?: string): Socket => {
    const socket = io(`http://localhost:${port}/chat`, {
      transports: ['websocket'],
      auth: token === undefined ? {} : { token },
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  };

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
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;

    prisma = app.get(PrismaService);
    await cleanup();

    aToken = await register(A_EMAIL);
    bToken = await register(B_EMAIL);
    bId = (await prisma.student.findUniqueOrThrow({ where: { email: B_EMAIL } })).id;

    // A → request, B accepts, then A opens the direct conversation (all over REST).
    const sent = await request(app.getHttpServer())
      .post('/v1/connections/requests')
      .set('Authorization', auth(aToken))
      .send({ addresseeId: bId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/connections/requests/${sent.body.result.id}/accept`)
      .set('Authorization', auth(bToken))
      .expect(200);
    const opened = await request(app.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', auth(aToken))
      .send({ studentId: bId })
      .expect(201);
    conversationId = opened.body.result.id as string;
  });

  afterEach(() => {
    while (sockets.length > 0) {
      sockets.pop()?.disconnect();
    }
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
      where: { email: { in: [A_EMAIL, B_EMAIL] } },
    });
    const ids = students.map((s) => s.id);
    if (ids.length > 0) {
      await prisma.conversation.deleteMany({
        where: { members: { some: { studentId: { in: ids } } } },
      });
    }
    await prisma.student.deleteMany({ where: { email: { in: [A_EMAIL, B_EMAIL] } } });
  }

  it('disconnects a socket that presents no token', async () => {
    const socket = connect();
    const reason = await Promise.race([
      waitFor<string>(socket, 'disconnect', 5000),
      waitFor<Error>(socket, 'connect_error', 5000).then(() => 'connect_error'),
    ]);
    expect(reason).toBeTruthy();
    expect(socket.connected).toBe(false);
  });

  it('delivers a sent message: A gets a "sent" ack, B receives message:new', async () => {
    const aSocket = connect(aToken);
    const bSocket = connect(bToken);
    await Promise.all([waitFor(aSocket, 'connect'), waitFor(bSocket, 'connect')]);
    await settle();

    const newMessage = waitFor<{ conversationId: string; message: { body: string; seq: number } }>(
      bSocket,
      'message:new',
    );
    const ack = await new Promise<{ status: string; seq: number; clientMsgId: string }>(
      (resolve) => {
        aSocket.emit(
          'message:send',
          { conversationId, clientMsgId: 'c-1', body: 'Salom WS!' },
          resolve,
        );
      },
    );

    expect(ack.status).toBe('sent');
    expect(ack.seq).toBe(1);
    expect(ack.clientMsgId).toBe('c-1');

    const received = await newMessage;
    expect(received.conversationId).toBe(conversationId);
    expect(received.message.body).toBe('Salom WS!');
    expect(received.message.seq).toBe(1);
  }, 15000);

  it('is idempotent — the same clientMsgId returns the same message (C6)', async () => {
    const aSocket = connect(aToken);
    await waitFor(aSocket, 'connect');
    await settle();

    const send = (): Promise<{ id: string; seq: number; status: string }> =>
      new Promise((resolve) => {
        aSocket.emit(
          'message:send',
          { conversationId, clientMsgId: 'dup-1', body: 'once' },
          resolve,
        );
      });

    const first = await send();
    const second = await send();

    expect(first.status).toBe('sent');
    expect(second.id).toBe(first.id);
    expect(second.seq).toBe(first.seq);
  }, 15000);

  it('delivers a read receipt: B reads, A receives message:read', async () => {
    const aSocket = connect(aToken);
    const bSocket = connect(bToken);
    await Promise.all([waitFor(aSocket, 'connect'), waitFor(bSocket, 'connect')]);
    await settle();

    const receipt = waitFor<{ conversationId: string; seq: number; byStudentId: string }>(
      aSocket,
      'message:read',
    );
    bSocket.emit('message:read', { conversationId, seq: 1 });

    const read = await receipt;
    expect(read.conversationId).toBe(conversationId);
    expect(read.seq).toBe(1);
    expect(read.byStudentId).toBe(bId);
  }, 15000);
});
