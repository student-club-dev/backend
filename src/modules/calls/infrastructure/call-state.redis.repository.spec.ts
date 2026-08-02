import { CallMedia } from '../domain/enums/call-media.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallState } from '../domain/entities/call.entity';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { CallStateRedisRepository } from './call-state.redis.repository';

// Integration: the glare decision lives in Lua, which cannot be mocked. Skipped unless a Redis is
// reachable, so `npm test` on a laptop without one still passes.
const REDIS_URL = process.env.TEST_REDIS_URL;
const describeIfRedis = REDIS_URL === undefined ? describe.skip : describe;

describeIfRedis('CallStateRedisRepository', () => {
  let redis: RedisService;
  let repo: CallStateRedisRepository;

  const state = (
    callId: string,
    callerId: string,
    calleeId: string,
    relayOnly = false,
  ): CallState => ({
    callId,
    conversationId: 'cnv1',
    callerId,
    calleeId,
    media: CallMedia.AUDIO,
    status: CallStatus.RINGING,
    startedAt: '2026-08-01T10:00:00.000Z',
    answeredAt: null,
    relayOnly,
  });

  beforeEach(async () => {
    redis = new RedisService({ get: () => REDIS_URL } as never);
    repo = new CallStateRedisRepository(redis);
    await redis.delByPattern('call:*');
    await redis.delByPattern('busy:*');
  });

  afterEach(async () => {
    await redis.onModuleDestroy();
  });

  it('claims a free pair and reads the state back', async () => {
    expect(await repo.claim(state('c1', 'A', 'B'))).toEqual({ kind: 'CLAIM' });
    expect(await repo.get('c1')).toMatchObject({
      callerId: 'A',
      calleeId: 'B',
      status: CallStatus.RINGING,
    });
  });

  // The `call:ice` relay path (design §9.2) reads this back on every candidate instead of
  // re-running `hasCompletedCallBetween` — it must round-trip exactly as claimed.
  it('round-trips the relayOnly decision', async () => {
    await repo.claim(state('c1', 'A', 'B', true));
    expect(await repo.get('c1')).toMatchObject({ relayOnly: true });

    await repo.claim(state('c2', 'C', 'D', false));
    expect(await repo.get('c2')).toMatchObject({ relayOnly: false });
  });

  it('refuses a second call to a busy callee', async () => {
    await repo.claim(state('c1', 'A', 'B'));
    expect(await repo.claim(state('c2', 'C', 'B'))).toEqual({ kind: 'BUSY' });
  });

  it('preempts the mirror call whose id sorts higher', async () => {
    await repo.claim(state('c9', 'B', 'A'));
    expect(await repo.claim(state('c1', 'A', 'B'))).toEqual({ kind: 'PREEMPT', loserCallId: 'c9' });
    // The winner now owns both keys.
    expect(await repo.claim(state('c2', 'C', 'A'))).toEqual({ kind: 'BUSY' });
  });

  it('does not preempt a third party', async () => {
    await repo.claim(state('c5', 'A', 'B'));
    expect(await repo.claim(state('c0', 'C', 'A'))).toEqual({ kind: 'BUSY' });
  });

  // ⚠️ Mutation-walking the suite above found these two clauses unprotected: every prior BUSY case
  // reached BUSY via `callerHolder == nil`, because the invoker was always a fresh third party.
  it('never preempts a same-direction call that holds both keys', async () => {
    await repo.claim(state('c9', 'A', 'B'));
    expect(await repo.claim(state('c1', 'A', 'B'))).toEqual({ kind: 'BUSY' });
  });

  it('is busy when the caller key holds a mirror call but the callee key holds another', async () => {
    await repo.claim(state('c9', 'B', 'A')); // busy:A = busy:B = c9
    await redis.hset('call:c8', { callId: 'c8', callerId: 'Y', calleeId: 'B', status: 'RINGING' });
    await redis.set('busy:B', 'c8', 60); // the shape a crash leaves behind
    expect(await repo.claim(state('c1', 'A', 'B'))).toEqual({ kind: 'BUSY' });
  });

  it('does not preempt a mirror call that is already connecting', async () => {
    await repo.claim(state('c9', 'B', 'A'));
    await repo.compareAndSetStatus('c9', [CallStatus.RINGING], CallStatus.CONNECTING);
    expect(await repo.claim(state('c1', 'A', 'B'))).toEqual({ kind: 'BUSY' });
  });

  it('lets only the first compareAndSetStatus win', async () => {
    await repo.claim(state('c1', 'A', 'B'));
    expect(await repo.compareAndSetStatus('c1', [CallStatus.RINGING], CallStatus.CONNECTING)).toBe(
      true,
    );
    expect(await repo.compareAndSetStatus('c1', [CallStatus.RINGING], CallStatus.CONNECTING)).toBe(
      false,
    );
  });

  it('frees both participants on release', async () => {
    await repo.claim(state('c1', 'A', 'B'));
    await repo.release('c1');
    expect(await repo.get('c1')).toBeNull();
    expect(await repo.claim(state('c2', 'C', 'B'))).toEqual({ kind: 'CLAIM' });
  });

  // ⚠️ Self-healing. An instance dying between the terminal write and the busy-key delete would
  // otherwise leave both parties uncallable until the TTL — up to 4h15m once a call went ACTIVE.
  describe('stale busy markers read as free', () => {
    it('when the call hash is gone but the busy key survives', async () => {
      await repo.claim(state('c1', 'A', 'B'));
      await redis.del('call:c1'); // simulate the hash expiring, or a half-finished release
      expect(await repo.claim(state('c2', 'C', 'B'))).toEqual({ kind: 'CLAIM' });
    });

    it.each([
      CallStatus.ENDED,
      CallStatus.MISSED,
      CallStatus.FAILED,
      CallStatus.DECLINED,
      CallStatus.CANCELED,
    ])('when the holder reached %s', async (status) => {
      await repo.claim(state('c1', 'A', 'B'));
      await repo.compareAndSetStatus('c1', [CallStatus.RINGING], status);
      expect(await repo.claim(state('c2', 'C', 'B'))).toEqual({ kind: 'CLAIM' });
    });

    // The other half of the rule: a LIVE holder must still block, or the guard is worthless.
    it.each([CallStatus.RINGING, CallStatus.CONNECTING, CallStatus.ACTIVE])(
      'but a holder still in %s blocks',
      async (status) => {
        await repo.claim(state('c1', 'A', 'B'));
        if (status !== CallStatus.RINGING) {
          await repo.compareAndSetStatus('c1', [CallStatus.RINGING], CallStatus.CONNECTING);
        }
        if (status === CallStatus.ACTIVE) {
          await repo.compareAndSetStatus('c1', [CallStatus.CONNECTING], CallStatus.ACTIVE);
        }
        expect(await repo.claim(state('c2', 'C', 'B'))).toEqual({ kind: 'BUSY' });
      },
    );
  });

  it('tracks participant presence', async () => {
    await repo.markPresent('c1', 'A');
    expect(await repo.isPresent('c1', 'A')).toBe(true);
    await repo.clearPresent('c1', 'A');
    expect(await repo.isPresent('c1', 'A')).toBe(false);
  });

  // ⚠️ Pins the busy-marker TTL itself. Deleting the whole extension block (or reverting it to the
  // 60s constant the security review flagged in C1) must fail here even though every other test
  // above still passes.
  describe('busy marker TTL', () => {
    it('is short while ringing, and is extended on CONNECTING and again on ACTIVE', async () => {
      await repo.claim(state('c1', 'A', 'B'));
      const ringingTtl = await redis.ttl('busy:A');
      expect(ringingTtl).toBeGreaterThan(60); // must outlive ring(45s) + connect(30s), not just ring
      expect(ringingTtl).toBeLessThanOrEqual(90);

      await repo.compareAndSetStatus('c1', [CallStatus.RINGING], CallStatus.CONNECTING);
      expect(await redis.ttl('busy:A')).toBeGreaterThan(60);
      expect(await redis.ttl('call:c1')).toBeGreaterThan(60);

      await repo.compareAndSetStatus('c1', [CallStatus.CONNECTING], CallStatus.ACTIVE);
      expect(await redis.ttl('busy:A')).toBeGreaterThan(3600); // now the ~4h15m call-length TTL
      expect(await redis.ttl('busy:B')).toBeGreaterThan(3600);
    });

    it("does not hand a preempted call's busy markers a multi-hour TTL", async () => {
      await repo.claim(state('c9', 'B', 'A'));
      await repo.claim(state('c1', 'A', 'B')); // preempts c9; busy:A and busy:B now belong to c1
      // c9 is the loser and the caller must close it with BUSY, but if it were driven to ACTIVE
      // anyway, the ownership guard must stop c1's (the winner's) busy markers from being handed
      // the multi-hour ACTIVE TTL that only c9 earned — the exact bug the security review's I1
      // called out (a late ACTIVE transition on the OLD call extending the NEW call's marker).
      await repo.compareAndSetStatus('c9', [CallStatus.RINGING], CallStatus.CONNECTING);
      await repo.compareAndSetStatus('c9', [CallStatus.CONNECTING], CallStatus.ACTIVE);
      expect(await redis.ttl('busy:A')).toBeLessThanOrEqual(90);
      expect(await redis.ttl('busy:B')).toBeLessThanOrEqual(90);
    });
  });
});
