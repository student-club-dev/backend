import { Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { RedisService } from '../../../infrastructure/cache/redis.service';

/** Fixed window: any caller may send at most this many invites per minute, across all peers. */
const GLOBAL_LIMIT = 10;
const GLOBAL_WINDOW_SECONDS = 60;
/** Unanswered invites to one person before a cooldown — the anti-harassment limit. */
const PAIR_LIMIT = 3;
const PAIR_WINDOW_SECONDS = 15 * 60;

/**
 * §6.3: per-call caps on in-call signalling. Unlike the invite limits above, this is not about
 * harassment — it is about one PARTICIPANT of an otherwise-legitimate call looping `call:ice` (each
 * frame costs roughly six Redis round trips: two hash reads, a presence write, a BullMQ job lookup
 * and removal for the grace cancel, and an adapter publish fanned out to every instance) or
 * `call:renegotiate` on the same Redis that holds OTP state, presence and the Socket.IO adapter.
 */
/**
 * Sized against the renegotiate budget below, not in isolation (review round 3): 10 renegotiates
 * per participant, each re-gathering roughly 20-40 fresh candidates on that same side, plus the
 * initial offer/answer gather (also up to ~40) — worst case 40 + 10 * 40 = 440 per participant.
 * 500 keeps a round number with headroom without being so large it stops bounding anything.
 */
const ICE_LIMIT_PER_PARTICIPANT = 500;
/**
 * Per participant, not per call (review round 3: a shared counter let one side burn the whole
 * budget and refuse the other's Wi-Fi→LTE recovery renegotiate for the rest of the call).
 */
const RENEGOTIATE_LIMIT_PER_PARTICIPANT = 10;
/**
 * Mirrors `calls.service.ts`'s `MAX_DURATION_MS` (4h) with a safety margin, so the counter always
 * outlives the call it counts — duplicated rather than imported to avoid a circular import
 * (`CallsService` already depends on `CallRateLimiter`).
 */
const CALL_COUNTER_TTL_SECONDS = 4 * 3600 + 300;

/**
 * Two layers, because one is not enough. The global 10-per-minute cap from the source spec still
 * permits roughly 600 rings an hour aimed at a single person; the per-pair budget is what stops
 * repeat ringing. A CANCELED invite counts against the pair budget too, otherwise an
 * invite→cancel loop is free — and in phase 2 each loop wakes a locked phone with a full-screen
 * CallKit ring.
 *
 * `@nestjs/throttler` cannot do this: it is HTTP/IP-scoped and never sees a `@SubscribeMessage`.
 */
@Injectable()
export class CallRateLimiter {
  constructor(private readonly redis: RedisService) {}

  /**
   * Called before an invite goes out.
   *
   * The global counter is bumped here — one bump per real invite attempt, in a fixed window keyed
   * on the current minute; it resets on the minute boundary, never sliding.
   *
   * The pair counter is only ever READ here (`get`, no `incr`). Checking whether you may call
   * someone must never itself spend the budget it is checking — that check-mutates-state pattern
   * is what turns "may I call?" into a call. It is incremented exclusively by `countUnanswered`,
   * once an invite actually goes unanswered. A caller who keeps retrying while blocked therefore
   * never touches the pair TTL: `checkInvite` throws before any invite is created, so no new
   * unanswered invite is ever recorded, and the cooldown expires on its own `PAIR_WINDOW_SECONDS`
   * after the *last real* unanswered invite — it cannot be extended indefinitely by retrying.
   */
  async checkInvite(callerId: string, calleeId: string): Promise<void> {
    const globalKey = `calls:rate:${callerId}:${Math.floor(Date.now() / 1000 / GLOBAL_WINDOW_SECONDS)}`;
    const global = await this.bump(globalKey, GLOBAL_WINDOW_SECONDS);
    if (global > GLOBAL_LIMIT) {
      throw new AppException(
        ERROR_CODE.RATE_LIMITED,
        429,
        'Juda ko‘p qo‘ng‘iroq urinishi qayd etildi. Bir necha daqiqadan so‘ng qayta urinib ko‘ring.',
      );
    }

    const raw = await this.redis.get(this.pairKey(callerId, calleeId));
    const unanswered = raw === null ? 0 : Number(raw);
    if (unanswered >= PAIR_LIMIT) {
      throw new AppException(
        ERROR_CODE.RATE_LIMITED,
        429,
        'Bu foydalanuvchi hozircha javob bermayapti. Birozdan so‘ng qayta urinib ko‘ring.',
      );
    }
  }

  /** Called when a call ends without being answered — MISSED, DECLINED or CANCELED. */
  async countUnanswered(callerId: string, calleeId: string): Promise<void> {
    await this.bump(this.pairKey(callerId, calleeId), PAIR_WINDOW_SECONDS);
  }

  /** Called once per `call:ice` relay, after the participant check. */
  async checkIce(callId: string, studentId: string): Promise<void> {
    const key = this.iceKey(callId);
    const count = await this.redis.hincrby(key, studentId, 1);
    await this.redis.expire(key, CALL_COUNTER_TTL_SECONDS);
    if (count > ICE_LIMIT_PER_PARTICIPANT) {
      throw new AppException(
        ERROR_CODE.RATE_LIMITED,
        429,
        'ICE nomzodlari chegarasidan oshib ketdi',
      );
    }
  }

  /** Called once per `call:renegotiate` relay, after the participant check. */
  async checkRenegotiate(callId: string, studentId: string): Promise<void> {
    const key = this.renegotiateKey(callId);
    const count = await this.redis.hincrby(key, studentId, 1);
    await this.redis.expire(key, CALL_COUNTER_TTL_SECONDS);
    if (count > RENEGOTIATE_LIMIT_PER_PARTICIPANT) {
      throw new AppException(
        ERROR_CODE.RATE_LIMITED,
        429,
        'Qayta muzokara chegarasidan oshib ketdi',
      );
    }
  }

  /**
   * Called from `closeCall` on every terminal transition. Both counters carry a 4h+ TTL so a lost
   * call still self-cleans eventually, but that leaves `calls:ice:{callId}` (and its renegotiate
   * counterpart) resident for hours after a call that lasted seconds — dropped here instead
   * (review round 3).
   */
  async clearInCallCounters(callId: string): Promise<void> {
    await this.redis.del(this.iceKey(callId));
    await this.redis.del(this.renegotiateKey(callId));
  }

  private pairKey(callerId: string, calleeId: string): string {
    return `calls:pair:${callerId}:${calleeId}`;
  }

  private iceKey(callId: string): string {
    return `calls:ice:${callId}`;
  }

  private renegotiateKey(callId: string): string {
    return `calls:renegotiate:${callId}`;
  }

  private async bump(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.redis.incr(key);
    await this.redis.expire(key, ttlSeconds);
    return value;
  }
}
