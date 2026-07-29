import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import type { Env } from '../../../config/env';
import { MediaQueuePort } from '../application/chat-media.io';
import { VideoTranscoderService } from '../application/video-transcoder.service';

const QUEUE_NAME = 'media-transcode';
const JOB_NAME = 'transcode';

/**
 * Transcode queue.
 *
 * Backed by BullMQ when Redis is configured — which is what production needs, since a job must
 * survive a restart and must not run twice across replicas. Without Redis it falls back to running
 * the work in-process, detached from the request: fine for a single-instance dev machine, and
 * loudly logged so nobody mistakes it for the real thing.
 */
@Injectable()
export class MediaQueue implements MediaQueuePort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaQueue.name);
  private readonly redisUrl: string | undefined;
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly transcoder: VideoTranscoderService,
    config: ConfigService<Env, true>,
  ) {
    this.redisUrl = config.get('REDIS_URL', { infer: true });
  }

  onModuleInit(): void {
    if (this.redisUrl === undefined || this.redisUrl.length === 0) {
      this.logger.warn(
        'REDIS_URL is not set — video transcoding runs in-process and will not survive a restart',
      );
      return;
    }
    const connection = { url: this.redisUrl };
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => this.transcoder.transcode(job.data.assetId as string),
      // One at a time: ffmpeg already saturates the CPU, and running several would just make every
      // clip slower rather than any of them finish sooner.
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Transcode job ${job?.id ?? '?'} failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueueTranscode(assetId: string): Promise<void> {
    if (this.queue === null) {
      // Detached on purpose — the upload response must not wait for a minute of ffmpeg.
      void this.transcoder
        .transcode(assetId)
        .catch((error: unknown) =>
          this.logger.error(`In-process transcode failed: ${(error as Error).message}`),
        );
      return;
    }
    await this.queue.add(
      JOB_NAME,
      { assetId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
}
