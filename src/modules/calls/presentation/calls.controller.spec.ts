import { ERROR_CODE } from '../../../common/errors/error-code';
import { Call } from '../domain/entities/call.entity';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallParty } from '../domain/enums/call-party.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallStat } from '../domain/entities/call-stat.entity';
import { IceCandidateType } from '../domain/enums/ice-candidate-type.enum';
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
  relayOnly: false,
  status: CallStatus.ENDED,
  startedAt: new Date('2026-08-01T10:00:00.000Z'),
  answeredAt: new Date('2026-08-01T10:00:10.000Z'),
  endedAt: new Date('2026-08-01T10:03:14.000Z'),
  endReason: CallEndReason.HANGUP,
  endedBy: CallParty.CALLER,
  ...overrides,
});

/** Byte counts sit above Int32 on purpose — they are `BigInt` in the row and must survive the DTO. */
const recordedStat: CallStat = {
  callId: 'call_1',
  studentId: ME,
  rttMs: 42,
  jitterMs: 7,
  packetsLost: 3,
  packetsReceived: 9000,
  bytesSent: 3_000_000_000,
  bytesReceived: 2_500_000_000,
  candidateType: IceCandidateType.RELAY,
  createdAt: new Date('2026-08-01T10:03:15.000Z'),
};

describe('CallsController', () => {
  const calls = {
    listForStudent: jest.fn(async () => ({ items: [call()], total: 1 })),
  };

  const stats = { record: jest.fn(async () => recordedStat) };

  const config = (env: Record<string, unknown>) => ({ get: (key: string) => env[key] }) as never;

  // CALLS_ENABLED defaults to 'true' here so the pre-existing TURN-focused tests below keep
  // exercising exactly what they name — the flag itself gets its own dedicated tests.
  const controller = (env: Record<string, unknown> = {}): CallsController =>
    new CallsController(
      calls as never,
      stats as never,
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

    describe('ICE_PROVIDER=metered', () => {
      const metered = {
        ICE_PROVIDER: 'metered',
        METERED_TURN_USERNAME: 'm_user',
        METERED_TURN_CREDENTIAL: 'm_pass',
      };

      it('serves Metered’s hosts with the configured credential verbatim', () => {
        const result = controller(metered).iceServers(user);
        expect(result.iceServers[1].urls).toContain(
          'turns:global.relay.metered.ca:443?transport=tcp',
        );
        expect(result.iceServers[1].username).toBe('m_user');
        expect(result.iceServers[1].credential).toBe('m_pass');
      });

      /**
       * ⚠️ Selecting a provider must actually select it. A deployment pointed at Metered while
       * coturn credentials happen to linger in its env would relay through the wrong provider —
       * and the quota arithmetic would then be tracking an account nobody is spending against.
       */
      it('ignores coturn credentials that are also present', () => {
        const result = controller({ ...configured, ...metered }).iceServers(user);
        const urls = result.iceServers.flatMap((s) => s.urls);
        expect(urls.every((u) => u.includes('metered.ca'))).toBe(true);
      });

      it('answers 503 when its credentials are missing', () => {
        expect(() => controller({ ICE_PROVIDER: 'metered' }).iceServers(user)).toThrow(
          expect.objectContaining({ status: 503, code: ERROR_CODE.NOT_IMPLEMENTED }),
        );
      });
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

  describe('POST /v1/calls/:callId/stats', () => {
    const body = { candidateType: IceCandidateType.RELAY, bytesSent: 3_000_000_000 };

    /**
     * ⚠️ THE security property of this endpoint. Two participants share a call, and the row is keyed
     * on `(callId, studentId)` — so a student id taken from anywhere but the token would let one of
     * them overwrite the other's report, or file one against a stranger's call.
     */
    it('attributes the report to the token subject, never to the request', async () => {
      await controller().recordStats(user, 'call_1', { ...body, studentId: PEER } as never);
      expect(stats.record).toHaveBeenCalledWith(ME, 'call_1', expect.objectContaining(body));
    });

    // Byte counts are `BigInt` in the row and clear Int32 on any real video call. A DTO that
    // narrowed them would silently corrupt the only numbers the bandwidth forecast is built on.
    it('carries byte counts above Int32 through to the response', async () => {
      const result = await controller().recordStats(user, 'call_1', body as never);
      expect(result.bytesSent).toBe(3_000_000_000);
      expect(result.bytesReceived).toBe(2_500_000_000);
      expect(result.candidateType).toBe(IceCandidateType.RELAY);
      expect(result.recordedAt).toBe('2026-08-01T10:03:15.000Z');
    });
  });
});
