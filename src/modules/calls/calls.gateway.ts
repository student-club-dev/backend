import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ERROR_CODE } from '../../common/errors/error-code';
import { AppException } from '../../common/exceptions/app.exception';
import {
  assertTokenFresh,
  personalRoom,
  toWsError,
  userOf,
  wsUnauthorized,
} from '../../common/websocket/ws-helpers';
import { verifyStudentSocket, verifyStudentToken } from '../../common/websocket/ws-jwt';
import type { Env } from '../../config/env';
import { CALL_EVENT } from './application/call-events';
import { isForwardableIceCandidate } from './domain/ice-candidate';
import { CallOutcome, CallsService, InviteResult } from './application/calls.service';
import {
  AcceptDto,
  AuthDto,
  CallIdDto,
  DeclineDto,
  IceDto,
  InviteDto,
  MediaStateDto,
  RenegotiateDto,
  validateWsPayload,
} from './presentation/dto/call-ws.dto';

type Ack = Record<string, unknown>;

/**
 * §6.3: a per-socket token bucket. This guards against ONE socket flooding events (a scripted
 * client looping `call:ice`) — not distributed abuse, which is `CallRateLimiter` (Redis-backed) and
 * the per-call ICE/renegotiate caps below. In-memory and per-socket is enough: Socket.IO pins a
 * socket to one connection (and one process) for its whole life, so there is nothing to coordinate
 * across instances here. 30 tokens, refilling at 15/s, comfortably covers a legitimate ICE-gathering
 * burst while capping sustained throughput well below what would trouble Redis.
 */
const SOCKET_BUCKET_CAPACITY = 30;
const SOCKET_BUCKET_REFILL_PER_SECOND = 15;

/**
 * §6.3 review round 3: `end`/`cancel`/`decline` get their OWN small bucket, never the shared one
 * above. A burst of 30+ `call:ice` frames (a real dual-stack device trickling candidates) must
 * never leave the user unable to hang up — that is exactly the failure the three-way token policy
 * exists to prevent, just from a different cause. Still bounded, not exempted: a `call:end` flood
 * against an already-terminal call still reaches `recoverWithoutLiveState`'s Prisma `findById` per
 * frame. 5 tokens refilling at 1/s comfortably covers a genuine retry (a lost ack) without letting
 * a loop spend Prisma reads for free.
 */
const TERMINATE_BUCKET_CAPACITY = 5;
const TERMINATE_BUCKET_REFILL_PER_SECOND = 1;

interface RateBucket {
  tokens: number;
  updatedAtMs: number;
}

/**
 * §6.4: a socket must not outlive its access token indefinitely — otherwise a stolen token, once
 * upgraded into a socket, keeps receiving `call:incoming` (the caller's SDP, and therefore their
 * home IP) forever. 60s comfortably exceeds any realistic timer/event-loop scheduling jitter (BullMQ
 * and Node's own `setTimeout` are accurate to a few seconds at worst) while staying vanishingly
 * small next to the 4-hour call cap — a socket that stops refreshing its token is torn down in
 * about a minute past expiry, not left dangling for up to four hours.
 */
const EXPIRY_GRACE_MS = 60_000;

/**
 * WebRTC signalling (`/calls`). Mirrors `/chat`: JWT on the handshake, one personal room per
 * student, Redis adapter for fan-out across instances.
 *
 * Two rules this gateway exists to keep:
 *
 *  1. **It never reads SDP or ICE.** Payloads are forwarded byte-for-byte — that is the only
 *     guarantee the client's Opus (`useinbandfec`, `usedtx`) and H.264 settings survive. They are
 *     also never logged: an SDP carries the user's home IP address.
 *
 *     ⚠️ `call:ice` bends this, and only this, one way (design §9.2): when the call is `relayOnly`,
 *     `relay()` parses the `typ` token off the candidate line to decide whether to forward it at
 *     all. It is a **filter**, never a rewrite — no candidate is ever modified, so the Opus/H.264
 *     guarantees above are untouched — and the dropped candidate itself is never logged, only the
 *     fact that one was dropped.
 *  2. **Authorization lives in the service, not here.** Every handler passes the socket's student
 *     id down, and `CallsService` asserts participation before acting (design §6.0).
 *
 * ⚠️ It deliberately does NOT touch `PresenceRepository`. That counter is refcounted by `/chat`
 * sockets; incrementing it here would leave every caller permanently "online".
 */
