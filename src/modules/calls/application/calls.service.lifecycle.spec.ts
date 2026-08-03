import { ERROR_CODE } from '../../../common/errors/error-code';
import { Call, CallState } from '../domain/entities/call.entity';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallParty } from '../domain/enums/call-party.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallsService } from './calls.service';

const CALLER = 'std_caller';
const CALLEE = 'std_callee';
const STRANGER = 'std_stranger';
const CALL_ID = 'call_1';

const liveState = (status = CallStatus.RINGING): CallState => ({
  callId: CALL_ID,
  conversationId: 'cnv_1',
  callerId: CALLER,
  calleeId: CALLEE,
  media: CallMedia.AUDIO,
  status,
  startedAt: '2026-08-01T10:00:00.000Z',
  answeredAt: null,
  relayOnly: false,
});

describe('CallsService lifecycle', () => {
  const calls = {
    finish: jest.fn(async (): Promise<Call | null> => ({
      id: CALL_ID,
      conversationId: 'cnv_1',
      callerId: CALLER,
      calleeId: CALLEE,
      media: CallMedia.AUDIO,
      relayOnly: false,
      status: CallStatus.ENDED,
      startedAt: new Date('2026-08-01T10:00:00.000Z'),
      answeredAt: new Date('2026-08-01T10:00:10.000Z'),
      endedAt: new Date('2026-08-01T10:03:14.000Z'),
      endReason: CallEndReason.HANGUP,
      endedBy: CallParty.CALLER,
    })),
    markActive: jest.fn(async () => true),
    hasCompletedCallBetween: jest.fn(async () => true),
    findById: jest.fn(async (): Promise<Call | null> => null),
  };
  const state = {
    get: jest.fn(async (): Promise<CallState | null> => liveState()),
    compareAndSetStatus: jest.fn(async () => true),
    release: jest.fn(),
    claim: jest.fn(),
  };
  const timers = { schedule: jest.fn(), cancel: jest.fn(), cancelAll: jest.fn() };
  const limiter = {
    checkInvite: jest.fn(),
    countUnanswered: jest.fn(),
    clearInCallCounters: jest.fn(),
  };
  const bus = { publish: jest.fn() };
  // Only `invite` reads CALLS_ENABLED — none of the lifecycle methods this file exercises do, so
  // the value here is inert for everything except the dedicated test below.
  const config = { get: jest.fn(() => 'true') };

  const service = (): CallsService =>
    new CallsService(
      calls as never,
      state as never,
      timers as never,
      { findOrCreateDirect: jest.fn() } as never,
      { summary: jest.fn() } as never,
      { connectionState: jest.fn() } as never,
      limiter as never,
      bus as never,
      config as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    state.get.mockResolvedValue(liveState());
  });

  // ⚠️ THE security test of this feature. Without it a stranger who learns a callId can accept
  // someone else's invite and become the peer — a live audio/video eavesdrop.
  describe('a non-participant', () => {
    it.each([
      ['accept', (s: CallsService) => s.accept(STRANGER, CALL_ID, 'sdp')],
      ['decline', (s: CallsService) => s.decline(STRANGER, CALL_ID, 'DECLINED')],
      ['cancel', (s: CallsService) => s.cancel(STRANGER, CALL_ID)],
      ['end', (s: CallsService) => s.end(STRANGER, CALL_ID)],
      ['markConnected', (s: CallsService) => s.markConnected(STRANGER, CALL_ID)],
    ])('cannot %s', async (_name, act) => {
      await expect(act(service())).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
    });
  });

  describe('role matrix', () => {
    it('lets only the callee accept', async () => {
      await expect(service().accept(CALLER, CALL_ID, 'sdp')).rejects.toMatchObject({ status: 403 });
      await expect(service().accept(CALLEE, CALL_ID, 'sdp')).resolves.toBeDefined();
    });

    it('lets only the callee decline', async () => {
      await expect(service().decline(CALLER, CALL_ID, 'DECLINED')).rejects.toMatchObject({
        status: 403,
      });
    });

    it('lets only the caller cancel', async () => {
      await expect(service().cancel(CALLEE, CALL_ID)).rejects.toMatchObject({ status: 403 });
      await expect(service().cancel(CALLER, CALL_ID)).resolves.toBeDefined();
    });

    it('lets either side end', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      await expect(service().end(CALLER, CALL_ID)).resolves.toBeDefined();
      await expect(service().end(CALLEE, CALL_ID)).resolves.toBeDefined();
    });
  });

  it('reports CALL_NOT_FOUND for an unknown call', async () => {
    state.get.mockResolvedValueOnce(null);
    await expect(service().end(CALLER, CALL_ID)).rejects.toMatchObject({
      code: ERROR_CODE.CALL_NOT_FOUND,
    });
  });

  describe('accept', () => {
    it('moves to CONNECTING and arms the connect timeout', async () => {
      await service().accept(CALLEE, CALL_ID, 'sdp');
      expect(state.compareAndSetStatus).toHaveBeenCalledWith(
        CALL_ID,
        [CallStatus.RINGING],
        CallStatus.CONNECTING,
      );
      expect(timers.cancel).toHaveBeenCalledWith('ring', CALL_ID);
      expect(timers.schedule).toHaveBeenCalledWith('connect', CALL_ID, 30_000);
    });

    // First accept wins across devices — the CAS is what makes the second one lose.
    it('rejects a second accept from another device', async () => {
      state.compareAndSetStatus.mockResolvedValueOnce(false);
      await expect(service().accept(CALLEE, CALL_ID, 'sdp')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_CALL_STATE,
      });
    });
  });

  describe('markConnected', () => {
    it('moves to ACTIVE and swaps the connect timeout for the duration cap', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.CONNECTING));
      await service().markConnected(CALLEE, CALL_ID);
      expect(timers.cancel).toHaveBeenCalledWith('connect', CALL_ID);
      expect(timers.schedule).toHaveBeenCalledWith('max', CALL_ID, 4 * 3600 * 1000);
    });
  });

  describe('end', () => {
    it('returns both participants and the measured duration', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      const outcome = await service().end(CALLER, CALL_ID);
      expect(outcome).not.toBeNull();
      expect(outcome?.participants).toEqual(expect.arrayContaining([CALLER, CALLEE]));
      expect(outcome?.durationMs).toBe(184_000);
      expect(outcome?.endedBy).toBe(CallParty.CALLER);
    });

    // ⚠️ THE regression test for the master switch: flipping CALLS_ENABLED off must never strand a
    // call already in progress. Only `invite` reads the flag — `end` must succeed exactly as if it
    // were still on.
    it('still ends an in-progress call when CALLS_ENABLED is false', async () => {
      config.get.mockReturnValueOnce('false');
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      const outcome = await service().end(CALLER, CALL_ID);
      expect(outcome).not.toBeNull();
      expect(outcome?.endedBy).toBe(CallParty.CALLER);
    });

    it('cancels every timer and frees the live state', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      await service().end(CALLER, CALL_ID);
      expect(timers.cancelAll).toHaveBeenCalledWith(CALL_ID);
      expect(timers.cancel).toHaveBeenCalledWith('grace', CALL_ID, CALLER);
      expect(timers.cancel).toHaveBeenCalledWith('grace', CALL_ID, CALLEE);
      expect(state.release).toHaveBeenCalledWith(CALL_ID);
    });

    // A retrying client sends `call:end` twice — that must be silent, not an error.
    it('is idempotent when the row already reached a terminal status', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      calls.finish.mockResolvedValueOnce(null);
      await expect(service().end(CALLER, CALL_ID)).resolves.toBeNull();
      expect(bus.publish).not.toHaveBeenCalled();
    });

    // Fix round 1, finding 1: ENDED is only a valid transition from CONNECTING/ACTIVE. A
    // still-RINGING call must leave via `cancel`/`decline`, never `end` — otherwise a caller could
    // invite, immediately `end` their own still-RINGING call, and leave an ENDED/answeredAt:null row
    // that `hasCompletedCallBetween` would (without the repository-level fix too) treat as a
    // completed call, silently turning off forced TURN relay for the pair's real first call.
    it('does not end a still-RINGING call — cancel/decline are the only ways out of RINGING', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.RINGING));
      state.compareAndSetStatus.mockResolvedValueOnce(false);
      await expect(service().end(CALLER, CALL_ID)).resolves.toBeNull();
      expect(state.compareAndSetStatus).toHaveBeenCalledWith(
        CALL_ID,
        [CallStatus.CONNECTING, CallStatus.ACTIVE],
        CallStatus.ENDED,
      );
      expect(calls.finish).not.toHaveBeenCalled();
    });

    // Fix round 1, finding 2: `closeCall` deletes the Redis hash as the last step of a successful
    // `end`, so a retry (lost ack, reconnect replay) finds no live state. Reproduces the real
    // sequence: a first `end` succeeds, then a second `end` — with Redis now empty, exactly as
    // `release` leaves it — must resolve quietly instead of 404ing.
    it('is idempotent when a retry finds Redis has already lost the state', async () => {
      state.get.mockResolvedValueOnce(liveState(CallStatus.ACTIVE));
      await expect(service().end(CALLER, CALL_ID)).resolves.not.toBeNull();

      state.get.mockResolvedValueOnce(null);
      calls.findById.mockResolvedValueOnce({
        id: CALL_ID,
        conversationId: 'cnv_1',
        callerId: CALLER,
        calleeId: CALLEE,
        media: CallMedia.AUDIO,
        relayOnly: false,
        status: CallStatus.ENDED,
        startedAt: new Date(),
        answeredAt: new Date(),
        endedAt: new Date(),
        endReason: CallEndReason.HANGUP,
        endedBy: CallParty.CALLER,
      });
      await expect(service().end(CALLER, CALL_ID)).resolves.toBeNull();
    });

    it('still 404s when neither Redis nor Postgres has heard of the call', async () => {
      state.get.mockResolvedValueOnce(null);
      calls.findById.mockResolvedValueOnce(null);
      await expect(service().end(CALLER, CALL_ID)).rejects.toMatchObject({
        code: ERROR_CODE.CALL_NOT_FOUND,
      });
    });

    it('still 403s a stranger even once Redis has lost the state, not 404', async () => {
      state.get.mockResolvedValueOnce(null);
      calls.findById.mockResolvedValueOnce({
        id: CALL_ID,
        conversationId: 'cnv_1',
        callerId: CALLER,
        calleeId: CALLEE,
        media: CallMedia.AUDIO,
        relayOnly: false,
        status: CallStatus.ENDED,
        startedAt: new Date(),
        answeredAt: new Date(),
        endedAt: new Date(),
        endReason: CallEndReason.HANGUP,
        endedBy: CallParty.CALLER,
      });
      await expect(service().end(STRANGER, CALL_ID)).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
    });

    // Fix round 2, finding 1: a lost-Redis CONNECTING/ACTIVE call is real media still flowing
    // peer-to-peer, and the participant needs a working kill switch rather than waiting up to 4h
    // for `expireStale`. `finish()`'s conditional UPDATE is race-safe without Redis.
    it('lets a participant close their own call after Redis has lost an ACTIVE call state', async () => {
      state.get.mockResolvedValueOnce(null);
      calls.findById.mockResolvedValueOnce({
        id: CALL_ID,
        conversationId: 'cnv_1',
        callerId: CALLER,
        calleeId: CALLEE,
        media: CallMedia.AUDIO,
        relayOnly: false,
        status: CallStatus.ACTIVE,
        startedAt: new Date(),
        answeredAt: new Date(),
        endedAt: null,
        endReason: null,
        endedBy: null,
      });
      const outcome = await service().end(CALLER, CALL_ID);
      expect(outcome).not.toBeNull();
      expect(calls.finish).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({ status: CallStatus.ENDED, endReason: CallEndReason.HANGUP }),
      );
    });

    // A lost-Redis RINGING row must NOT be recover-closed via `end` — ENDED is not a valid
    // transition from RINGING (that is the whole point of the CAS above); writing it anyway would
    // reopen finding 1 from fix round 1. Left to `expireStale`.
    it('does not recover-close a lost-Redis RINGING row — left to expireStale', async () => {
      state.get.mockResolvedValueOnce(null);
      calls.findById.mockResolvedValueOnce({
        id: CALL_ID,
        conversationId: 'cnv_1',
        callerId: CALLER,
        calleeId: CALLEE,
        media: CallMedia.AUDIO,
        relayOnly: false,
        status: CallStatus.RINGING,
        startedAt: new Date(),
        answeredAt: null,
        endedAt: null,
        endReason: null,
        endedBy: null,
      });
      await expect(service().end(CALLER, CALL_ID)).rejects.toMatchObject({
        code: ERROR_CODE.CALL_NOT_FOUND,
      });
      expect(calls.finish).not.toHaveBeenCalled();
    });
  });

  // Fix round 2, finding 2: `closeCall` also deletes the Redis hash on a successful `decline` — the
  // same idempotency gap `end` had, left in place for this method.
  describe('decline recovery (Redis has lost the state)', () => {
    it('is idempotent on a retry once the row has gone terminal', async () => {
      state.get.mockResolvedValueOnce(null);
      calls.findById.mockResolvedValueOnce({
        id: CALL_ID,
        conversationId: 'cnv_1',
        callerId: CALLER,
        calleeId: CALLEE,
        media: CallMedia.AUDIO,
        relayOnly: false,
        status: CallStatus.DECLINED,
        startedAt: new Date(),
        answeredAt: null,
        endedAt: new Date(),
        endReason: CallEndReason.DECLINED,
        endedBy: CallParty.CALLEE,
      });
      await expect(service().decline(CALLEE, CALL_ID, 'DECLINED')).resolves.toBeNull();
    });

    it('still only lets the callee recover-decline', async () => {
      state.get.mockResolvedValueOnce(null);
      calls.findById.mockResolvedValueOnce({
        id: CALL_ID,
        conversationId: 'cnv_1',
        callerId: CALLER,
        calleeId: CALLEE,
        media: CallMedia.AUDIO,
        relayOnly: false,
        status: CallStatus.RINGING,
        startedAt: new Date(),
        answeredAt: null,
        endedAt: null,
        endReason: null,
        endedBy: null,
      });
      await expect(service().decline(CALLER, CALL_ID, 'DECLINED')).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  // Same idempotency gap, same fix, for `cancel`.
  describe('cancel recovery (Redis has lost the state)', () => {
    it('is idempotent on a retry once the row has gone terminal', async () => {
      state.get.mockResolvedValueOnce(null);
      calls.findById.mockResolvedValueOnce({
        id: CALL_ID,
        conversationId: 'cnv_1',
        callerId: CALLER,
        calleeId: CALLEE,
        media: CallMedia.AUDIO,
        relayOnly: false,
        status: CallStatus.CANCELED,
        startedAt: new Date(),
        answeredAt: null,
        endedAt: new Date(),
        endReason: CallEndReason.CANCELED,
        endedBy: CallParty.CALLER,
      });
      await expect(service().cancel(CALLER, CALL_ID)).resolves.toBeNull();
    });

    it('still only lets the caller recover-cancel', async () => {
      state.get.mockResolvedValueOnce(null);
      calls.findById.mockResolvedValueOnce({
        id: CALL_ID,
        conversationId: 'cnv_1',
        callerId: CALLER,
        calleeId: CALLEE,
        media: CallMedia.AUDIO,
        relayOnly: false,
        status: CallStatus.RINGING,
        startedAt: new Date(),
        answeredAt: null,
        endedAt: null,
        endReason: null,
        endedBy: null,
      });
      await expect(service().cancel(CALLEE, CALL_ID)).rejects.toMatchObject({ status: 403 });
    });
  });

  it('counts an unanswered call against the pair budget', async () => {
    calls.finish.mockResolvedValueOnce({
      id: CALL_ID,
      conversationId: 'cnv_1',
      callerId: CALLER,
      calleeId: CALLEE,
      media: CallMedia.AUDIO,
      relayOnly: false,
      status: CallStatus.DECLINED,
      startedAt: new Date(),
      answeredAt: null,
      endedAt: new Date(),
      endReason: CallEndReason.DECLINED,
      endedBy: CallParty.CALLEE,
    });
    await service().decline(CALLEE, CALL_ID, 'DECLINED');
    expect(limiter.countUnanswered).toHaveBeenCalledWith(CALLER, CALLEE);
  });

  // Judgment call (task-13 report): a CONNECTING call that fails before reaching ACTIVE means the
  // callee already answered, so the failure is usually their network, not the caller ringing
  // abusively — it must not spend the caller's pair budget even though `answeredAt` is still null.
  // No public method reaches `closeCall(..., FAILED, ...)` yet (that lands with the Task 14
  // connect-timeout handler); this reaches the private helper directly so the rule is pinned down
  // now, in the one place all terminal writes flow through.
  it('does not charge the caller when a CONNECTING call fails before reaching ACTIVE', async () => {
    state.get.mockResolvedValue(liveState(CallStatus.CONNECTING));
    calls.finish.mockResolvedValueOnce({
      id: CALL_ID,
      conversationId: 'cnv_1',
      callerId: CALLER,
      calleeId: CALLEE,
      media: CallMedia.AUDIO,
      relayOnly: false,
      status: CallStatus.FAILED,
      startedAt: new Date(),
      answeredAt: null,
      endedAt: new Date(),
      endReason: CallEndReason.FAILED,
      endedBy: null,
    });
    const instance = service() as unknown as {
      closeCall(
        callId: string,
        status: CallStatus,
        reason: CallEndReason,
        endedBy: CallParty | null,
      ): Promise<unknown>;
    };
    await instance.closeCall(CALL_ID, CallStatus.FAILED, CallEndReason.FAILED, null);
    expect(limiter.countUnanswered).not.toHaveBeenCalled();
  });
});
