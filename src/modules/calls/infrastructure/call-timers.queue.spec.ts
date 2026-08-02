import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { Env } from '../../../config/env';
import { CallTimersQueue, jobIdFor } from './call-timers.queue';

describe('jobIdFor', () => {
  // Deterministic ids are the whole mechanism for cancelling a timer when a call ends normally.
  it('is stable for the same input', () => {
    expect(jobIdFor('ring', 'c1')).toBe('ring:c1');
    expect(jobIdFor('ring', 'c1')).toBe(jobIdFor('ring', 'c1'));
  });

  it('separates the kinds of a single call', () => {
    expect(jobIdFor('ring', 'c1')).not.toBe(jobIdFor('connect', 'c1'));
    expect(jobIdFor('max', 'c1')).not.toBe(jobIdFor('connect', 'c1'));
  });

  // A call has two participants, so grace is per participant — one id per side.
  it('separates grace timers per participant', () => {
    expect(jobIdFor('grace', 'c1', 'A')).toBe('grace:c1:A');
    expect(jobIdFor('grace', 'c1', 'A')).not.toBe(jobIdFor('grace', 'c1', 'B'));
  });
});

// Integration: BullMQ's own job-id validation cannot be mocked. Skipped unless a Redis is
// reachable, so `npm test` on a laptop without one still passes.
const REDIS_URL = process.env.TEST_REDIS_URL;
const describeIfRedis = REDIS_URL === undefined ? describe.skip : describe;

describeIfRedis('CallTimersQueue (BullMQ wiring)', () => {
  let timersQueue: CallTimersQueue;
  let inspectorConnection: IORedis;
  let inspector: Queue;

  // Mirrors the private `toBullMqJobId` inside call-timers.queue.ts (deliberately not exported —
  // it is an implementation detail of talking to BullMQ, not part of the repository contract).
  // BullMQ rejects a custom job id containing `:` unless it splits into exactly 3 parts, so the
  // queue maps colons out before an id ever reaches BullMQ. This lets the test read a job back
  // "by its deterministic id" the way an external inspector would.
  const toBullMqJobId = (logicalId: string): string => logicalId.replace(/:/g, '_');

  beforeEach(() => {
    const configStub = { get: () => REDIS_URL } as unknown as ConfigService<Env, true>;
    timersQueue = new CallTimersQueue(configStub);
    timersQueue.onModuleInit();
    inspectorConnection = new IORedis(REDIS_URL as string, { maxRetriesPerRequest: null });
    inspector = new Queue('call-timers', { connection: inspectorConnection });
  });

  afterEach(async () => {
    await inspector.close();
    await inspectorConnection.quit();
    await timersQueue.onModuleDestroy();
  });

  // Regression: BullMQ throws `Custom Id cannot contain :` for a custom job id with exactly one
  // colon (2 segments) — `ring:{callId}` is exactly that shape. Losing the colon-stripping mapping
  // at either the `schedule()` or `cancel()` call site would make this throw or silently fail to
  // cancel, and nothing else in the suite would notice.
  it('schedules, finds, and cancels a 2-segment (ring) timer against real Redis', async () => {
    const callId = 'ring-round-trip';
    const logicalId = jobIdFor('ring', callId);

    await timersQueue.schedule('ring', callId, 5000);

    const found = await inspector.getJob(toBullMqJobId(logicalId));
    expect(found).toBeDefined();
    expect(found?.data).toMatchObject({ kind: 'ring', callId, studentId: null });

    await timersQueue.cancel('ring', callId);
    expect(await inspector.getJob(toBullMqJobId(logicalId))).toBeUndefined();
  });

  // 3-segment ids (grace carries a studentId) were never affected by BullMQ's restriction — this
  // proves the colon-stripping mapping did not break the case that already worked.
  it('schedules, finds, and cancels a 3-segment (grace) timer against real Redis', async () => {
    const callId = 'grace-round-trip';
    const studentId = 'student-A';
    const logicalId = jobIdFor('grace', callId, studentId);

    await timersQueue.schedule('grace', callId, 5000, studentId);

    const found = await inspector.getJob(toBullMqJobId(logicalId));
    expect(found).toBeDefined();
    expect(found?.data).toMatchObject({ kind: 'grace', callId, studentId });

    await timersQueue.cancel('grace', callId, studentId);
    expect(await inspector.getJob(toBullMqJobId(logicalId))).toBeUndefined();
  });
});
