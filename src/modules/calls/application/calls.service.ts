import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { Env } from '../../../config/env';
import {
  CONNECTION_CHECK,
  ConnectionCheckRepository,
} from '../../../infrastructure/social-graph/connection-check.repository';
import { CALL_REPOSITORY, CallRepository } from '../domain/call.repository';
import { CALL_STATE_REPOSITORY, CallStateRepository } from '../domain/call-state.repository';
import { CALL_TIMERS, CallTimerKind, CallTimersRepository } from '../domain/call-timers.repository';
import { isTerminal } from '../domain/call-state-machine';
import {
  CONVERSATION_DIRECTORY,
  ConversationDirectoryRepository,
} from '../domain/conversation-directory.repository';
import {
  CALL_STUDENT_DIRECTORY,
  CallerSummary,
  StudentDirectoryRepository,
} from '../domain/student-directory.repository';
import { CallState, durationMsOf } from '../domain/entities/call.entity';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallParty } from '../domain/enums/call-party.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallEndedBus } from './call-ended.bus';
import { CallRateLimiter } from './call-rate-limiter';

export const RING_TIMEOUT_MS = 45_000;
export const CONNECT_TIMEOUT_MS = 30_000;
export const MAX_DURATION_MS = 4 * 3600 * 1000;
export const DISCONNECT_GRACE_MS = 20_000;

export interface InviteInput {
  calleeId: string;
  media: CallMedia;
  sdp: string;
}

export interface InviteResult {
  callId: string;
  conversationId: string;
  expiresAt: string;
  caller: CallerSummary;
  /** `true` ⇒ the client must use `iceTransportPolicy: "relay"` and emit no host/srflx candidates. */
  relayOnly: boolean;
}

export interface CallOutcome {
  callId: string;
  participants: string[];
  reason: CallEndReason;
  durationMs: number;
  endedBy: CallParty | null;
}

/**
 * How a close nobody asked for reaches the two phones. `call:end`, `call:decline` and `call:cancel`
 * are answered by the gateway handler that received them, but a timer close (ring-out, connect
 * timeout, the 4h cap, the disconnect grace) and a glare preemption have no client event to answer —
 * without this the call is closed server-side while the caller's phone keeps ringing.
 *
 * Registered by `CallsGateway`; a callback rather than an injected gateway, so the application layer
 * keeps no reference to a transport (and no cycle: presentation already depends on application).
 */
