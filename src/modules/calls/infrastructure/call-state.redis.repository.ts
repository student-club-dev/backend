import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { CallState } from '../domain/entities/call.entity';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallStateRepository } from '../domain/call-state.repository';
import { GlareDecision } from '../domain/glare';

/** Longer than the 4-hour call cap, so a lost cleanup expires instead of pinning a user forever. */
const CALL_TTL_SECONDS = 4 * 3600 + 900;

/** design §5.2: `ring:{callId}` fires at 45s; `connect:{callId}` allows another 30s after `accept`. */
const RING_TIMEOUT_SECONDS = 45;
const CONNECT_TIMEOUT_SECONDS = 30;
/**
 * A call that answers right at the wire can take `RING_TIMEOUT_SECONDS + CONNECT_TIMEOUT_SECONDS`
 * (75s) to reach ACTIVE. This TTL must outlive both timers with margin, or the busy marker expires
 * out from under a call that is still mid-handshake — a real instance dying between "ringing" and
 * "cleaned up" then wrongly looks the same as one still connecting. Re-extended to this same value
 * on RINGING -> CONNECTING (CAS_SCRIPT), and to CALL_TTL_SECONDS on -> ACTIVE.
 */
const RINGING_BUSY_MARGIN_SECONDS = 15;
const RINGING_BUSY_TTL_SECONDS =
  RING_TIMEOUT_SECONDS + CONNECT_TIMEOUT_SECONDS + RINGING_BUSY_MARGIN_SECONDS;
const PRESENCE_TTL_SECONDS = 60;

const callKey = (callId: string): string => `call:${callId}`;
const busyKey = (studentId: string): string => `busy:${studentId}`;
const presenceKey = (callId: string, studentId: string): string =>
  `call:${callId}:present:${studentId}`;

/**
 * Atomic claim. A direct transcription of `resolveGlare` in `domain/glare.ts` — keep the two in
 * step; the pure version is the one under unit test.
 *
 * KEYS: busy:caller, busy:callee, call:{incomingId}
 * ARGV: incomingId, callerId, calleeId, conversationId, media, startedAt, callTtl, busyTtl,
 *       relayOnly ('1'|'0')
 * Returns: {"CLAIM"} | {"PREEMPT", loserCallId} | {"BUSY"}
 *
 * This script (and CAS_SCRIPT / RELEASE_SCRIPT below) touch three logically-related but differently-
 * named keys per call — `busy:{callerId}`, `busy:{calleeId}`, `call:{callId}` — and some of those
 * names are computed at runtime (`'call:' .. holderId` here; `'busy:' .. id` in the other two
 * scripts) rather than declared in KEYS, because the id is not known until the script reads it.
 * Redis Cluster would place such keys on different nodes and reject the script with CROSSSLOT; this
 * store is single-node only by design, not an oversight — do not attempt to shard call state.
 */
const CLAIM_SCRIPT = `
local incomingId = ARGV[1]
local LIVE = { RINGING = true, CONNECTING = true, ACTIVE = true }

local function write()
  redis.call('HSET', KEYS[3],
    'callId', incomingId, 'conversationId', ARGV[4],
    'callerId', ARGV[2], 'calleeId', ARGV[3],
    'media', ARGV[5], 'status', 'RINGING',
    'startedAt', ARGV[6], 'answeredAt', '', 'relayOnly', ARGV[9])
  redis.call('EXPIRE', KEYS[3], ARGV[7])
  redis.call('SET', KEYS[1], incomingId, 'EX', ARGV[8])
  redis.call('SET', KEYS[2], incomingId, 'EX', ARGV[8])
end

-- Resolve a busy marker to a LIVE call, or to nil.
-- A marker pointing at a call whose hash is gone, or whose status is terminal, is stale by
-- definition and must read as free. Without this an instance dying between the terminal write and
-- the busy-key delete would leave both parties uncallable until the key's TTL — up to 4h15m once a
-- call has reached ACTIVE. Staleness belongs here, in the store, and NOT in \`resolveGlare\`: that
-- function's branch structure is the security property and is mutation-tested as it stands.
local function liveHolder(holderId)
  if holderId == false then return nil end
  local h = redis.call('HMGET', 'call:' .. holderId, 'callerId', 'calleeId', 'status')
  if h[1] == false or not LIVE[h[3]] then return nil end
  return { id = holderId, callerId = h[1], calleeId = h[2], status = h[3] }
end

local callerHolder = liveHolder(redis.call('GET', KEYS[1]))
local calleeHolder = liveHolder(redis.call('GET', KEYS[2]))

if callerHolder == nil and calleeHolder == nil then
  write()
  return {'CLAIM'}
end

-- A true mirror call occupies BOTH keys: its caller is our callee and vice versa. This clause —
-- not the mirror check below — is what confines preemption to calls the invoker is part of.
if callerHolder == nil or calleeHolder == nil or callerHolder.id ~= calleeHolder.id then
  return {'BUSY'}
end

local holder = callerHolder
local isMirror = holder.callerId == ARGV[3] and holder.calleeId == ARGV[2]
-- Lua's <= on strings is strcoll (locale-collation), while glare.ts compares JS strings by UTF-16
-- code unit. They agree here because Call.id is a lowercase-hex UUID (schema.prisma: @default(uuid()))
-- and redis:7-alpine (musl libc) has no locale support to diverge from byte order. If the id format
-- ever changes, re-verify this still holds.
if not isMirror or holder.status ~= 'RINGING' or holder.id <= incomingId then
  return {'BUSY'}
end

write()
return {'PREEMPT', holder.id}
`;

