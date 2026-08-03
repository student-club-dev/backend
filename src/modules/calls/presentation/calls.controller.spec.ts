import { ERROR_CODE } from '../../../common/errors/error-code';
import { Call } from '../domain/entities/call.entity';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallParty } from '../domain/enums/call-party.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallsController, trackerOf } from './calls.controller';

const ME = 'std_me';
const PEER = 'std_peer';

const user = { id: ME } as never;

const call = (overrides: Partial<Call> = {}): Call => ({
  id: 'call_1',
  conversationId: 'cnv_1',
  callerId: ME,
  calleeId: PEER,
  media: CallMedia.AUDIO,
  status: CallStatus.ENDED,
  startedAt: new Date('2026-08-01T10:00:00.000Z'),
  answeredAt: new Date('2026-08-01T10:00:10.000Z'),
  endedAt: new Date('2026-08-01T10:03:14.000Z'),
  endReason: CallEndReason.HANGUP,
  endedBy: CallParty.CALLER,
  ...overrides,
});

describe('CallsController', () => {
  const calls = {
    listForStudent: jest.fn(async () => ({ items: [call()], total: 1 })),
  };

  const config = (env: Record<string, unknown>) => ({ get: (key: string) => env[key] }) as never;

  // CALLS_ENABLED defaults to 'true' here so the pre-existing TURN-focused tests below keep
  // exercising exactly what they name — the flag itself gets its own dedicated tests.
  const controller = (env: Record<string, unknown> = {}): CallsController =>
    new CallsController(
      calls as never,
      config({ TURN_TTL_SECONDS: 3600, CALLS_ENABLED: 'true', ...env }),
    );

  const configured = { TURN_HOST: 'turn.elonuz.test', TURN_STATIC_SECRET: 's3cret' };

  beforeEach(() => jest.clearAllMocks());

  describe('GET /v1/calls/ice-servers', () => {
    it('returns a STUN entry and a TURN entry with a credential', () => {
      const result = controller(configured).iceServers(user);
      expect(result.ttlSeconds).toBe(3600);
      expect(result.iceServers[0].urls[0]).toBe('stun:turn.elonuz.test:3478');
      expect(result.iceServers[1].credential).toEqual(expect.any(String));
    });

    /**
     * ⚠️ THE security property of this endpoint. The credential is a bearer capability for relay
     * bandwidth and coturn's `user-quota` is keyed on the username — an id taken from a query or a
     * body parameter would let anyone mint credentials that spend someone else's quota.
     */
    it('keys the username on the authenticated student, from the token alone', () => {
      const result = controller(configured).iceServers(user);
      expect(result.iceServers[1].username?.endsWith(`:${ME}`)).toBe(true);
    });

    // Outside production TURN may legitimately be unset (`env.ts` only requires it in production).
    // A clean 503 — never `createHmac(undefined)`, which throws a 500 with a stack trace.
    it.each([
      ['no host', { TURN_STATIC_SECRET: 's3cret' }],
      ['no secret', { TURN_HOST: 'turn.elonuz.test' }],
      ['neither', {}],
    ])('answers 503 with %s configured', (_name, env) => {
      expect(() => controller(env).iceServers(user)).toThrow(
        expect.objectContaining({ status: 503, code: ERROR_CODE.NOT_IMPLEMENTED }),
      );
    });

    // The master switch: CALLS_ENABLED must gate this endpoint regardless of TURN's own state.
    describe('CALLS_ENABLED', () => {
      it('answers 503 when the flag is off, even with TURN fully configured', () => {
        expect(() =>
          controller({ ...configured, CALLS_ENABLED: 'false' }).iceServers(user),
        ).toThrow(expect.objectContaining({ status: 503, code: ERROR_CODE.NOT_IMPLEMENTED }));
      });

      it('issues a credential when the flag is on and TURN is configured', () => {
        const result = controller({ ...configured, CALLS_ENABLED: 'true' }).iceServers(user);
        expect(result.iceServers[1].credential).toEqual(expect.any(String));
      });
    });
  });

  /**
   * ⚠️ The throttler's default tracker is `req.ip`. Behind Nginx (and with `trust proxy` off) that
   * is the proxy for every request, so a shared bucket would let ten calls a minute exhaust the
   * limit for the entire platform — and would not be the per-token bucket the endpoint's own doc
   * comment promises.
   */
  describe('throttle tracker', () => {
    it('counts against the authenticated student', () => {
      expect(trackerOf({ user: { id: ME }, ip: '10.0.0.7' })).toBe(ME);
    });

    it('falls back to the IP only when there is no principal', () => {
      expect(trackerOf({ ip: '10.0.0.7' })).toBe('10.0.0.7');
      expect(trackerOf({})).toBe('unknown');
    });
  });

  describe('GET /v1/calls', () => {
    // ⚠️ IDOR: the `callerId = me OR calleeId = me` filter belongs in SQL. A mapper-side filter
    // would still have loaded — and paginated over — other students' calls.
    it('asks the repository for the caller`s own calls only', async () => {
      await controller().list(user, { page: 2, size: 20 });
      expect(calls.listForStudent).toHaveBeenCalledWith(ME, 2, 20);
    });

    it('defaults to the first page of 20', async () => {
      await controller().list(user, {});
      expect(calls.listForStudent).toHaveBeenCalledWith(ME, 1, 20);
    });

    // CALLS_ENABLED only gates `iceServers`/`invite` — history must stay readable regardless.
    it('still returns history when CALLS_ENABLED is false', async () => {
      const result = await controller({ CALLS_ENABLED: 'false' }).list(user, { page: 1, size: 20 });
      expect(result.items).toHaveLength(1);
    });

    it('returns the project pagination envelope', async () => {
      const result = await controller().list(user, { page: 1, size: 20 });
      expect(result).toMatchObject({ page: 1, size: 20, total: 1, hasNext: false });
      expect(result.items).toHaveLength(1);
    });

    it('reports hasNext while pages remain', async () => {
      calls.listForStudent.mockResolvedValueOnce({ items: [call()], total: 41 });
      expect((await controller().list(user, { page: 2, size: 20 })).hasNext).toBe(true);
    });

    it('labels the direction from the viewer, and derives the duration', async () => {
      const outgoing = await controller().list(user, { page: 1, size: 20 });
      expect(outgoing.items[0]).toMatchObject({ direction: 'OUTGOING', durationMs: 184_000 });

      calls.listForStudent.mockResolvedValueOnce({
        items: [call({ callerId: PEER, calleeId: ME })],
        total: 1,
      });
      const incoming = await controller().list(user, { page: 1, size: 20 });
      expect(incoming.items[0].direction).toBe('INCOMING');
    });

    // An unanswered call has no conversation time — `durationMsOf` is the single source of truth.
    it('reports a never-answered call as zero duration', async () => {
      calls.listForStudent.mockResolvedValueOnce({
        items: [call({ status: CallStatus.MISSED, answeredAt: null })],
        total: 1,
      });
      expect((await controller().list(user, { page: 1, size: 20 })).items[0].durationMs).toBe(0);
    });
  });
});