export type CallEndedBroadcaster = (outcome: CallOutcome) => void;

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private broadcaster: CallEndedBroadcaster | null = null;

  constructor(
    @Inject(CALL_REPOSITORY) private readonly calls: CallRepository,
    @Inject(CALL_STATE_REPOSITORY) private readonly state: CallStateRepository,
    @Inject(CALL_TIMERS) private readonly timers: CallTimersRepository,
    @Inject(CONVERSATION_DIRECTORY) private readonly conversations: ConversationDirectoryRepository,
    @Inject(CALL_STUDENT_DIRECTORY) private readonly students: StudentDirectoryRepository,
    @Inject(CONNECTION_CHECK) private readonly connections: ConnectionCheckRepository,
    private readonly limiter: CallRateLimiter,
    private readonly endedBus: CallEndedBus,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** `CallsGateway` registers here — the service must not import a gateway (transport, and a cycle). */
  registerBroadcaster(broadcaster: CallEndedBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  /**
   * Best-effort by design. The call is already closed and, on the timer path, the caller is the
   * BullMQ worker: a throwing emit must not fail the job and have it retried against a terminal
   * call. A missing broadcaster is normal at boot — an overdue job can fire before the gateway's
   * `onModuleInit` has run.
   */
  private broadcastEnded(outcome: CallOutcome): void {
    if (this.broadcaster === null) {
      this.logger.warn(
        `Call ${outcome.callId} closed with no broadcaster registered — the participants were ` +
          'not told it ended.',
      );
      return;
    }
    try {
      this.broadcaster(outcome);
    } catch (error) {
      this.logger.error(
        `Failed to broadcast call:ended for ${outcome.callId}: ${(error as Error).message}`,
      );
    }
  }

  async invite(callerId: string, input: InviteInput): Promise<InviteResult> {
    // The feature's master switch: while off, no NEW call may start, but this must never touch the
    // rate limiter, `state.claim` or `calls.create` — a rejected invite costs nothing. Checked first,
    // before anything else in this method, for exactly that reason. Every other lifecycle method
    // (`accept`, `end`, `decline`, `cancel`, `relayTo`, …) is deliberately left ungated: flipping this
    // off must never strand an already-live call with no way to end it.
    if (this.config.get('CALLS_ENABLED', { infer: true }) !== 'true') {
      throw new AppException(ERROR_CODE.NOT_IMPLEMENTED, 503, 'Qo‘ng‘iroq xizmati sozlanmagan');
    }
    if (input.calleeId === callerId) {
      throw AppException.validation({ calleeId: 'O‘zingizga qo‘ng‘iroq qilib bo‘lmaydi' });
    }
    await this.assertMayCall(callerId, input.calleeId);

    // Plain reads, both done before anything is created. `summary(callerId)` is the CALLER's own
    // summary, not a callee-existence check — it is exactly what `call:incoming` renders on the
    // callee's ringing screen (`InviteResult.caller`); the callee's existence is already implied by
    // `connectionState` above finding a connection row. It still must run first: if it fails, the
    // caller must see that error, not a call that is already RINGING with both busy keys held and
    // the ring timer armed (a real invite would then go on to MISSED at 45s, charging the caller's
    // own pair budget for a call that never should have started).
    const caller = await this.students.summary(callerId);
    if (caller === null) {
      throw AppException.notFound(ERROR_CODE.STUDENT_NOT_FOUND, 'Foydalanuvchi topilmadi');
    }
    const relayOnly = !(await this.calls.hasCompletedCallBetween(callerId, input.calleeId));

    // Resolved from the pair — a client-supplied conversationId would let a caller inject the CALL
    // message into a conversation they are not a member of (design §6.1.2).
    const conversationId = await this.conversations.findOrCreateDirect(callerId, input.calleeId);
    // Generated here, not by Prisma: the id claims both busy keys in Redis before the row exists.
    const callId = randomUUID();
    const startedAt = new Date();

    // Must sit immediately before `claim`, with no other await in between: `checkInvite` only
    // reads the pair counter, so any gap between the read and the atomic Redis claim is a window
    // where two concurrent invites can both observe an under-limit value and both proceed. Placing
    // it after `findOrCreateDirect` means a rate-limited caller may still have caused the
    // conversation row to exist — acceptable, since it's find-or-create (a no-op once the pair has
    // ever chatted); the pair is already connected, so the conversation was always visible to both
    // members anyway, it just may now be empty rather than absent.
    await this.limiter.checkInvite(callerId, input.calleeId);

    const decision = await this.state.claim({
      callId,
      conversationId,
      callerId,
      calleeId: input.calleeId,
      media: input.media,
      status: CallStatus.RINGING,
      startedAt: startedAt.toISOString(),
      answeredAt: null,
      relayOnly,
    });

    if (decision.kind === 'BUSY') {
      throw AppException.conflict(ERROR_CODE.CALL_BUSY, 'Foydalanuvchi hozir band');
    }
    if (decision.kind === 'PREEMPT') {
      // Our invite won the glare race; the mirror call has already lost its busy keys. The loser
      // did nothing abusive — they were simply out-glared — so this must never count against their
      // pair budget (`countAgainstCaller: false`). Closing the loser must also never fail the
      // winner's invite: `expireStale` is the backstop for a loser row that fails to close here.
      try {
        const loser = await this.closeCall(
          decision.loserCallId,
          CallStatus.DECLINED,
          CallEndReason.BUSY,
          null,
          false,
        );
        // The loser's own caller is still on a ringing screen and sent no event that could be
        // answered — this broadcast is the only thing that closes it on their phone.
        if (loser !== null) {
          this.broadcastEnded(loser);
        }
      } catch (error) {
        this.logger.error(
          `Failed to close preempted call ${decision.loserCallId}: ${(error as Error).message}`,
        );
      }
    }

    try {
      await this.calls.create({
        id: callId,
        conversationId,
        callerId,
        calleeId: input.calleeId,
        media: input.media,
        relayOnly,
      });
      await this.timers.schedule('ring', callId, RING_TIMEOUT_MS);
    } catch (error) {
      // `claim` already wrote both busy keys and the live call row. If the DB write or the ring
      // timer fails, release them here — otherwise both parties are stuck BUSY until `expireStale`
      // reconciles, and there is no DB row for that job to find in the meantime. Swallow a failure
      // from `release` itself: the keys still self-heal on their TTL, but the original error (e.g.
      // the Prisma failure) must be what propagates, not a Redis error that masks it.
      await this.state.release(callId).catch(() => undefined);
      throw error;
    }

    return {
      callId,
      conversationId,
      expiresAt: new Date(startedAt.getTime() + RING_TIMEOUT_MS).toISOString(),
      caller,
      relayOnly,
    };
  }

  private async assertMayCall(a: string, b: string): Promise<void> {
    const state = await this.connections.connectionState(a, b);
    if (state === 'BLOCKED') {
      throw new AppException(
        ERROR_CODE.USER_BLOCKED,
        403,
        'Bu foydalanuvchiga qo‘ng‘iroq qilib bo‘lmaydi',
      );
    }
    if (state === 'NOT_CONNECTED') {
      throw new AppException(ERROR_CODE.NOT_CONNECTED, 403, 'Avval do‘stlashishingiz kerak');
    }
  }

  async accept(
    studentId: string,
    callId: string,
    _sdp: string,
  ): Promise<{ conversationId: string; callerId: string; relayOnly: boolean }> {
    const live = await this.assertRole(callId, studentId, CallParty.CALLEE);
    // CAS, not read-then-write: a student's other devices are ringing too, and only the first
    // accept may win. Losing devices get `call:taken` from the gateway.
    const won = await this.state.compareAndSetStatus(
      callId,
      [CallStatus.RINGING],
      CallStatus.CONNECTING,
    );
    if (!won) {
      throw new AppException(
        ERROR_CODE.INVALID_CALL_STATE,
        409,
        'Qo‘ng‘iroq allaqachon javob berilgan',
      );
    }
    await this.timers.cancel('ring', callId);
    await this.timers.schedule('connect', callId, CONNECT_TIMEOUT_MS);
    return {
      conversationId: live.conversationId,
      callerId: live.callerId,
      relayOnly: !(await this.calls.hasCompletedCallBetween(live.callerId, live.calleeId)),
    };
  }

  /** Media is flowing. Swaps the 30s connect timeout for the 4-hour duration cap. */
  async markConnected(studentId: string, callId: string): Promise<void> {
    await this.assertParticipant(callId, studentId);
    const moved = await this.state.compareAndSetStatus(
      callId,
      [CallStatus.CONNECTING],
      CallStatus.ACTIVE,
      new Date().toISOString(),
    );
    if (!moved) {
      return; // both sides report `connected`; the second one is a no-op.
    }
    await this.calls.markActive(callId);
    await this.timers.cancel('connect', callId);
    await this.timers.schedule('max', callId, MAX_DURATION_MS);
  }

  async decline(
    studentId: string,
    callId: string,
    reason: 'DECLINED' | 'BUSY',
  ): Promise<CallOutcome | null> {
    const endReason = reason === 'BUSY' ? CallEndReason.BUSY : CallEndReason.DECLINED;
    const live = await this.state.get(callId);
    if (live === null) {
      // `closeCall` deletes the Redis hash on a successful `decline` — a retry (a lost ack, a
      // reconnect replay) must not 404 here.
      return this.recoverWithoutLiveState(
        callId,
        studentId,
        CallParty.CALLEE,
        [CallStatus.RINGING],
        CallStatus.DECLINED,
        endReason,
      );
    }
    if (live.callerId !== studentId && live.calleeId !== studentId) {
      // 403, not 404: CLAUDE.md is explicit that someone else's resource is forbidden, not missing.
      throw AppException.forbidden('Bu qo‘ng‘iroq sizga tegishli emas');
    }
    if (live.calleeId !== studentId) {
      throw AppException.forbidden('Bu amal uchun ruxsat yo‘q');
    }
    // `finish()`'s WHERE guard restricts to live statuses for idempotency but is not
    // transition-specific (see its docstring) — a stale DECLINED could otherwise land on a call
    // that has since moved to CONNECTING via `accept` on another of the callee's devices. Winning
    // this CAS first is what makes DECLINED transition-specific to RINGING; losing it means the
    // call was already answered elsewhere, so there is nothing left to decline.
    const won = await this.state.compareAndSetStatus(
      callId,
      [CallStatus.RINGING],
      CallStatus.DECLINED,
    );
    if (!won) {
      return null;
    }
    return this.closeCall(callId, CallStatus.DECLINED, endReason, CallParty.CALLEE);
  }

  async cancel(studentId: string, callId: string): Promise<CallOutcome | null> {
    const live = await this.state.get(callId);
    if (live === null) {
      // Same idempotency gap as `decline`: a retried `cancel` must not 404 once Redis has released.
      return this.recoverWithoutLiveState(
        callId,
        studentId,
        CallParty.CALLER,
        [CallStatus.RINGING],
        CallStatus.CANCELED,
        CallEndReason.CANCELED,
      );
    }
    if (live.callerId !== studentId && live.calleeId !== studentId) {
      throw AppException.forbidden('Bu qo‘ng‘iroq sizga tegishli emas');
    }
    if (live.callerId !== studentId) {
      throw AppException.forbidden('Bu amal uchun ruxsat yo‘q');
    }
    // Same reasoning as `decline`: CANCELED is only a valid transition from RINGING, so this must
    // win the CAS before touching Postgres, not rely on `finish()`'s live-statuses guard alone.
    const won = await this.state.compareAndSetStatus(
      callId,
      [CallStatus.RINGING],
      CallStatus.CANCELED,
    );
    if (!won) {
      return null;
    }
    return this.closeCall(callId, CallStatus.CANCELED, CallEndReason.CANCELED, CallParty.CALLER);
  }

  async end(studentId: string, callId: string): Promise<CallOutcome | null> {
    const live = await this.state.get(callId);
    if (live === null) {
      // `closeCall` deletes the Redis hash as the last step of a successful `end` — a retry (a lost
      // ack, a reconnect replay) must not 404 here; the design requires a repeated `call:end` to be
      // silently ignored, the same way `closeCall` already treats a Postgres row that reached
      // terminal between two concurrent writes.
      return this.recoverWithoutLiveState(
        callId,
        studentId,
        null,
        [CallStatus.CONNECTING, CallStatus.ACTIVE],
        CallStatus.ENDED,
        CallEndReason.HANGUP,
      );
    }
    if (live.callerId !== studentId && live.calleeId !== studentId) {
      // 403, not 404: CLAUDE.md is explicit that someone else's resource is forbidden, not missing.
      throw AppException.forbidden('Bu qo‘ng‘iroq sizga tegishli emas');
    }
    const endedBy = live.callerId === studentId ? CallParty.CALLER : CallParty.CALLEE;
    // ENDED is only a valid transition from CONNECTING or ACTIVE (`ALLOWED[RINGING]` excludes it) —
    // a still-RINGING call must leave via `cancel` (caller) or `decline` (callee), never `end`.
    // `finish()`'s WHERE guard alone would accept ENDED over any live status, which is exactly what
    // let a never-answered call satisfy `hasCompletedCallBetween` and silently disable the
    // forced-TURN relay policy for the pair on their real first call.
    const won = await this.state.compareAndSetStatus(
      callId,
      [CallStatus.CONNECTING, CallStatus.ACTIVE],
      CallStatus.ENDED,
    );
    if (!won) {
      return null;
    }
    return this.closeCall(callId, CallStatus.ENDED, CallEndReason.HANGUP, endedBy);
  }

  /**
   * Falls back to Postgres when Redis has already lost the live state for a terminal write that is
   * normally CAS-gated there — `end`, `decline` and `cancel` all delete the Redis hash on success,
   * so a retry (a lost ack, a reconnect replay) finds nothing here.
   *
   * A terminal row for a genuine, correctly-roled participant is the idempotent no-op the retry must
   * resolve to. A row whose Postgres status is still in `from` is genuinely live — Redis just lost
   * track of it, most dangerously an ACTIVE/CONNECTING call with real media still flowing
   * peer-to-peer and the participant otherwise unable to hang up until the 4h `expireStale` sweep —
   * so it gets a real recovery close through the same conditional `finish()` write every other close
   * already goes through. `role` restricts who may recover-close (`null` ⇒ either party, for `end`);
   * a Postgres status outside `from` (e.g. still RINGING when only CONNECTING/ACTIVE are allowed)
   * keeps the original 404, left to `expireStale`, rather than writing a transition the state
   * machine disallows.
   */
  private async recoverWithoutLiveState(
    callId: string,
    studentId: string,
    role: CallParty | null,
    from: readonly CallStatus[],
    status: CallStatus,
    reason: CallEndReason,
  ): Promise<CallOutcome | null> {
    const row = await this.calls.findById(callId);
    if (row === null) {
      throw AppException.notFound(ERROR_CODE.CALL_NOT_FOUND, 'Qo‘ng‘iroq topilmadi');
    }
    if (row.callerId !== studentId && row.calleeId !== studentId) {
      throw AppException.forbidden('Bu qo‘ng‘iroq sizga tegishli emas');
    }
    if (role !== null) {
      const expected = role === CallParty.CALLER ? row.callerId : row.calleeId;
      if (expected !== studentId) {
        throw AppException.forbidden('Bu amal uchun ruxsat yo‘q');
      }
    }
    if (isTerminal(row.status)) {
      return null;
    }
    if (!from.includes(row.status)) {
      // Redis lost state Postgres still says is live, but not in a status this write is valid from
      // — a genuine gap, not a retry. Surface as not-found rather than guessing at a close;
      // `expireStale` is the reconciliation backstop.
      throw AppException.notFound(ERROR_CODE.CALL_NOT_FOUND, 'Qo‘ng‘iroq topilmadi');
    }
    const endedBy = row.callerId === studentId ? CallParty.CALLER : CallParty.CALLEE;
    return this.closeCall(callId, status, reason, endedBy);
  }

  /**
   * Rule 0 of the signalling protocol (design §6.0): every client→server event resolves the call
   * and asserts the socket's student is one of its two participants.
   *
   * A `callId` is an identifier, never a capability. Without this check anyone who learns one can
   * accept a stranger's invite (becoming the peer of a live call), push an SDP that redirects the
   * media, or hang up any call on the platform.
   */
  private async assertParticipant(callId: string, studentId: string): Promise<CallState> {
    const live = await this.state.get(callId);
    if (live === null) {
      throw AppException.notFound(ERROR_CODE.CALL_NOT_FOUND, 'Qo‘ng‘iroq topilmadi');
    }
    if (live.callerId !== studentId && live.calleeId !== studentId) {
      // 403, not 404: CLAUDE.md is explicit that someone else's resource is forbidden, not missing.
      throw AppException.forbidden('Bu qo‘ng‘iroq sizga tegishli emas');
    }
    return live;
  }

  private async assertRole(callId: string, studentId: string, role: CallParty): Promise<CallState> {
    const live = await this.assertParticipant(callId, studentId);
    const expected = role === CallParty.CALLER ? live.callerId : live.calleeId;
    if (expected !== studentId) {
      throw AppException.forbidden('Bu amal uchun ruxsat yo‘q');
    }
    return live;
  }

  /**
   * Terminal transition: cancel every timer, write the row conditionally, free Redis.
   *
   * `countAgainstCaller` is `false` for the glare loser: preemption is not something the loser
   * did — they were out-glared by a smaller uuid — so it must never spend their pair budget. It is
   * also suppressed for a CONNECTING call that fails before reaching ACTIVE: the callee already
   * answered, so a failed connect is usually their network, not the caller ringing abusively — see
   * the task-13 report for the full reasoning. Both this and the `answeredAt === null` gate stay in
   * place; this only narrows which of those already-unanswered calls are charged.
   */
  private async closeCall(
    callId: string,
    status: CallStatus,
    reason: CallEndReason,
    endedBy: CallParty | null,
    countAgainstCaller = true,
  ): Promise<CallOutcome | null> {
    const live = await this.state.get(callId);
    await this.timers.cancelAll(callId);
    if (live !== null) {
      await this.timers.cancel('grace', callId, live.callerId);
      await this.timers.cancel('grace', callId, live.calleeId);
    }
    const finished = await this.calls.finish(callId, { status, endReason: reason, endedBy });
    await this.state.release(callId);
    // Both counters carry a 4h+ TTL as a backstop, but that leaves them resident for hours after a
    // call that lasted seconds otherwise (review round 3) — dropped unconditionally, on every path
    // through here, including a losing race against a concurrent close.
    await this.limiter.clearInCallCounters(callId);
    if (finished === null) {
      return null; // already terminal — a retried `call:end` is silent, not an error.
    }
    const failedAfterAnswer =
      live !== null && live.status === CallStatus.CONNECTING && status === CallStatus.FAILED;
    if (countAgainstCaller && !failedAfterAnswer && finished.answeredAt === null) {
      await this.limiter.countUnanswered(finished.callerId, finished.calleeId);
    }
    // Awaited: `publish` catches and logs per listener, so nothing propagates from here, and the
    // CALL message is written before the caller emits `call:ended` — the client sees the chat row
    // and the end of the call in that order, not the other way round.
    await this.endedBus.publish(finished);
    return {
      callId,
      participants: [finished.callerId, finished.calleeId],
      reason,
      durationMs: durationMsOf(finished),
      endedBy,
    };
  }

  /**
   * Who a signalling payload goes to, and whether the call is `relayOnly`. Shared by `call:ice`,
   * `call:renegotiate` and `call:media-state` — all three carry client-authored content the server
   * forwards untouched, so all three need the same participant check first.
   *
   * `kind` gates the per-call, per-PARTICIPANT caps from design §6.3 (both counted per participant,
   * review round 3: a shared renegotiate counter let one side burn the budget and refuse the
   * other's post-handoff recovery). `media-state` (and `ringing`, which does not go through here at
   * all) carry no cap — `undefined` skips the check. The cap is checked AFTER the participant
   * assertion, never before: a non-participant must never be able to spend another call's counter.
   *
   * `relayOnly` comes straight off `live` — `CallsService.invite` decided it once (§9.2) and cached
   * it on the live call state, so `call:ice`, which calls this on every single candidate, never
   * re-runs `hasCompletedCallBetween` against Postgres.
   */
  async relayTo(
    studentId: string,
    callId: string,
    kind?: 'ice' | 'renegotiate',
  ): Promise<{ peerId: string; relayOnly: boolean }> {
    const live = await this.assertParticipant(callId, studentId);
    if (kind === 'ice') {
      await this.limiter.checkIce(callId, studentId);
    } else if (kind === 'renegotiate') {
      await this.limiter.checkRenegotiate(callId, studentId);
    }
    return {
      peerId: live.callerId === studentId ? live.calleeId : live.callerId,
      relayOnly: live.relayOnly,
    };
  }

  /**
   * §6.3: a looping ICE/renegotiate frame calls this on every single one — skip the Redis write and
   * the BullMQ grace-cancel lookup once presence is already marked. Correctness does not depend on
   * how often this actually re-marks: `onSocketGone` unconditionally clears the presence flag the
   * moment the socket really drops, so the very next frame after a reconnect always sees `false`
   * here and does the real work (re-mark + cancel any armed grace timer) immediately. The 20s grace
   * window only cares that presence is accurate exactly at disconnect and exactly at reconnect —
   * per-frame precision in between buys nothing, and the existing presence TTL is what already
   * governs the (much longer) worst case where no frame arrives for a while.
   */
  async onSocketPresent(studentId: string, callId: string): Promise<void> {
    await this.assertParticipant(callId, studentId);
    if (await this.state.isPresent(callId, studentId)) {
      return;
    }
    await this.state.markPresent(callId, studentId);
    await this.timers.cancel('grace', callId, studentId);
  }

  /**
   * A missing live state is the *normal* outcome here, not an error: the call the socket was
   * tracking may have ended (cancel, decline, timeout, a normal hangup) any time before this
   * socket dropped, and `closeCall` deletes the Redis hash on every terminal transition. Throwing
   * for that case — instead of a no-op — would let `handleDisconnect` crash on it (§6.4 gateway
   * review): Nest does not await/catch its disconnect handler, so an unhandled rejection there
   * takes the whole process down. A live call with the wrong student still throws FORBIDDEN.
   */
  async onSocketGone(studentId: string, callId: string): Promise<void> {
    const live = await this.state.get(callId);
    if (live === null) {
      return;
    }
    if (live.callerId !== studentId && live.calleeId !== studentId) {
      throw AppException.forbidden('Bu qo‘ng‘iroq sizga tegishli emas');
    }
    await this.state.clearPresent(callId, studentId);
    await this.timers.schedule('grace', callId, DISCONNECT_GRACE_MS, studentId);
  }

  /**
   * A delayed job fired. No client event is being answered here, so a close this produces reaches
   * the two phones only through the broadcaster — that is what stops a 45s ring-out from closing
   * the call server-side while the caller's handset keeps ringing.
   */
  async onTimer(
    kind: CallTimerKind,
    callId: string,
    studentId: string | null,
  ): Promise<CallOutcome | null> {
    const outcome = await this.runTimer(kind, callId, studentId);
    if (outcome !== null) {
      this.broadcastEnded(outcome);
    }
    return outcome;
  }

  /**
   * Every branch re-reads the live state and does nothing if the call already moved on — the
   * deterministic job id is how a timer is cancelled, but this no-op is what saves a call whose
   * cancel was lost with the instance that scheduled it.
   */
  private async runTimer(
    kind: CallTimerKind,
    callId: string,
    studentId: string | null,
  ): Promise<CallOutcome | null> {
    const live = await this.state.get(callId);
    if (live === null) {
      return null;
    }
    // ⚠️ The hash briefly holds a TERMINAL status: `closeCall` CASes it in, then cancels the timers
    // and writes Postgres before `release()` deletes the hash. A grace job firing inside that window
    // passes the status it observed as its own CAS `from` (below) — the one status write in this
    // service that is not pinned to a literal live status — so it would happily write `ENDED →
    // FAILED`, a transition `ALLOWED[ENDED]` forbids, and race `finish()` for the history row and
    // the chat message. `ring`/`connect`/`max` are already pinned; this covers all four.
    if (isTerminal(live.status)) {
      return null;
    }
    switch (kind) {
      case 'ring': {
        if (live.status !== CallStatus.RINGING) {
          return null;
        }
        // `finish()`'s guard only checks membership in the live statuses, not the specific
        // transition (see its docstring) — a `call:accept` at t=44.9s can already have moved Redis
        // to CONNECTING while Postgres is still RINGING (`accept` never touches Postgres). Winning
        // this CAS first, the same shape `decline`/`cancel` use, is what makes MISSED
        // transition-specific to RINGING instead of clobbering an answered call.
        const won = await this.state.compareAndSetStatus(
          callId,
          [CallStatus.RINGING],
          CallStatus.MISSED,
        );
        return won ? this.closeCall(callId, CallStatus.MISSED, CallEndReason.TIMEOUT, null) : null;
      }
      case 'connect': {
        if (live.status !== CallStatus.CONNECTING) {
          return null;
        }
        // Same TOCTOU gap as `ring`, mirrored against `markConnected` instead of `accept`. Winning
        // this CAS first proves the pre-write status really was CONNECTING; `countAgainstCaller:
        // false` is passed explicitly rather than left to `closeCall`'s own re-read, which by now
        // would see the FAILED status this same CAS just wrote and could no longer tell CONNECTING
        // apart from ACTIVE — exactly the carve-out this handler exists to reach.
        const won = await this.state.compareAndSetStatus(
          callId,
          [CallStatus.CONNECTING],
          CallStatus.FAILED,
        );
        return won
          ? this.closeCall(callId, CallStatus.FAILED, CallEndReason.FAILED, null, false)
          : null;
      }
      case 'max':
        return live.status === CallStatus.ACTIVE
          ? this.closeCall(callId, CallStatus.ENDED, CallEndReason.TIMEOUT, null)
          : null;
      case 'grace': {
        if (studentId === null || (await this.state.isPresent(callId, studentId))) {
          return null;
        }
        // Unlike `ring`/`connect`, grace isn't tied to a single source status — presence tracking
        // spans the whole signalling lifecycle, so this can fire against a RINGING or CONNECTING
        // call just as easily as an ACTIVE one. The *observed* status is the only `from` that makes
        // this write transition-specific; without it, a callee could let their own socket sit dark
        // for the grace window during RINGING and fail their own still-ringing call for free.
        // `countAgainstCaller: false` always: a dropped socket is not repeat ringing, the same
        // correction the connect-timeout carve-out already makes — and once this CAS has written
        // FAILED, `closeCall`'s own re-read can no longer tell CONNECTING apart from ACTIVE to apply
        // that carve-out itself, so it must be passed explicitly here too.
        const won = await this.state.compareAndSetStatus(callId, [live.status], CallStatus.FAILED);
        return won
          ? this.closeCall(callId, CallStatus.FAILED, CallEndReason.FAILED, null, false)
          : null;
      }
    }
  }
}
