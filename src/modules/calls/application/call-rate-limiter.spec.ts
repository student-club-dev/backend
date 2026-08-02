import { AppException } from '../../../common/exceptions/app.exception';
import { CallRateLimiter } from './call-rate-limiter';

describe('CallRateLimiter', () => {
  const counters = new Map<string, number>();
  const redis = {
    incr: jest.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    expire: jest.fn(async () => undefined),
    // Pair budget is READ here, never bumped — `checkInvite` must stay a pure question.
    get: jest.fn(async (key: string) => {
      const value = counters.get(key);
      return value === undefined ? null : String(value);
    }),
    hincrby: jest.fn(async (key: string, field: string, increment: number) => {
      const composite = `${key}:${field}`;
      const next = (counters.get(composite) ?? 0) + increment;
      counters.set(composite, next);
      return next;
    }),
  };
  const limiter = new CallRateLimiter(redis as never);

  beforeEach(() => counters.clear());

  it('allows a call under both limits', async () => {
    await expect(limiter.checkInvite('A', 'B')).resolves.toBeUndefined();
  });

  it('rejects the eleventh invite in a minute', async () => {
    for (let i = 0; i < 10; i += 1) {
      await limiter.checkInvite('A', `peer${i}`);
    }
    await expect(limiter.checkInvite('A', 'peer10')).rejects.toBeInstanceOf(AppException);
  });

  // The global 10/min still permits ~600 rings an hour at one victim. The pair limit is the one
  // that actually stops harassment.
  it('rejects a fourth unanswered invite to the same person', async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter.countUnanswered('A', 'B');
    }
    await expect(limiter.checkInvite('A', 'B')).rejects.toMatchObject({ status: 429 });
  });

  it('keeps pair budgets separate', async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter.countUnanswered('A', 'B');
    }
    await expect(limiter.checkInvite('A', 'C')).resolves.toBeUndefined();
  });

  it('is directional — B may still call A', async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter.countUnanswered('A', 'B');
    }
    await expect(limiter.checkInvite('B', 'A')).resolves.toBeUndefined();
  });

  // The soft spot the brief warned about: a `checkInvite` that also increments the pair counter
  // would make "may I call?" spend the very budget it is checking. Asserting this directly is the
  // point — a reader should not have to reverse-engineer an off-by-one to trust the limit.
  it('checkInvite alone never spends the pair budget', async () => {
    for (let i = 0; i < 5; i += 1) {
      await limiter.checkInvite('A', 'B');
    }
    await expect(limiter.checkInvite('A', 'B')).resolves.toBeUndefined();
  });

  // §6.3: bounds a participant looping ICE candidates inside an otherwise-legitimate call — each
  // frame otherwise costs roughly six Redis round trips, fanned out to every instance. 500 is
  // sized against the 10-per-participant renegotiate budget below (review round 3): each
  // renegotiate re-gathers ~20-40 fresh candidates, so 10 * 40 + an initial ~40-candidate gather
  // is 440 worst case — 500 leaves headroom without ceasing to bound anything.
  it('rejects the 501st ICE candidate from the same participant on a call', async () => {
    for (let i = 0; i < 500; i += 1) {
      await limiter.checkIce('call_1', 'A');
    }
    await expect(limiter.checkIce('call_1', 'A')).rejects.toMatchObject({ status: 429 });
  });

  // Per participant, not per call (review round 3): a shared counter let one side burn the whole
  // budget and refuse the other's post-handoff recovery renegotiate for the rest of the call.
  it('rejects the 11th renegotiate from the same participant on a call', async () => {
    for (let i = 0; i < 10; i += 1) {
      await limiter.checkRenegotiate('call_1', 'A');
    }
    await expect(limiter.checkRenegotiate('call_1', 'A')).rejects.toMatchObject({ status: 429 });
  });

  // ⚠️ The failure this fix exists to prevent: A burning the whole budget must never cost B their
  // own Wi-Fi→LTE handoff recovery.
  it('does not let one participant exhausting renegotiate block the other', async () => {
    for (let i = 0; i < 10; i += 1) {
      await limiter.checkRenegotiate('call_1', 'A');
    }
    await expect(limiter.checkRenegotiate('call_1', 'B')).resolves.toBeUndefined();
  });
});
