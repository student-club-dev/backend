import { AccountType } from '../../common/enums/account-type.enum';
import { CALL_EVENT } from './application/call-events';
import { CallsGateway } from './calls.gateway';
import { CallMedia } from './domain/enums/call-media.enum';

const socket = (studentId: string, expOffsetSeconds = 900) =>
  ({
    id: `sock_${studentId}`,
    data: { user: { id: studentId }, tokenExp: Math.floor(Date.now() / 1000) + expOffsetSeconds },
    join: jest.fn(),
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  }) as never;

describe('CallsGateway', () => {
  const calls = {
    invite: jest.fn(async () => ({
      callId: 'call_1',
      conversationId: 'cnv_1',
      expiresAt: '2026-08-01T10:00:45.000Z',
      caller: { id: 'A', fullName: 'Aziz', username: null, avatarUrl: null },
      relayOnly: true,
    })),
    end: jest.fn(async () => ({
      callId: 'call_1',
      participants: ['A', 'B'],
      reason: 'HANGUP',
      durationMs: 1000,
      endedBy: 'CALLER',
    })),
    accept: jest.fn(async () => ({ conversationId: 'cnv_1', callerId: 'B', relayOnly: true })),
    relayTo: jest.fn(async () => ({ peerId: 'B', relayOnly: false })),
    onSocketPresent: jest.fn(),
    onSocketGone: jest.fn(),
    registerBroadcaster: jest.fn(),
  };
  let gateway: CallsGateway;
  // `in(...).fetchSockets()` is how `handleDisconnect` asks whether the student still has a live
  // socket. Empty by default: the socket that dropped was their last one.
  const fetchSockets = jest.fn(async (): Promise<unknown[]> => []);
  const server = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    in: jest.fn(() => ({ fetchSockets })),
  };
  // The gateway validates payloads with `@IsUUID('4')` on callId — a filler string would be
  // rejected by validation rather than reaching the code the test is about.
  const CALL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new CallsGateway(calls as never, {} as never, {} as never);
    Object.defineProperty(gateway, 'server', { value: server, writable: true });
  });

  it('acks an invite with the callId and rings the callee', async () => {
    const ack = await gateway.onInvite(socket('A'), {
      calleeId: 'b'.repeat(25),
      media: CallMedia.AUDIO,
      sdp: 'v=0',
    });
    expect(ack).toMatchObject({ status: 'ok', callId: 'call_1', relayOnly: true });
    expect(server.emit).toHaveBeenCalledWith(
      CALL_EVENT.INCOMING,
      expect.objectContaining({ callId: 'call_1' }),
    );
  });

  it('acks an error instead of throwing', async () => {
    calls.invite.mockRejectedValueOnce(new Error('boom'));
    const ack = await gateway.onInvite(socket('A'), {
      calleeId: 'b'.repeat(25),
      media: CallMedia.AUDIO,
      sdp: 'v=0',
    });
    expect(ack).toMatchObject({ status: 'error' });
  });

  it('rejects a malformed payload before reaching the service', async () => {
    const ack = await gateway.onInvite(socket('A'), { calleeId: 'short' } as never);
    expect(ack).toMatchObject({ status: 'error' });
    expect(calls.invite).not.toHaveBeenCalled();
  });

  // ⚠️ A 4-hour call outlives a 15-minute access token. Refusing `call:end` would leave the
  // microphone and camera streaming until the duration cap fires (design §6.4).
  it('accepts call:end on an expired token', async () => {
    const ack = await gateway.onEnd(socket('A', -60), { callId: CALL_ID });
    expect(ack).toMatchObject({ status: 'ok' });
  });

  it('refuses call:invite on an expired token', async () => {
    const ack = await gateway.onInvite(socket('A', -60), {
      calleeId: 'b'.repeat(25),
      media: CallMedia.AUDIO,
      sdp: 'v=0',
    });
    expect(ack).toMatchObject({ status: 'error' });
    expect(calls.invite).not.toHaveBeenCalled();
  });

  // ⚠️ `onSocketGone` throws `CALL_NOT_FOUND` once Redis has released a finished call, and nothing
  // removes it from `client.data.callIds`. `handleDisconnect` must swallow that per call — both so
  // it never crashes the process (Nest neither awaits nor catches this handler) and so one stale
  // callId can't stop the grace window from being armed for the others.
  it('does not throw on a stale tracked call and still processes the rest', async () => {
    const client = socket('A') as unknown as { data: { callIds: Set<string> } };
    client.data.callIds = new Set(['stale-1', 'stale-2']);
    calls.onSocketGone.mockRejectedValueOnce(new Error('CALL_NOT_FOUND'));
    await expect(gateway.handleDisconnect(client as never)).resolves.toBeUndefined();
    expect(calls.onSocketGone).toHaveBeenCalledWith('A', 'stale-1');
    expect(calls.onSocketGone).toHaveBeenCalledWith('A', 'stale-2');
  });

  // ⚠️ Presence is keyed per STUDENT, this handler is per SOCKET. A client that reconnects during a
  // live call re-marks presence from its NEW socket; the superseded one is only reaped when its
  // ping times out (~45s later). Letting that reaping clear the live socket's presence arms a fresh
  // grace timer and kills a healthy call ~65s after a two-second blip.
  it('does not clear presence when the student still has another socket attached', async () => {
    const client = socket('A') as unknown as { data: { callIds: Set<string> } };
    client.data.callIds = new Set([CALL_ID]);
    fetchSockets.mockResolvedValueOnce([{ id: 'sock_A_reconnected' }]);

    await gateway.handleDisconnect(client as never);

    expect(server.in).toHaveBeenCalledWith('user:A');
    expect(calls.onSocketGone).not.toHaveBeenCalled();
  });

  // Fails open: if the adapter cannot answer, the socket is treated as gone and the call still gets
  // its 20-second grace window — never an unhandled rejection (Nest does not catch this handler).
  it('still arms the grace window when the socket lookup fails', async () => {
    const client = socket('A') as unknown as { data: { callIds: Set<string> } };
    client.data.callIds = new Set([CALL_ID]);
    fetchSockets.mockRejectedValueOnce(new Error('adapter timeout'));

    await expect(gateway.handleDisconnect(client as never)).resolves.toBeUndefined();
    expect(calls.onSocketGone).toHaveBeenCalledWith('A', CALL_ID);
  });

  // A reconnected socket never went through `onInvite`/`onAccept` — `relay()` is the only place
  // left to track it, so its own grace timer has a callId to act on when it drops again.
  it('tracks the call for a socket that only relays (never invited or accepted)', async () => {
    const client = socket('A') as unknown as { data: { callIds?: Set<string> } };
    await gateway.onMediaState(client as never, {
      callId: CALL_ID,
      audioEnabled: true,
      videoEnabled: true,
    });
    expect(client.data.callIds?.has(CALL_ID)).toBe(true);
  });

  // ⚠️ A Redis blip here must never turn an already-created, already-armed call into one that
  // rings nobody — that would close MISSED at 45s and spend the caller's anti-harassment budget
  // for a call that never actually rang (design §5.2).
  it('still emits call:incoming when presence bookkeeping fails', async () => {
    calls.onSocketPresent.mockRejectedValueOnce(new Error('redis down'));
    const ack = await gateway.onInvite(socket('A'), {
      calleeId: 'b'.repeat(25),
      media: CallMedia.AUDIO,
      sdp: 'v=0',
    });
    expect(ack).toMatchObject({ status: 'ok', callId: 'call_1' });
    expect(server.emit).toHaveBeenCalledWith(
      CALL_EVENT.INCOMING,
      expect.objectContaining({ callId: 'call_1' }),
    );
  });

  /**
   * ⚠️ `call:ended` is emitted from `onEnd` only, so a close nobody asked for — the 45s ring
   * timeout, the 30s connect timeout, the 4h cap, the disconnect grace, a glare preemption —
   * reached no client at all: the call was closed server-side while the caller's phone kept
   * ringing. The service announces those through a broadcaster; this is where it gets registered.
   */
  describe('call:ended broadcaster', () => {
    const outcome = {
      callId: 'call_1',
      participants: ['A', 'B'],
      reason: 'TIMEOUT',
      durationMs: 0,
      endedBy: null,
    };

    it('registers one with the service on init', () => {
      gateway.onModuleInit();
      expect(calls.registerBroadcaster).toHaveBeenCalledTimes(1);
    });

    it('emits call:ended to BOTH participants', () => {
      gateway.onModuleInit();
      const broadcast = calls.registerBroadcaster.mock.calls[0][0] as (o: typeof outcome) => void;

      broadcast(outcome);

      expect(server.to).toHaveBeenCalledWith(['user:A', 'user:B']);
      expect(server.emit).toHaveBeenCalledWith(
        CALL_EVENT.ENDED,
        expect.objectContaining({ callId: 'call_1', reason: 'TIMEOUT', durationMs: 0 }),
      );
    });

    // A timer can fire before Socket.IO has bound a server to the gateway (an overdue job on boot).
    it('does not throw when no socket server is bound yet', () => {
      const gw = new CallsGateway(calls as never, {} as never, {} as never);
      gw.onModuleInit();
      const broadcast = calls.registerBroadcaster.mock.calls.at(-1)?.[0] as (
        o: typeof outcome,
      ) => void;
      expect(() => broadcast(outcome)).not.toThrow();
    });
  });

  // ⚠️ A call can run four hours past a 15-minute access token. Without a way to refresh
  // `tokenExp` in place, a callee whose token expires mid-socket could never satisfy
  // `call:accept`'s freshness check again — calls to them would silently become MISSED.
  it('call:auth refreshes an expired token and lets a subsequent accept through', async () => {
    const freshExp = Math.floor(Date.now() / 1000) + 900;
    const jwt = {
      verifyAsync: jest.fn(async () => ({ sub: 'A', type: AccountType.STUDENT, exp: freshExp })),
    };
    const config = { get: jest.fn(() => 'secret') };
    const gw = new CallsGateway(calls as never, jwt as never, config as never);
    Object.defineProperty(gw, 'server', { value: server, writable: true });
    const client = socket('A', -60); // starts with an already-expired token

    const authAck = await gw.onAuth(client, { token: 'fresh-access-token' });
    expect(authAck).toMatchObject({ status: 'ok' });

    const acceptAck = await gw.onAccept(client, { callId: CALL_ID, sdp: 'v=0' });
    expect(acceptAck).toMatchObject({ status: 'ok', callId: CALL_ID });
    expect(calls.accept).toHaveBeenCalledWith('A', CALL_ID, 'v=0');
  });

  // ⚠️ A token for a DIFFERENT student handed to an already-authenticated socket is a session
  // swap, not a refresh — the socket must be disconnected, not silently kept alive under the
  // wrong identity.
  it("rejects call:auth carrying another student's token and disconnects the socket", async () => {
    const jwt = {
      verifyAsync: jest.fn(async () => ({
        sub: 'OTHER',
        type: AccountType.STUDENT,
        exp: Math.floor(Date.now() / 1000) + 900,
      })),
    };
    const config = { get: jest.fn(() => 'secret') };
    const gw = new CallsGateway(calls as never, jwt as never, config as never);
    Object.defineProperty(gw, 'server', { value: server, writable: true });
    const client = socket('A');

    const ack = await gw.onAuth(client, { token: 'someone-elses-token' });
    expect(ack).toMatchObject({ status: 'error' });
    expect((client as unknown as { disconnect: jest.Mock }).disconnect).toHaveBeenCalledWith(true);
  });

  // §6.4: a stolen access token, once upgraded into a socket, must not keep receiving
  // `call:incoming` (the caller's SDP and home IP) forever — `handleConnection` arms a
  // disconnect at `exp + grace` so the socket cannot outlive its token indefinitely. Gated behind
  // `CALLS_ENFORCE_TOKEN_EXPIRY` (round 3) — the mobile clients do not send `call:auth` yet.
  it('arms an expiry-disconnect timer on a fresh connection when the flag is on', async () => {
    const jwt = {
      verifyAsync: jest.fn(async () => ({
        sub: 'A',
        type: AccountType.STUDENT,
        exp: Math.floor(Date.now() / 1000) + 900,
      })),
    };
    const config = {
      get: jest.fn((key: string) => (key === 'CALLS_ENFORCE_TOKEN_EXPIRY' ? 'true' : 'secret')),
    };
    const gw = new CallsGateway(calls as never, jwt as never, config as never);
    const rawSocket = {
      id: 'sock_A',
      data: {},
      join: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      handshake: { auth: { token: 'valid-token' }, headers: {} },
    };

    await gw.handleConnection(rawSocket as never);

    expect((rawSocket.data as { expiryTimer?: NodeJS.Timeout }).expiryTimer).toBeDefined();
  });

  // The flag defaults `false` precisely because the mobile clients cannot yet send `call:auth`
  // — arming this unconditionally would fail every call longer than ~16 minutes.
  it('does not arm an expiry-disconnect timer when the flag is off', async () => {
    const jwt = {
      verifyAsync: jest.fn(async () => ({
        sub: 'A',
        type: AccountType.STUDENT,
        exp: Math.floor(Date.now() / 1000) + 900,
      })),
    };
    const config = { get: jest.fn(() => 'false') };
    const gw = new CallsGateway(calls as never, jwt as never, config as never);
    const rawSocket = {
      id: 'sock_A',
      data: {},
      join: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      handshake: { auth: { token: 'valid-token' }, headers: {} },
    };

    await gw.handleConnection(rawSocket as never);

    expect((rawSocket.data as { expiryTimer?: NodeJS.Timeout }).expiryTimer).toBeUndefined();
  });

  // ⚠️ Reproduced by review round 3: a dual-stack device trickling 30+ ICE candidates in a burst,
  // then the user tapping hang-up during setup (exactly when they would — the call is not
  // connecting), must never leave `call:end` refused by the SAME bucket the ICE burst just drained.
  // The microphone keeps streaming until the caller can actually hang up.
  it('a burst of ICE frames does not block a subsequent call:end', async () => {
    const client = socket('A');
    const candidate = {
      candidate: 'candidate:1 1 UDP 2122260223 10.0.0.1 5000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    };

    for (let i = 0; i < 35; i += 1) {
      await gateway.onIce(client, { callId: CALL_ID, candidate });
    }
    // Sanity: the shared per-socket bucket (30 tokens) really is exhausted by the burst above.
    const iceAck = await gateway.onIce(client, { callId: CALL_ID, candidate });
    expect(iceAck).toMatchObject({ status: 'error' });

    const endAck = await gateway.onEnd(client, { callId: CALL_ID });
    expect(endAck).toMatchObject({ status: 'ok' });
  });

  // design §9.2: forced-TURN calls must never leak a host/srflx candidate to the peer, regardless
  // of whether the client honours `iceTransportPolicy: "relay"` — this is the guarantee that holds
  // even for an old client that does not know about `relayOnly` at all.
  describe('call:ice relay-only filtering', () => {
    const candidateWith = (typ: string) => ({
      candidate: `candidate:1 1 UDP 2122260223 10.0.0.1 5000 typ ${typ}`,
      sdpMid: '0',
      sdpMLineIndex: 0,
    });

    it('drops a host candidate when the call is relayOnly', async () => {
      calls.relayTo.mockResolvedValueOnce({ peerId: 'B', relayOnly: true });
      const ack = await gateway.onIce(socket('A'), {
        callId: CALL_ID,
        candidate: candidateWith('host'),
      });
      expect(ack).toMatchObject({ status: 'ok' });
      expect(server.emit).not.toHaveBeenCalledWith(CALL_EVENT.ICE, expect.anything());
    });

    it('forwards a host candidate when the call is not relayOnly', async () => {
      calls.relayTo.mockResolvedValueOnce({ peerId: 'B', relayOnly: false });
      const ack = await gateway.onIce(socket('A'), {
        callId: CALL_ID,
        candidate: candidateWith('host'),
      });
      expect(ack).toMatchObject({ status: 'ok' });
      expect(server.emit).toHaveBeenCalledWith(
        CALL_EVENT.ICE,
        expect.objectContaining({ callId: CALL_ID }),
      );
    });

    it('always forwards a relay candidate, even when the call is relayOnly', async () => {
      calls.relayTo.mockResolvedValueOnce({ peerId: 'B', relayOnly: true });
      const ack = await gateway.onIce(socket('A'), {
        callId: CALL_ID,
        candidate: candidateWith('relay'),
      });
      expect(ack).toMatchObject({ status: 'ok' });
      expect(server.emit).toHaveBeenCalledWith(
        CALL_EVENT.ICE,
        expect.objectContaining({ callId: CALL_ID }),
      );
    });

    it('always forwards the end-of-candidates signal (empty candidate string)', async () => {
      calls.relayTo.mockResolvedValueOnce({ peerId: 'B', relayOnly: true });
      const ack = await gateway.onIce(socket('A'), {
        callId: CALL_ID,
        candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0 },
      });
      expect(ack).toMatchObject({ status: 'ok' });
      expect(server.emit).toHaveBeenCalledWith(
        CALL_EVENT.ICE,
        expect.objectContaining({ callId: CALL_ID }),
      );
    });

    // Fail closed: a privacy control must not forward on doubt.
    it('drops an unparseable candidate when the call is relayOnly', async () => {
      calls.relayTo.mockResolvedValueOnce({ peerId: 'B', relayOnly: true });
      const ack = await gateway.onIce(socket('A'), {
        callId: CALL_ID,
        candidate: { candidate: 'garbage', sdpMid: '0', sdpMLineIndex: 0 },
      });
      expect(ack).toMatchObject({ status: 'ok' });
      expect(server.emit).not.toHaveBeenCalledWith(CALL_EVENT.ICE, expect.anything());
    });
  });
});