@WebSocketGateway({ namespace: '/calls', cors: false })
export class CallsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  private readonly logger = new Logger(CallsGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly calls: CallsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * A call can also end without anybody asking: the 45s ring-out, the 30s connect timeout, the 4h
   * cap, the 20s disconnect grace, and a glare preemption. Those close the call inside
   * `CallsService`, where there is no socket to answer — so the service hands the outcome back here
   * and this is the only place that turns it into `call:ended`. `onEnd` emits its own (it has the
   * acking socket in hand); `decline`/`cancel` have their own events.
   *
   * An init hook here, unlike the timer handler `CallsModule` registers from a factory — the
   * asymmetry is deliberate. The timer handler has a consumer INSIDE the init phase
   * (`CallTimersQueue.onModuleInit` starts the worker), so its registration must provably precede
   * another provider's hook. This one has no such consumer: the first possible broadcast is a fired
   * timer or an invite, both of which need the app to be listening, and until then there is not a
   * single connected socket for an emit to reach. Losing the race would cost a broadcast to nobody.
   */
  onModuleInit(): void {
    this.calls.registerBroadcaster((outcome) => this.emitEnded(outcome));
  }

  /** `server` is undefined until Socket.IO binds one — an overdue timer job can fire before that. */
  private emitEnded(outcome: CallOutcome): void {
    if (this.server === undefined) {
      this.logger.warn(`No socket server bound — call:ended for ${outcome.callId} was not sent`);
      return;
    }
    this.server.to(outcome.participants.map(personalRoom)).emit(CALL_EVENT.ENDED, {
      callId: outcome.callId,
      reason: outcome.reason,
      durationMs: outcome.durationMs,
      endedBy: outcome.endedBy,
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const verified = await verifyStudentSocket(client, this.jwt, this.config);
      client.data.user = verified.user;
      client.data.tokenExp = verified.expiresAt;
      client.data.callIds = new Set<string>();
      await client.join(personalRoom(verified.user.id));
      this.armExpiryDisconnect(client, verified.expiresAt);
    } catch {
      this.logger.warn('Rejected an unauthenticated /calls socket');
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    // Cleared unconditionally, before any early return: a socket object Socket.IO reuses across a
    // reconnect must never carry a timer armed against its previous connection's token.
    this.clearExpiryDisconnect(client);
    const user = userOf(client);
    const callIds = client.data.callIds as Set<string> | undefined;
    if (user === undefined || callIds === undefined || callIds.size === 0) {
      return;
    }
    // Presence is keyed per STUDENT; this handler runs per SOCKET. A client that reconnected before
    // its previous socket was reaped (a ping timeout can trail a network blip by ~45s) has already
    // re-marked presence from the new socket — clearing it here would arm a grace timer against a
    // participant who is very much present and fail a call whose media never stopped flowing. By
    // `disconnect` this socket has already left its rooms, so anything still in the personal room
    // is a different, live one.
    if (await this.hasOtherSocket(user.id)) {
      return;
    }
    // A short drop (tunnel, lift) must not kill the call — WebRTC media is independent of this
    // socket. The grace timer gives the client 20 seconds to come back.
    for (const callId of callIds) {
      try {
        await this.calls.onSocketGone(user.id, callId);
      } catch (error) {
        // One call's failure must never skip the grace window of the others — and Nest neither
        // awaits nor catches this handler itself, so an uncaught rejection here would crash the
        // process (Node 20 exits on an unhandled rejection).
        this.logger.error(`onSocketGone failed for call ${callId}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Is another socket of this student still attached? Redis-adapter aware — `fetchSockets()` is
   * answered by every instance, so a reconnect that landed on a different pod still counts.
   *
   * Fails open (`false` ⇒ arm the grace window, the behaviour before this check existed): a socket
   * that really is gone must still get its 20 seconds. It must also never reject — Nest neither
   * awaits nor catches this handler, so an unhandled rejection here would take the process down.
   */
  private async hasOtherSocket(studentId: string): Promise<boolean> {
    try {
      const sockets = await this.server.in(personalRoom(studentId)).fetchSockets();
      return sockets.length > 0;
    } catch (error) {
      this.logger.error(`fetchSockets failed for ${studentId}: ${(error as Error).message}`);
      return false;
    }
  }

  @SubscribeMessage(CALL_EVENT.INVITE)
  async onInvite(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    let dto: InviteDto;
    let result: InviteResult;
    try {
      this.assertSocketRate(client);
      // State-creating: a fresh token is required, and refusing is safe.
      assertTokenFresh(client);
      dto = await validateWsPayload(InviteDto, body);
      result = await this.calls.invite(user.id, dto);
    } catch (error) {
      this.logger.error(`call:invite failed: ${(error as Error).message}`);
      return { status: 'error', error: toWsError(error) };
    }
    // The row and both busy keys already exist and the ring timer is armed — ring the callee now,
    // before any bookkeeping below. A Redis blip in that bookkeeping must never turn an already-
    // created call into one that rings nobody, closes MISSED at 45s, and spends the caller's
    // anti-harassment budget for a call that never actually rang.
    this.server.to(personalRoom(dto.calleeId)).emit(CALL_EVENT.INCOMING, {
      callId: result.callId,
      conversationId: result.conversationId,
      caller: result.caller,
      media: dto.media,
      sdp: dto.sdp,
      relayOnly: result.relayOnly,
      expiresAt: result.expiresAt,
    });
    try {
      this.track(client, result.callId);
      await this.calls.onSocketPresent(user.id, result.callId);
    } catch (error) {
      this.logger.error(`call:invite presence bookkeeping failed: ${(error as Error).message}`);
    }
    return {
      status: 'ok',
      callId: result.callId,
      expiresAt: result.expiresAt,
      relayOnly: result.relayOnly,
    };
  }

  @SubscribeMessage(CALL_EVENT.RINGING)
  async onRinging(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    return this.relay(client, body, CallIdDto, CALL_EVENT.RINGING, (dto) => ({
      callId: dto.callId,
    }));
  }

  @SubscribeMessage(CALL_EVENT.ACCEPT)
  async onAccept(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      this.assertSocketRate(client);
      assertTokenFresh(client);
      const dto = await validateWsPayload(AcceptDto, body);
      const result = await this.calls.accept(user.id, dto.callId, dto.sdp);
      this.track(client, dto.callId);
      await this.calls.onSocketPresent(user.id, dto.callId);
      this.server.to(personalRoom(result.callerId)).emit(CALL_EVENT.ACCEPTED, {
        callId: dto.callId,
        sdp: dto.sdp,
        relayOnly: result.relayOnly,
      });
      // The student's OTHER devices stop ringing. `client.to(...)` excludes the socket that just
      // answered — `server.to(...)` would tell the answering device to stop ringing too.
      client.to(personalRoom(user.id)).emit(CALL_EVENT.TAKEN, { callId: dto.callId });
      return { status: 'ok', callId: dto.callId, relayOnly: result.relayOnly };
    } catch (error) {
      this.logger.error(`call:accept failed: ${(error as Error).message}`);
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CALL_EVENT.CONNECTED)
  async onConnected(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      this.assertSocketRate(client);
      // In-call: allowed for the life of the call, no fresh-token requirement (design §6.4).
      const dto = await validateWsPayload(CallIdDto, body);
      await this.calls.markConnected(user.id, dto.callId);
      // Same reconnect gap as `relay()`: a socket that answered on another instance, or came back
      // from a drop, has never called `track()` before this.
      this.track(client, dto.callId);
      await this.calls.onSocketPresent(user.id, dto.callId);
      return { status: 'ok', callId: dto.callId };
    } catch (error) {
      this.logger.error(`call:connected failed: ${(error as Error).message}`);
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CALL_EVENT.DECLINE)
  async onDecline(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      this.assertTerminatingRate(client);
      // ⚠️ NO assertTokenFresh. Terminating is fail-safe (design §6.4).
      const dto = await validateWsPayload(DeclineDto, body);
      const outcome = await this.calls.decline(user.id, dto.callId, dto.reason);
      this.untrack(client, dto.callId);
      if (outcome !== null) {
        this.server
          .to(personalRoom(outcome.participants[0]))
          .emit(CALL_EVENT.DECLINED, { callId: outcome.callId, reason: dto.reason });
        // The callee's OTHER devices stop ringing — same reasoning as `call:accept`'s `call:taken`.
        client.to(personalRoom(user.id)).emit(CALL_EVENT.TAKEN, { callId: dto.callId });
      }
      return { status: 'ok', callId: dto.callId };
    } catch (error) {
      this.logger.error(`call:decline failed: ${(error as Error).message}`);
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CALL_EVENT.CANCEL)
  async onCancel(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      this.assertTerminatingRate(client);
      // ⚠️ NO assertTokenFresh. Terminating is fail-safe (design §6.4).
      const dto = await validateWsPayload(CallIdDto, body);
      const outcome = await this.calls.cancel(user.id, dto.callId);
      this.untrack(client, dto.callId);
      if (outcome !== null) {
        this.server
          .to(personalRoom(outcome.participants[1]))
          .emit(CALL_EVENT.CANCELED, { callId: outcome.callId });
      }
      return { status: 'ok', callId: dto.callId };
    } catch (error) {
      this.logger.error(`call:cancel failed: ${(error as Error).message}`);
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CALL_EVENT.END)
  async onEnd(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      this.assertTerminatingRate(client);
      // ⚠️ NO assertTokenFresh. Terminating is fail-safe, and a call may run four hours past a
      // fifteen-minute token — refusing here would leave the microphone streaming (design §6.4).
      const dto = await validateWsPayload(CallIdDto, body);
      const outcome = await this.calls.end(user.id, dto.callId);
      this.untrack(client, dto.callId);
      if (outcome !== null) {
        this.emitEnded(outcome);
      }
      return { status: 'ok', callId: dto.callId };
    } catch (error) {
      this.logger.error(`call:end failed: ${(error as Error).message}`);
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CALL_EVENT.ICE)
  async onIce(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    return this.relay(
      client,
      body,
      IceDto,
      CALL_EVENT.ICE,
      (dto) => ({ callId: dto.callId, candidate: dto.candidate }),
      'ice',
      // design §9.2 — see `relay()`'s doc comment for why this is the one place the "never touches
      // ICE" rule bends.
      (dto, relayOnly) => isForwardableIceCandidate(dto.candidate.candidate, relayOnly),
    );
  }

  @SubscribeMessage(CALL_EVENT.RENEGOTIATE)
  async onRenegotiate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    return this.relay(
      client,
      body,
      RenegotiateDto,
      CALL_EVENT.RENEGOTIATE,
      (dto) => ({ callId: dto.callId, sdp: dto.sdp }),
      'renegotiate',
    );
  }

  /**
   * Hands the socket a freshly-refreshed access token without a reconnect (design §6.4). A call can
   * run four hours past a fifteen-minute access token; without this, a callee whose token expires
   * mid-socket can never satisfy `call:accept`'s freshness check again, and calls to them silently
   * become MISSED.
   */
  @SubscribeMessage(CALL_EVENT.AUTH)
  async onAuth(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      this.assertSocketRate(client);
      const dto = await validateWsPayload(AuthDto, body);
      const verified = await verifyStudentToken(dto.token, this.jwt, this.config);
      if (verified.user.id !== user.id) {
        // A token for a DIFFERENT student handed to an already-authenticated socket is a session
        // swap, not a refresh — disconnect rather than silently keep the original identity live
        // under someone else's token.
        this.logger.warn('call:auth token belonged to a different student — disconnecting');
        client.disconnect(true);
        return { status: 'error', error: wsUnauthorized() };
      }
      client.data.tokenExp = verified.expiresAt;
      this.armExpiryDisconnect(client, verified.expiresAt);
      return { status: 'ok', expiresAt: new Date(verified.expiresAt * 1000).toISOString() };
    } catch (error) {
      this.logger.error(`call:auth failed: ${(error as Error).message}`);
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CALL_EVENT.MEDIA_STATE)
  async onMediaState(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    return this.relay(client, body, MediaStateDto, CALL_EVENT.MEDIA_STATE, (dto) => ({
      callId: dto.callId,
      audioEnabled: dto.audioEnabled,
      videoEnabled: dto.videoEnabled,
    }));
  }

  /**
   * In-call events: forwarded untouched to the peer, allowed while the call itself is alive.
   *
   * `shouldForward`, when given, can veto the emit — its only caller is `onIce`, which uses it to
   * drop a non-relay candidate on a `relayOnly` call (design §9.2). Nothing else needs it: `ringing`,
   * `renegotiate` and `media-state` always forward.
   */
  private async relay<T extends CallIdDto>(
    client: Socket,
    body: unknown,
    cls: new () => T,
    event: string,
    payloadOf: (dto: T) => Record<string, unknown>,
    kind?: 'ice' | 'renegotiate',
    shouldForward?: (dto: T, relayOnly: boolean) => boolean,
  ): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      this.assertSocketRate(client);
      const dto = await validateWsPayload(cls, body);
      // `kind` gates the per-call ICE/renegotiate caps (design §6.3) — `undefined` for
      // `call:ringing`/`call:media-state`, which carry none.
      const { peerId, relayOnly } = await this.calls.relayTo(user.id, dto.callId, kind);
      // A reconnected socket never went through `onInvite`/`onAccept` — this is the only place it
      // gets tracked, so its grace timer on the next drop actually has a callId to act on.
      this.track(client, dto.callId);
      await this.calls.onSocketPresent(user.id, dto.callId);
      if (shouldForward !== undefined && !shouldForward(dto, relayOnly)) {
        // ⚠️ Never log the candidate itself — it carries the IP address this filter exists to
        // protect. At most the callId and the fact that something was filtered.
        this.logger.warn(
          `call:ice: dropped a non-relay candidate for relay-only call ${dto.callId}`,
        );
        return { status: 'ok' };
      }
      this.server.to(personalRoom(peerId)).emit(event, payloadOf(dto));
      return { status: 'ok' };
    } catch (error) {
      this.logger.error(`${event} relay failed: ${(error as Error).message}`);
      return { status: 'error', error: toWsError(error) };
    }
  }

  /** §6.3: one socket flooding events (not distributed abuse — see the constant's doc comment). */
  private assertSocketRate(client: Socket): void {
    this.assertBucketRate(
      client,
      'rateBucket',
      SOCKET_BUCKET_CAPACITY,
      SOCKET_BUCKET_REFILL_PER_SECOND,
    );
  }

  /**
   * §6.3 review round 3: `end`/`cancel`/`decline` draw from their own bucket (see the constant's
   * doc comment), never the shared one — so a burst of in-call events can never leave a user
   * unable to hang up.
   */
  private assertTerminatingRate(client: Socket): void {
    this.assertBucketRate(
      client,
      'terminateRateBucket',
      TERMINATE_BUCKET_CAPACITY,
      TERMINATE_BUCKET_REFILL_PER_SECOND,
    );
  }

  private assertBucketRate(
    client: Socket,
    dataKey: 'rateBucket' | 'terminateRateBucket',
    capacity: number,
    refillPerSecond: number,
  ): void {
    const now = Date.now();
    const bucket = (client.data[dataKey] as RateBucket | undefined) ?? {
      tokens: capacity,
      updatedAtMs: now,
    };
    const elapsedSeconds = Math.max(0, now - bucket.updatedAtMs) / 1000;
    const tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);
    if (tokens < 1) {
      client.data[dataKey] = { tokens, updatedAtMs: now };
      throw new AppException(
        ERROR_CODE.RATE_LIMITED,
        429,
        'Juda ko‘p so‘rov yuborildi. Biroz kuting.',
      );
    }
    client.data[dataKey] = { tokens: tokens - 1, updatedAtMs: now };
  }

  /**
   * Arms (replacing any previous timer) the exp+grace disconnect described in the constant's doc
   * comment. Called on connect and again by `call:auth` whenever the token is refreshed.
   *
   * ⚠️ Gated behind `CALLS_ENFORCE_TOKEN_EXPIRY` (default `false`, review round 3): `call:auth` is
   * a new event the mobile clients do not send yet. Until both platforms ship it, arming this
   * unconditionally would tear down every socket at exp+60s and fail every call longer than
   * ~16 minutes — strictly worse than the pre-existing gap this timer exists to close. Flip the
   * flag only once both clients refresh `tokenExp` in place via `call:auth`.
   */
  private armExpiryDisconnect(client: Socket, expiresAtSeconds: number): void {
    this.clearExpiryDisconnect(client);
    if (this.config.get('CALLS_ENFORCE_TOKEN_EXPIRY', { infer: true }) !== 'true') {
      return;
    }
    const delayMs = Math.max(0, expiresAtSeconds * 1000 - Date.now()) + EXPIRY_GRACE_MS;
    const timer = setTimeout(() => {
      this.logger.warn(`Disconnecting /calls socket ${client.id}: access token expired past grace`);
      client.disconnect(true);
    }, delayMs);
    timer.unref();
    client.data.expiryTimer = timer;
  }

  /** Must run before any early return in `handleDisconnect` — a reused socket object must never
   * carry a timer armed against a previous connection's token. */
  private clearExpiryDisconnect(client: Socket): void {
    const timer = client.data.expiryTimer as NodeJS.Timeout | undefined;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }

  private track(client: Socket, callId: string): void {
    // Defensive: `handleConnection` always sets this, but a socket a test constructs directly
    // (skipping the handshake) must not crash the handler on a missing Set.
    const callIds = (client.data.callIds as Set<string> | undefined) ?? new Set<string>();
    callIds.add(callId);
    client.data.callIds = callIds;
  }

  /**
   * Called once a terminating event (`end`/`decline`/`cancel`) has resolved without throwing —
   * the call is over from this socket's perspective either way, so it must stop accumulating in
   * `client.data.callIds` for the life of the socket.
   */
  private untrack(client: Socket, callId: string): void {
    (client.data.callIds as Set<string> | undefined)?.delete(callId);
  }
}
