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

const liveState = (status = CallStatus.RINGING, relayOnly = false): CallState => ({
  callId: CALL_ID,
  conversationId: 'cnv_1',
  callerId: CALLER,
  calleeId: CALLEE,
  media: CallMedia.AUDIO,
  status,
  startedAt: '2026-08-01T10:00:00.000Z',
  answeredAt: null,
  relayOnly,
});

describe('CallsService relay & timers', () => {
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
    markPresent: jest.fn(),
    isPresent: jest.fn(async () => false),
    clearPresent: jest.fn(),
  };
  const timers = { schedule: jest.fn(), cancel: jest.fn(), cancelAll: jest.fn() };
  const limiter = {
    checkInvite: jest.fn(),
    countUnanswered: jest.fn(),
    clearInCallCounters: jest.fn(),
  };
  const bus = { publish: jest.fn() };
  const callPush = { ring: jest.fn(), cancel: jest.fn() };
  // Only `invite` reads CALLS_ENABLED — none of the relay/timer methods this file exercises do.
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
      // Ringing and cancel pushes have their own service and their own tests; inert here.
      callPush as never,
      config as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    state.get.mockResolvedValue(liveState());
  });

  describe('relayTo', () => {
    it('routes to the other participant', async () => {
      expect(await service().relayTo(CALLER, CALL_ID)).toEqual({
        peerId: CALLEE,
        relayOnly: false,
      });
      expect(await service().relayTo(CALLEE, CALL_ID)).toEqual({
        peerId: CALLER,
        relayOnly: false,
      });
    });

    // ⚠️ Without this a stranger could inject ICE candidates or push an SDP that redirects the
    // media stream to an endpoint they control.
    it('refuses a non-participant', async () => {
      await expect(service().relayTo(STRANGER, CALL_ID)).rejects.toMatchObject({ status: 403 });
    });

    // §9.2: `call:ice` calls this once per candidate — the decision must come straight off the
    // cached live state, never a fresh `hasCompletedCallBetween` read against Postgres.
    it('returns the relayOnly decision cached on the live call state, without re-querying', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.RINGING, true));
      expect(await service().relayTo(CALLER, CALL_ID)).toEqual({ peerId: CALLEE, relayOnly: true });
      expect(calls.hasCompletedCallBetween).not.toHaveBeenCalled();
    });
  });

  describe('timers', () => {
    it('misses a call still ringing at 45s', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.RINGING));
      await service().onTimer('ring', CALL_ID, null);
      expect(calls.finish).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({ status: CallStatus.MISSED, endReason: CallEndReason.TIMEOUT }),
      );
    });

    // The job may fire after a cancel that was lost with the instance that scheduled it.
    it('does nothing when the call already moved on', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      await service().onTimer('ring', CALL_ID, null);
      expect(calls.finish).not.toHaveBeenCalled();
    });

    it('does nothing when the live state is gone', async () => {
      state.get.mockResolvedValue(null);
      await service().onTimer('ring', CALL_ID, null);
      expect(calls.finish).not.toHaveBeenCalled();
    });

    it('fails a call stuck in CONNECTING at 30s', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.CONNECTING));
      await service().onTimer('connect', CALL_ID, null);
      expect(calls.finish).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({ status: CallStatus.FAILED }),
      );
    });

    it('ends an active call at the four hour cap', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      await service().onTimer('max', CALL_ID, null);
      expect(calls.finish).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({ status: CallStatus.ENDED, endReason: CallEndReason.TIMEOUT }),
      );
    });

    // A short drop — a tunnel, a lift — must not kill the call: WebRTC media is independent of
    // the signalling socket.
    it('spares a call whose participant came back', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      state.isPresent = jest.fn(async () => true);
      await service().onTimer('grace', CALL_ID, CALLER);
      expect(calls.finish).not.toHaveBeenCalled();
    });

    it('fails a call whose participant never came back', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      state.isPresent = jest.fn(async () => false);
      await service().onTimer('grace', CALL_ID, CALLER);
      expect(calls.finish).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({ status: CallStatus.FAILED }),
      );
    });

    // ⚠️ Without the observed-status CAS + explicit `false`, a callee could let their own socket sit
    // dark for the 20s grace window while still RINGING — comfortably inside the 45s ring window —
    // and have grace fail their own incoming call as FAILED, charging the CALLER's pair budget for
    // the callee's own silence, with no trace of who caused it.
    it('does not charge the caller when grace fires during RINGING', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.RINGING));
      state.isPresent = jest.fn(async () => false);
      await service().onTimer('grace', CALL_ID, CALLEE);
      expect(state.compareAndSetStatus).toHaveBeenCalledWith(
        CALL_ID,
        [CallStatus.RINGING],
        CallStatus.FAILED,
      );
      expect(calls.finish).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({ status: CallStatus.FAILED }),
      );
      expect(limiter.countUnanswered).not.toHaveBeenCalled();
    });

    // ⚠️ `closeCall` CASes the terminal status into the hash and only deletes it (`release`) after
    // Postgres has been written, so the live state is briefly terminal. Grace uses the status it
    // observed as its CAS `from`, so a job firing in that window would write `ENDED → FAILED` — a
    // transition the state machine forbids — and race `finish()` for the history row and the chat
    // message, which could then read FAILED/FAILED instead of ENDED/HANGUP.
    it.each([CallStatus.ENDED, CallStatus.MISSED, CallStatus.DECLINED, CallStatus.CANCELED])(
      'is a no-op when the live state has already gone %s',
      async (status) => {
        state.get.mockResolvedValue(liveState(status));
        state.isPresent = jest.fn(async () => false);

        expect(await service().onTimer('grace', CALL_ID, CALLER)).toBeNull();

        expect(state.compareAndSetStatus).not.toHaveBeenCalled();
        expect(calls.finish).not.toHaveBeenCalled();
      },
    );

    // The observed status is the CAS's `from` — a call that has already moved on by the time grace
    // gets to write must lose cleanly, the same as `ring`/`connect`.
    it('grace loses cleanly when the status changed under it', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      state.isPresent = jest.fn(async () => false);
      state.compareAndSetStatus.mockResolvedValueOnce(false);
      const outcome = await service().onTimer('grace', CALL_ID, CALLER);
      expect(outcome).toBeNull();
      expect(calls.finish).not.toHaveBeenCalled();
    });
  });

  /**
   * ⚠️ Nothing else emits `call:ended` for a timer-driven close — the gateway emits it only from
   * `call:end`. Without this hook a 45s ring-out closes the call server-side while the caller's
   * phone keeps ringing with no signal at all, and the same holds for the connect timeout, the 4h
   * cap and the disconnect-grace close.
   */
  describe('broadcaster', () => {
    it('announces a timer-driven close to the registered broadcaster', async () => {
      const broadcast = jest.fn();
      const subject = service();
      subject.registerBroadcaster(broadcast);
      state.get.mockResolvedValue(liveState(CallStatus.RINGING));

      await subject.onTimer('ring', CALL_ID, null);

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          callId: CALL_ID,
          participants: [CALLER, CALLEE],
          reason: CallEndReason.TIMEOUT,
        }),
      );
    });

    it('stays silent when the timer was a no-op', async () => {
      const broadcast = jest.fn();
      const subject = service();
      subject.registerBroadcaster(broadcast);
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));

      await subject.onTimer('ring', CALL_ID, null);

      expect(broadcast).not.toHaveBeenCalled();
    });

    // The call is already closed by the time this runs, and the caller is the BullMQ worker: a
    // throwing emit must not fail the job (and be retried against a terminal call), it must log.
    it('survives a broadcaster that throws', async () => {
      const subject = service();
      subject.registerBroadcaster(() => {
        throw new Error('socket server gone');
      });
      state.get.mockResolvedValue(liveState(CallStatus.RINGING));

      await expect(subject.onTimer('ring', CALL_ID, null)).resolves.toMatchObject({
        callId: CALL_ID,
      });
    });

    // Nothing registers a broadcaster in a unit context, and a timer can fire before the gateway's
    // `onModuleInit` has run at boot — neither may throw.
    it('does nothing when no broadcaster is registered', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.RINGING));
      await expect(service().onTimer('ring', CALL_ID, null)).resolves.toMatchObject({
        callId: CALL_ID,
      });
    });
  });

  describe('presence hooks', () => {
    // ⚠️ Rule 0 (design §6.0): a callId is an identifier, never a capability. Without this a
    // stranger could schedule/cancel a grace timer against a call they have nothing to do with.
    it('rejects a non-participant on socket-present', async () => {
      await expect(service().onSocketPresent(STRANGER, CALL_ID)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('rejects a non-participant on socket-gone', async () => {
      await expect(service().onSocketGone(STRANGER, CALL_ID)).rejects.toMatchObject({
        status: 403,
      });
    });

    // ⚠️ The call the socket was tracking may already be over (cancel, decline, timeout, a normal
    // hangup) by the time the socket drops, and `closeCall` deletes the Redis hash on every
    // terminal transition — a missing live state here is the normal case, not an error. Throwing
    // would let `CallsGateway#handleDisconnect` crash the process (Nest neither awaits nor catches
    // that handler), the gateway review that motivated this fix.
    it('is a no-op on socket-gone once the live state is already released', async () => {
      state.get.mockResolvedValueOnce(null);
      await expect(service().onSocketGone(CALLER, CALL_ID)).resolves.toBeUndefined();
      expect(state.clearPresent).not.toHaveBeenCalled();
      expect(timers.schedule).not.toHaveBeenCalled();
    });
  });
});
