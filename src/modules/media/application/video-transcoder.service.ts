import { createWriteStream } from 'fs';
import { mkdtemp, rm, stat } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';
import { MediaQuality, MediaStatus } from '../domain/enums/media-kind.enum';
import { MEDIA_ASSET_REPOSITORY, MediaAssetRepository } from '../domain/media-asset.repository';
import { ChatMediaStorage } from '../infrastructure/chat-media.storage';
import { FfmpegRunner } from '../infrastructure/ffmpeg.runner';
import { MediaReadyBus } from './media-ready.bus';

/**
 * Re-encodes an uploaded video to the codec pair every phone decodes in hardware.
 *
 * This is the work behind `status: PROCESSING`. A long clip can take minutes, which is why the
 * upload responds immediately with a `mediaId` and a poster frame: the student sends the message
 * straight away and the bytes catch up.
 *
 * Nothing here holds a video in memory. Parity spec §2 removed the size ceiling, so both the source
 * and the output move through the filesystem — the source streamed out of storage, the output
 * renamed back into it.
 */
@Injectable()
export class VideoTranscoderService {
  private readonly logger = new Logger(VideoTranscoderService.name);
  private readonly ffmpeg: FfmpegRunner;

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assets: MediaAssetRepository,
    private readonly storage: ChatMediaStorage,
    private readonly ready: MediaReadyBus,
    config: ConfigService<Env, true>,
  ) {
    this.ffmpeg = new FfmpegRunner(
      config.get('FFMPEG_PATH', { infer: true }),
      config.get('FFPROBE_PATH', { infer: true }),
    );
  }

  async transcode(assetId: string): Promise<void> {
    const asset = await this.assets.findById(assetId);
    if (asset === null || asset.storageKey === null) {
      this.logger.warn(`Transcode skipped: asset ${assetId} is gone`);
      return;
    }
    if (asset.status !== MediaStatus.PROCESSING) {
      return; // already done, or retried after success
    }

    const dir = await mkdtemp(join(this.storage.tempDir, 'transcode-'));
    try {
      const source = join(dir, 'in');
      const output = join(dir, 'out.mp4');
      await pipeline(this.storage.read(asset.storageKey), createWriteStream(source));

      // The ladder the sender asked for (parity spec §4.2). `ORIGINAL` never reaches here — such an
      // asset is created READY and is never queued.
      await this.ffmpeg.transcodeVideo(source, output, asset.quality === MediaQuality.HIGH);
      const probe = await this.ffmpeg.probe(output);
      const { size } = await stat(output);
      const newKey = await this.storage.saveFile(output, 'mp4');

      const updated = await this.assets.markProcessed(assetId, {
        status: MediaStatus.READY,
        storageKey: newKey,
        mimeType: 'video/mp4',
        sizeBytes: size,
        width: probe.width,
        height: probe.height,
        durationMs: probe.durationMs,
      });

      // Only now drop the original: if anything above threw, the upload is still playable-ish and
      // can be retried, whereas a deleted source is gone for good.
      await this.storage.delete(asset.storageKey);
      await this.ready.publish(updated);
    } catch (error) {
      this.logger.error(`Transcode failed for ${assetId}: ${(error as Error).message}`);
      // FAILED, never a silent READY: the client shows a broken attachment rather than a video
      // that will not play.
      const failed = await this.assets.markProcessed(assetId, { status: MediaStatus.FAILED });
      await this.ready.publish(failed);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
