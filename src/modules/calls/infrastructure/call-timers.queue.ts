import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { Env } from '../../../config/env';
import { CallTimerKind, CallTimersRepository } from '../domain/call-timers.repository';

const QUEUE_NAME = 'call-timers';
const JOB_NAME = 'timer';

/** What the worker calls when a timer fires. Registered by `CallsService` at module init. */
export type CallTimerHandler = (
  kind: CallTimerKind,
  callId: string,
  studentId: string | null,
) => Promise<void>;

export function jobIdFor(kind: CallTimerKind, callId: string, studentId?: string): string {
  return studentId === undefined ? `${kind}:${callId}` : `${kind}:${callId}:${studentId}`;
}

/**
 * BullMQ rejects a custom job id containing `:` unless it splits into exactly 3 parts — a
 * compatibility carve-out for its own repeatable-job ids (see `Job.validateOptions` in bullmq's
 * source). `ring:{callId}` / `connect:{callId}` / `max:{callId}` are 2 parts and throw at
 * `queue.add()` time; `grace:{callId}:{studentId}` happens to be 3 and is unaffected. `jobIdFor`
 * stays the logical, colon-joined id used for cancellation lookups (and asserted by the spec);
 * this maps it to a colon-free id right before it reaches BullMQ, so the restriction never bites.
 *
 * Collision-free today: a `callId` (uuid v4 — hex digits and hyphens) and a `studentId` (cuid —
 * lowercase alphanumeric) can contain neither `_` nor `:`, so replacing `:` with `_` cannot make
 * two distinct logical ids collide. That guarantee breaks if either id format ever changes.
 */
function toBullMqJobId(logicalId: string): string {
  return logicalId.replace(/:/g, '_');
}

/**
 * Delayed jobs that close a call nobody closed: 45s ring, 30s connect, 4h cap, 20s disconnect
 * grace (design §5.2).
 *
 * Cancellation is by deterministic job id, but a fired job is ALSO a no-op when the call has moved
 * on — both are needed. The id is the mechanism; the no-op is what saves a call whose cancel was
 * lost with the instance that scheduled it.
 */
@Injectable()
export class CallTimersQueue implements CallTimersRepository, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallTimersQueue.name);
  private readonly redisUrl: string | undefined;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: IORedis | null = null;
  private handler: CallTimerHandler | null = null;

  constructor(config: ConfigService<Env, true>) {
    this.redisUrl = config.get('REDIS_URL', { infer: true });
  }

  /** `CallsService` registers itself here — the queue must not import the service (cycle). */
  register(handler: CallTimerHandler): void {
    this.handler = handler;
  }

  onModuleInit(): void {
    if (this.redisUrl === undefined || this.redisUrl.length === 0) {
      this.logger.error(
        'REDIS_URL is not set — call timers are disabled. A call nobody hangs up will ring forever ' +
          'and the reconciliation cron will be the only thing that closes it.',
      );
      return;
    }
    this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.connection.on('error', (error) =>
      this.logger.error(`Call timers Redis error: ${error.message}`),
    );
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const { kind, callId, studentId } = job.data as {
          kind: CallTimerKind;
          callId: string;
          studentId: string | null;
        };
        if (this.handler === null) {
          // Realistic trigger: the app was down across the timer's whole window, so an overdue
          // delayed job fires immediately on boot — possibly before `CallsService.register()` has
          // run. `removeOnComplete` then discards this job silently, looking exactly like one that
          // was handled.
          this.logger.error(
            `Call timer ${kind} for call ${callId} fired with no handler registered — this call ` +
              'will not be closed by this timer and is left to the reconciliation cron.',
          );
          return;
        }
        await this.handler(kind, callId, studentId);
      },
      { connection: this.connection, concurrency: 8 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Call timer ${job?.id ?? '?'} failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit().catch(() => undefined);
  }

  async schedule(
    kind: CallTimerKind,
    callId: string,
    delayMs: number,
    studentId?: string,
  ): Promise<void> {
    const jobId = jobIdFor(kind, callId, studentId);
    // Re-arming replaces the old job — a reconnect must restart the grace window, not stack on it.
    await this.cancelById(jobId);
    await this.queue?.add(
      JOB_NAME,
      { kind, callId, studentId: studentId ?? null },
      { jobId: toBullMqJobId(jobId), delay: delayMs, removeOnComplete: true, removeOnFail: 50 },
    );
  }

  async cancel(kind: CallTimerKind, callId: string, studentId?: string): Promise<void> {
    await this.cancelById(jobIdFor(kind, callId, studentId));
  }

  /**
   * Every timer of a call, dropped on the terminal transition. Without this, ten declined calls a
   * minute leave 4-hour jobs resident in the same Redis that holds OTP state and the Socket.IO
   * adapter.
   */
  async cancelAll(callId: string): Promise<void> {
    for (const kind of ['ring', 'connect', 'max'] as const) {
      await this.cancelById(jobIdFor(kind, callId));
    }
    // `grace` ids carry a studentId, so they cannot be derived from callId alone. `CallsService`
    // cancels those separately — it knows both participants.
  }

  private async cancelById(jobId: string): Promise<void> {
    const job = await this.queue?.getJob(toBullMqJobId(jobId));
    await job?.remove().catch((error: Error) => {
      // Tolerated by design (the fired-job no-op is the backstop), but a Redis blip here should
      // leave a breadcrumb rather than vanish silently.
      this.logger.warn(`Failed to cancel call timer ${jobId}: ${error.message}`);
    });
  }
}
