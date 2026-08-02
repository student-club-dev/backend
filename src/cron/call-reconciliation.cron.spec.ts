import { MAX_DURATION_MS } from '../modules/calls/application/calls.service';
import { CallReconciliationCron } from './call-reconciliation.cron';

describe('CallReconciliationCron', () => {
  const calls = { expireStale: jest.fn(async (_cutoff: Date) => 0) };

  // ⚠️ Redis restarts with `appendonly` off lose up to a minute of writes, including BullMQ delayed
  // jobs. Without this backstop the Postgres row stays RINGING forever and the user's history shows
  // a call that never stops ringing.
  it('closes calls left live for longer than the duration cap', async () => {
    await new CallReconciliationCron(calls as never).sweep();
    const cutoff = calls.expireStale.mock.calls[0][0] as Date;
    const age = Date.now() - cutoff.getTime();
    // Bounded both ways: too low would mean the cutoff shrank (closing calls too eagerly), too
    // high would mean it grew looser (leaving stale calls open past the real cap). A few seconds
    // of slack covers time spent actually running the test.
    expect(age).toBeGreaterThanOrEqual(MAX_DURATION_MS);
    expect(age).toBeLessThan(MAX_DURATION_MS + 5_000);
  });

  it('logs nothing when there was nothing to close', async () => {
    calls.expireStale.mockResolvedValueOnce(0);
    await expect(new CallReconciliationCron(calls as never).sweep()).resolves.toBeUndefined();
  });

  // The underlying `cron` package invokes a tick unguarded (no `.catch()`), and this repo has no
  // global unhandledRejection handler — so a rejection escaping `sweep()` would crash the process
  // this cron exists to protect. It must swallow failures and let the next tick retry.
  it('does not propagate when expireStale rejects', async () => {
    calls.expireStale.mockRejectedValueOnce(new Error('db down'));
    await expect(new CallReconciliationCron(calls as never).sweep()).resolves.toBeUndefined();
  });
});
