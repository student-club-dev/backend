import { AppException } from '../../../common/exceptions/app.exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { Call } from '../domain/entities/call.entity';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallsService, InviteInput } from './calls.service';

const CALLER = 'std_caller';
const CALLEE = 'std_callee';

describe('CallsService.invite', () => {
  const calls = {
    create: jest.fn(async (input: { id: string }) => ({
      id: input.id,
      status: CallStatus.RINGING,
    })),
    finish: jest.fn().mockResolvedValue(null),
    findById: jest.fn(async () => null),
    hasCompletedCallBetween: jest.fn(async () => false),
  };
  const state = {
    claim: jest.fn().mockResolvedValue({ kind: 'CLAIM' }),
    release: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
  };
  const timers = { schedule: jest.fn(), cancel: jest.fn(), cancelAll: jest.fn() };
  const conversations = { findOrCreateDirect: jest.fn(async () => 'cnv_1') };
  const students = {
    summary: jest.fn().mockResolvedValue({
      id: CALLER,
      fullName: 'Aziz',
      username: null,
      avatarUrl: null,
    }),
  };
  const connections = { connectionState: jest.fn().mockResolvedValue('CONNECTED') };
  const limiter = {
    checkInvite: jest.fn(),
    countUnanswered: jest.fn(),
    clearInCallCounters: jest.fn(),
  };
  const bus = { publish: jest.fn() };
  const callPush = { ring: jest.fn(), cancel: jest.fn() };
  // CALLS_ENABLED is the only key this service reads off `ConfigService` — default it to the
  // enabled state so the tests above (all written before the flag gated `invite`) keep exercising
  // the behaviour they actually name. The one test that cares about the flag overrides it below.
  const config = {
    get: jest.fn((key: string): string | undefined =>
      key === 'CALLS_ENABLED' ? 'true' : undefined,
    ),
  };

  const service = (): CallsService =>
    new CallsService(
      calls as never,
      state as never,
      timers as never,
      conversations as never,
      students as never,
      connections as never,
      limiter as never,
      bus as never,
      // Ringing and cancel pushes have their own service and their own tests; inert here.
      callPush as never,
      config as never,
    );

  const input = { calleeId: CALLEE, media: CallMedia.AUDIO, sdp: 'v=0...' };

  /**
   * A `Call` shaped enough to exercise `closeCall`'s `finished !== null` branch.
   *
   * `answeredAt: null` is load-bearing: it is what makes `countAgainstCaller` (not the
   * `answeredAt === null` guard) the thing "does not charge the glare loser for being preempted"
   * below actually proves. Set it to a `Date` and that assertion would pass vacuously.
   */
  const loserCall = (overrides: Partial<Call> = {}): Call => ({
    id: 'c_loser',
    conversationId: 'cnv_1',
    callerId: CALLEE,
    calleeId: CALLER,
    media: CallMedia.AUDIO,
    relayOnly: false,
    status: CallStatus.DECLINED,
    startedAt: new Date(),
    answeredAt: null,
    endedAt: new Date(),
    endReason: CallEndReason.BUSY,
    endedBy: null,
    ...overrides,
  });

  beforeEach(() => jest.clearAllMocks());

  // The master-switch behaviour: `invite` must be the ONLY thing this flag rejects, and a rejected
  // invite must cost nothing — no rate-limit budget spent, no Redis claim, no history row.
  it('rejects a new call when CALLS_ENABLED is false, without spending anything', async () => {
    config.get.mockReturnValueOnce('false');
    await expect(service().invite(CALLER, input)).rejects.toMatchObject({
      status: 503,
      code: ERROR_CODE.NOT_IMPLEMENTED,
    });
    expect(limiter.checkInvite).not.toHaveBeenCalled();
    expect(state.claim).not.toHaveBeenCalled();
    expect(calls.create).not.toHaveBeenCalled();
  });

  it('creates a ringing call and arms the ring timeout', async () => {
    const result = await service().invite(CALLER, input);
    expect(result.callId).toEqual(expect.any(String));
    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({ callerId: CALLER, calleeId: CALLEE, conversationId: 'cnv_1' }),
    );
    expect(timers.schedule).toHaveBeenCalledWith('ring', result.callId, 45_000);
  });

  // ⚠️ The client sends no conversationId. Trusting one would let a caller name a conversation they
  // are not a member of, and the CALL message written at the end would land in strangers' chat.
  it('resolves the conversation from the pair, not from the client', async () => {
    await service().invite(CALLER, input);
    expect(conversations.findOrCreateDirect).toHaveBeenCalledWith(CALLER, CALLEE);
  });

  it('ignores a client-supplied conversationId', async () => {
    const spoofed = { ...input, conversationId: 'cnv_evil' } as InviteInput;
    const result = await service().invite(CALLER, spoofed);
    expect(calls.create).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'cnv_1' }));
    expect(result.conversationId).toEqual('cnv_1');
  });

  it('rejects a call to yourself', async () => {
    await expect(service().invite(CALLER, { ...input, calleeId: CALLER })).rejects.toMatchObject({
      code: ERROR_CODE.VALIDATION_ERROR,
    });
    expect(connections.connectionState).not.toHaveBeenCalled();
    expect(state.claim).not.toHaveBeenCalled();
  });

  it('rejects an unconnected pair', async () => {
    connections.connectionState.mockResolvedValueOnce('NOT_CONNECTED');
    await expect(service().invite(CALLER, input)).rejects.toMatchObject({
      code: ERROR_CODE.NOT_CONNECTED,
    });
  });

  it('rejects a blocked pair with a distinct code', async () => {
    connections.connectionState.mockResolvedValueOnce('BLOCKED');
    await expect(service().invite(CALLER, input)).rejects.toMatchObject({
      code: ERROR_CODE.USER_BLOCKED,
    });
  });

  // `summary(callerId)` fetches the CALLER's own summary (what `call:incoming` renders on the
  // callee's screen), not a callee-existence check — see the comment in calls.service.ts.
  it('checks that the caller summary resolves before creating any call state', async () => {
    students.summary.mockResolvedValueOnce(null);
    await expect(service().invite(CALLER, input)).rejects.toMatchObject({
      code: ERROR_CODE.STUDENT_NOT_FOUND,
    });
    expect(conversations.findOrCreateDirect).not.toHaveBeenCalled();
    expect(state.claim).not.toHaveBeenCalled();
    expect(calls.create).not.toHaveBeenCalled();
  });

  it('checks the rate limit before creating anything', async () => {
    limiter.checkInvite.mockRejectedValueOnce(new AppException(ERROR_CODE.RATE_LIMITED, 429, 'x'));
    await expect(service().invite(CALLER, input)).rejects.toMatchObject({ status: 429 });
    expect(calls.create).not.toHaveBeenCalled();
  });

  // Regression test: an earlier version had a DB round trip (`findOrCreateDirect`) sitting between
  // the pair-budget read and the atomic Redis claim — a window where two concurrent invites could
  // both observe an under-limit value and both proceed. The rate-limit test above alone does not
  // catch this: it passes under either ordering.
  it('checks the rate limit immediately before claiming redis state, nothing else awaited in between', async () => {
    await service().invite(CALLER, input);
    const checkOrder = limiter.checkInvite.mock.invocationCallOrder[0];
    const claimOrder = state.claim.mock.invocationCallOrder[0];
    expect(checkOrder).toBeLessThan(claimOrder);

    // Built by iterating the fixture's own mock objects, not hand-enumerated: any awaited port
    // added to any of these mocks in the future is automatically covered, so this test cannot be
    // silently outgrown the way the original ordering bug shipped past a narrower assertion.
    const fixtures: Record<string, unknown>[] = [
      calls,
      state,
      timers,
      conversations,
      students,
      connections,
      limiter,
      bus,
    ];
    const otherOrders = fixtures.flatMap((fixture) =>
      Object.values(fixture)
        .filter(
          (candidate) =>
            candidate !== limiter.checkInvite &&
            candidate !== state.claim &&
            jest.isMockFunction(candidate),
        )
        .flatMap((mockFn) => (mockFn as jest.Mock).mock.invocationCallOrder),
    );
    expect(otherOrders.some((order) => order > checkOrder && order < claimOrder)).toBe(false);
  });

  it('reports BUSY when the callee is already on a call', async () => {
    state.claim.mockResolvedValueOnce({ kind: 'BUSY' });
    await expect(service().invite(CALLER, input)).rejects.toMatchObject({
      code: ERROR_CODE.CALL_BUSY,
    });
    expect(calls.create).not.toHaveBeenCalled();
    expect(limiter.countUnanswered).not.toHaveBeenCalled();
  });

  it('closes the loser with BUSY when it preempts a mirror call', async () => {
    state.claim.mockResolvedValueOnce({ kind: 'PREEMPT', loserCallId: 'c_loser' });
    calls.finish.mockResolvedValueOnce(loserCall());

    const result = await service().invite(CALLER, input);

    expect(calls.finish).toHaveBeenCalledWith(
      'c_loser',
      expect.objectContaining({ status: CallStatus.DECLINED, endReason: CallEndReason.BUSY }),
    );
    // Release-key ownership is the security property here: only the loser's keys are freed, never
    // the winner's — a bug here would let closing the loser delete the winner's own busy keys.
    expect(state.release).toHaveBeenCalledTimes(1);
    expect(state.release).toHaveBeenCalledWith('c_loser');
    expect(result.callId).not.toEqual('c_loser');
    expect(calls.create).toHaveBeenCalledWith(expect.objectContaining({ id: result.callId }));
  });

  it('does not charge the glare loser for being preempted', async () => {
    state.claim.mockResolvedValueOnce({ kind: 'PREEMPT', loserCallId: 'c_loser' });
    calls.finish.mockResolvedValueOnce(loserCall());

    await service().invite(CALLER, input);

    expect(limiter.countUnanswered).not.toHaveBeenCalled();
    expect(bus.publish).toHaveBeenCalledWith(expect.objectContaining({ id: 'c_loser' }));
  });

  // ⚠️ The loser's caller is still watching a ringing screen for a call that no longer exists —
  // and no client event closed it, so nothing but this broadcast can tell them.
  it('announces the preempted loser to the registered broadcaster', async () => {
    state.claim.mockResolvedValueOnce({ kind: 'PREEMPT', loserCallId: 'c_loser' });
    calls.finish.mockResolvedValueOnce(loserCall());
    const broadcast = jest.fn();
    const subject = service();
    subject.registerBroadcaster(broadcast);

    await subject.invite(CALLER, input);

    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'c_loser', reason: CallEndReason.BUSY }),
    );
  });

  it('does not fail the winning invite when closing the preempted loser throws', async () => {
    state.claim.mockResolvedValueOnce({ kind: 'PREEMPT', loserCallId: 'c_loser' });
    calls.finish.mockRejectedValueOnce(new Error('loser close failed'));

    const result = await service().invite(CALLER, input);

    expect(result.callId).toEqual(expect.any(String));
    expect(calls.create).toHaveBeenCalledWith(expect.objectContaining({ id: result.callId }));
  });

  it('releases the claimed busy keys when writing the call row fails', async () => {
    calls.create.mockRejectedValueOnce(new Error('db down'));
    await expect(service().invite(CALLER, input)).rejects.toThrow('db down');
    const claimedCallId = (state.claim.mock.calls[0][0] as { callId: string }).callId;
    expect(state.release).toHaveBeenCalledWith(claimedCallId);
  });

  /**
   * Forced relay hides both IP addresses from an unfamiliar pair (design §9.2).
   *
   * Each case asserts the value twice, and the second assertion is not redundant: the returned
   * `relayOnly` drives the client's `RTCConfiguration`, the persisted one is what later separates
   * a relay we forced from one NAT made unavoidable. Nothing ties them together, so a row written
   * with a hardcoded `false` would leave the wire behaviour correct and quietly make every quota
   * forecast built on `call_stats` wrong.
   */
  it('forces relay for a pair that has never completed a call', async () => {
    expect((await service().invite(CALLER, input)).relayOnly).toBe(true);
    expect(calls.create).toHaveBeenCalledWith(expect.objectContaining({ relayOnly: true }));
  });

  it('allows P2P once the pair has talked before', async () => {
    calls.hasCompletedCallBetween.mockResolvedValueOnce(true);
    expect((await service().invite(CALLER, input)).relayOnly).toBe(false);
    expect(calls.create).toHaveBeenCalledWith(expect.objectContaining({ relayOnly: false }));
  });
});