/**
 * CAS on status. KEYS: call:{id}; ARGV: to, answeredAt, then the allowed `from` values.
 *
 * On -> CONNECTING or -> ACTIVE this also re-extends the busy markers (and the call hash's own
 * TTL) in the same atomic step — moved in here, rather than left as follow-up commands after the
 * CAS returns, because a follow-up `EXPIRE` cannot tell whether the key it is about to touch still
 * belongs to this call. Between the CAS and that follow-up, a mirror call could already have
 * preempted and overwritten `busy:{studentId}` with ITS OWN callId; blindly extending would then
 * hand the winner's marker a lifetime it never asked for. The ownership check (`GET ... == callId`)
 * closes that window by making the read-check-extend a single Redis command sequence with nothing
 * else able to run in between.
 */
const CAS_SCRIPT = `
local current = redis.call('HGET', KEYS[1], 'status')
if current == false then return 0 end
local matched = false
for i = 3, #ARGV do
  if ARGV[i] == current then
    matched = true
    break
  end
end
if not matched then return 0 end

local to = ARGV[1]
redis.call('HSET', KEYS[1], 'status', to)
if ARGV[2] ~= '' then redis.call('HSET', KEYS[1], 'answeredAt', ARGV[2]) end

if to == 'CONNECTING' or to == 'ACTIVE' then
  local ids = redis.call('HMGET', KEYS[1], 'callId', 'callerId', 'calleeId')
  local callId, callerId, calleeId = ids[1], ids[2], ids[3]
  local ttl = ${RINGING_BUSY_TTL_SECONDS}
  if to == 'ACTIVE' then ttl = ${CALL_TTL_SECONDS} end

  if redis.call('GET', 'busy:' .. callerId) == callId then
    redis.call('EXPIRE', 'busy:' .. callerId, ttl)
  end
  if redis.call('GET', 'busy:' .. calleeId) == callId then
    redis.call('EXPIRE', 'busy:' .. calleeId, ttl)
  end
  -- Keep the hash outliving its own markers regardless of when it was first written.
  redis.call('EXPIRE', KEYS[1], ${CALL_TTL_SECONDS})
end

return 1
`;

/**
 * Atomic release. KEYS: call:{id}. Reads callerId/calleeId off the hash it is about to delete, so
 * a single script covers the hash, both busy keys and both presence keys — no separate GET-then-DEL
 * round trip per key, which is what let a preempting mirror call's freshly-written busy key be
 * deleted out from under it by a late-arriving release of the call it replaced.
 */
const RELEASE_SCRIPT = `
local ids = redis.call('HMGET', KEYS[1], 'callId', 'callerId', 'calleeId')
local callId, callerId, calleeId = ids[1], ids[2], ids[3]

if callId ~= false then
  if callerId ~= false then
    if redis.call('GET', 'busy:' .. callerId) == callId then
      redis.call('DEL', 'busy:' .. callerId)
    end
    redis.call('DEL', KEYS[1] .. ':present:' .. callerId)
  end
  if calleeId ~= false then
    if redis.call('GET', 'busy:' .. calleeId) == callId then
      redis.call('DEL', 'busy:' .. calleeId)
    end
    redis.call('DEL', KEYS[1] .. ':present:' .. calleeId)
  end
end

redis.call('DEL', KEYS[1])
return 1
`;

@Injectable()
export class CallStateRedisRepository implements CallStateRepository {
  constructor(private readonly redis: RedisService) {}

  async claim(state: CallState): Promise<GlareDecision> {
    const result = (await this.redis.eval(
      CLAIM_SCRIPT,
      [busyKey(state.callerId), busyKey(state.calleeId), callKey(state.callId)],
      [
        state.callId,
        state.callerId,
        state.calleeId,
        state.conversationId,
        state.media,
        state.startedAt,
        String(CALL_TTL_SECONDS),
        String(RINGING_BUSY_TTL_SECONDS),
        state.relayOnly ? '1' : '0',
      ],
    )) as [string, string?];

    if (result[0] === 'CLAIM') {
      return { kind: 'CLAIM' };
    }
    if (result[0] === 'PREEMPT') {
      return { kind: 'PREEMPT', loserCallId: result[1] as string };
    }
    return { kind: 'BUSY' };
  }

  async get(callId: string): Promise<CallState | null> {
    const raw = await this.redis.hgetall(callKey(callId));
    if (raw.callId === undefined) {
      return null;
    }
    return {
      callId: raw.callId,
      conversationId: raw.conversationId ?? '',
      callerId: raw.callerId ?? '',
      calleeId: raw.calleeId ?? '',
      media: raw.media as CallMedia,
      status: raw.status as CallStatus,
      startedAt: raw.startedAt ?? '',
      answeredAt: raw.answeredAt === undefined || raw.answeredAt === '' ? null : raw.answeredAt,
      relayOnly: raw.relayOnly === '1',
    };
  }

  async compareAndSetStatus(
    callId: string,
    from: readonly CallStatus[],
    to: CallStatus,
    answeredAt = '',
  ): Promise<boolean> {
    const changed = (await this.redis.eval(
      CAS_SCRIPT,
      [callKey(callId)],
      [to, answeredAt, ...from],
    )) as number;
    return changed === 1;
  }

  async release(callId: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, [callKey(callId)], []);
  }

  async markPresent(callId: string, studentId: string): Promise<void> {
    await this.redis.set(presenceKey(callId, studentId), '1', PRESENCE_TTL_SECONDS);
  }

  isPresent(callId: string, studentId: string): Promise<boolean> {
    return this.redis.exists(presenceKey(callId, studentId));
  }

  async clearPresent(callId: string, studentId: string): Promise<void> {
    await this.redis.del(presenceKey(callId, studentId));
  }
}
