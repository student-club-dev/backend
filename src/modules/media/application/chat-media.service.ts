import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';
import { CHAT_ACCESS, ChatAccessRepository } from '../domain/chat-access.repository';
import { MediaAsset, NewMediaAsset } from '../domain/entities/media-asset.entity';
import { MediaKind, MediaStatus } from '../domain/enums/media-kind.enum';
import { MEDIA_LIMITS, hasBlockedExtension, sanitizeFileName } from '../domain/media-limits';
import { MEDIA_ASSET_REPOSITORY, MediaAssetRepository } from '../domain/media-asset.repository';
import { computeWaveform } from '../domain/waveform';
import { FfmpegRunner } from '../infrastructure/ffmpeg.runner';
import { processImage, readDimensions, thumbnailFrom } from '../infrastructure/image.processor';
import { ChatMediaStorage } from '../infrastructure/chat-media.storage';
import { detectMediaType } from '../infrastructure/media-type.detector';
import { ChatUploadInput, MEDIA_QUEUE, MediaQueuePort, UploadedChatFile } from './chat-media.io';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Chat attachment uploads (chat media spec §1).
 *
 * The order of checks matters and is not arbitrary: permission first (so an outsider never gets far
 * enough to spend CPU), then quota, then the file's real type, then its size and duration, and only
 * then any decoding. Anything that costs money to run happens after everything that can reject the
 * request for free.
 */
@Injectable()
export class ChatMediaService {
  private readonly logger = new Logger(ChatMediaService.name);
  private readonly ffmpeg: FfmpegRunner;
  private readonly dailyByteQuota: number;

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assets: MediaAssetRepository,
    @Inject(CHAT_ACCESS) private readonly access: ChatAccessRepository,
    @Inject(MEDIA_QUEUE) private readonly queue: MediaQueuePort,
    private readonly storage: ChatMediaStorage,
    config: ConfigService<Env, true>,
  ) {
    this.ffmpeg = new FfmpegRunner(
      config.get('FFMPEG_PATH', { infer: true }),
      config.get('FFPROBE_PATH', { infer: true }),
    );
    this.dailyByteQuota = config.get('CHAT_UPLOAD_BYTES_PER_DAY', { infer: true });
  }

  async upload(user: AuthenticatedUser, input: ChatUploadInput): Promise<MediaAsset> {
    const file = requireFile(input.file);

    // 1. Permission. Scoping an upload to a conversation is what stops the endpoint being used as
    //    anonymous file hosting by someone with nobody to send to.
    if (!(await this.access.canSend(input.conversationId, user.id))) {
      throw new AppException(ERROR_CODE.NOT_CONNECTED, 403, "Bu suhbatga fayl yuklab bo'lmaydi");
    }

    // 2. Daily byte quota.
    const usedToday = await this.assets.bytesUploadedSince(user.id, new Date(Date.now() - DAY_MS));
    if (usedToday + file.size > this.dailyByteQuota) {
      throw new AppException(
        ERROR_CODE.UPLOAD_RATE_LIMIT,
        429,
        "Kunlik yuklash chegarasiga yetdingiz, ertaga urinib ko'ring",
      );
    }

    const limits = MEDIA_LIMITS[input.kind];
    if (file.size > limits.maxBytes) {
      throw new AppException(
        ERROR_CODE.FILE_TOO_LARGE,
        413,
        `Fayl hajmi ${Math.floor(limits.maxBytes / (1024 * 1024))} MB dan oshmasligi kerak`,
      );
    }

    // 3. What the bytes really are. The filename is checked too: a PDF renamed to .apk is still
    //    something a store reviewer will find on our servers.
    const fileName = sanitizeFileName(file.originalname);
    if (hasBlockedExtension(fileName)) {
      throw new AppException(
        ERROR_CODE.FILE_TYPE_NOT_ALLOWED,
        422,
        "Bu turdagi fayllarni yuborib bo'lmaydi",
      );
    }
    const detected = await detectMediaType(file.buffer, input.kind, file.mimetype);
    if (detected === null) {
      throw new AppException(
        ERROR_CODE.FILE_TYPE_NOT_ALLOWED,
        422,
        "Bu turdagi fayllarni yuborib bo'lmaydi",
      );
    }

    // Every kind starts from the same neutral row and overrides only what applies to it, so a new
    // kind cannot forget to clear a field that belonged to another one.
    const base: NewMediaAsset = {
      ownerId: user.id,
      conversationId: input.conversationId,
      kind: input.kind,
      status: MediaStatus.READY,
      isAnimated: false,
      storageKey: null,
      thumbStorageKey: null,
      externalUrl: null,
      externalThumbUrl: null,
      provider: null,
      externalId: null,
      mimeType: detected.mimeType,
      sizeBytes: file.size,
      width: null,
      height: null,
      durationMs: null,
      waveform: [],
      fileName: null,
      blurHash: null,
    };

    switch (input.kind) {
      case MediaKind.IMAGE:
        return this.assets.create(await this.buildImage(base, file));
      case MediaKind.GIF:
        return this.assets.create(await this.buildGif(base, file, detected.extension));
      case MediaKind.VOICE:
        return this.assets.create(await this.buildVoice(base, file, detected.extension));
      case MediaKind.VIDEO:
        return this.enqueueIfNeeded(
          await this.assets.create(await this.buildVideo(base, file, detected.extension)),
        );
      case MediaKind.FILE:
        return this.assets.create({
          ...base,
          storageKey: await this.storage.save(file.buffer, detected.extension),
          fileName,
        });
    }
  }

  /** The asset behind a `mediaId`, for the message-send validation and the raw proxy. */
  async findForMember(id: string, studentId: string): Promise<MediaAsset> {
    const asset = await this.assets.findById(id);
    if (asset === null) {
      throw AppException.notFound(ERROR_CODE.MEDIA_NOT_FOUND, 'Fayl topilmadi');
    }
    // Membership, not ownership: the recipient has to be able to open what was sent to them.
    if (!(await this.access.isMember(asset.conversationId, studentId))) {
      throw AppException.notFound(ERROR_CODE.MEDIA_NOT_FOUND, 'Fayl topilmadi');
    }
    return asset;
  }

  // ---- per-kind processing ----

  private async buildImage(base: NewMediaAsset, file: UploadedChatFile): Promise<NewMediaAsset> {
    const dimensions = await readDimensions(file.buffer).catch(() => null);
    if (dimensions === null) {
      throw new AppException(ERROR_CODE.FILE_TYPE_NOT_ALLOWED, 422, "Rasmni o'qib bo'lmadi");
    }
    const maxSide = MEDIA_LIMITS[MediaKind.IMAGE].maxDimension;
    if (maxSide !== null && Math.max(dimensions.width, dimensions.height) > maxSide) {
      throw new AppException(
        ERROR_CODE.MEDIA_TOO_LARGE_DIMENSIONS,
        422,
        `Rasm tomoni ${maxSide} pikseldan oshmasligi kerak`,
      );
    }

    const processed = await processImage(file.buffer);
    return {
      ...base,
      storageKey: await this.storage.save(processed.full, processed.extension),
      thumbStorageKey: await this.storage.save(processed.thumb, processed.extension),
      mimeType: processed.mimeType,
      sizeBytes: processed.full.length,
      width: processed.width,
      height: processed.height,
      blurHash: processed.blurHash,
    };
  }

  /** GIF in, silent looping MP4 out — the same trade every modern chat makes (spec §4.5). */
  private async buildGif(
    base: NewMediaAsset,
    file: UploadedChatFile,
    extension: string,
  ): Promise<NewMediaAsset> {
    return this.inTempDir(async (dir) => {
      const source = join(dir, `in.${extension}`);
      const output = join(dir, 'out.mp4');
      const poster = join(dir, 'poster.jpg');
      await writeFile(source, file.buffer);

      const probe = await this.probeOrReject(source);
      this.assertDuration(probe.durationMs, MediaKind.GIF);

      await this.ffmpeg.toLoopingMp4(source, output);
      await this.ffmpeg.extractFrame(output, poster, 0);

      const mp4 = await readFile(output);
      const { thumb, blurHash } = await thumbnailFrom(await readFile(poster));
      const converted = await this.ffmpeg.probe(output);

      return {
        ...base,
        isAnimated: true,
        storageKey: await this.storage.save(mp4, 'mp4'),
        thumbStorageKey: await this.storage.save(thumb, 'jpg'),
        mimeType: 'video/mp4',
        sizeBytes: mp4.length,
        width: converted.width,
        height: converted.height,
        durationMs: converted.durationMs,
        blurHash,
      };
    });
  }

  private async buildVoice(
    base: NewMediaAsset,
    file: UploadedChatFile,
    extension: string,
  ): Promise<NewMediaAsset> {
    return this.inTempDir(async (dir) => {
      const source = join(dir, `voice.${extension}`);
      await writeFile(source, file.buffer);

      const probe = await this.probeOrReject(source);
      this.assertDuration(probe.durationMs, MediaKind.VOICE);

      // The waveform is not decoration: without it the client cannot draw the bubble at all, so a
      // half-computed voice note is worse than a rejected one.
      const waveform = computeWaveform(await this.ffmpeg.decodePcm(source));

      return {
        ...base,
        storageKey: await this.storage.save(file.buffer, extension),
        durationMs: probe.durationMs,
        waveform,
      };
    });
  }

  private async buildVideo(
    base: NewMediaAsset,
    file: UploadedChatFile,
    extension: string,
  ): Promise<NewMediaAsset> {
    return this.inTempDir(async (dir) => {
      const source = join(dir, `in.${extension}`);
      const poster = join(dir, 'poster.jpg');
      await writeFile(source, file.buffer);

      const probe = await this.probeOrReject(source);
      this.assertDuration(probe.durationMs, MediaKind.VIDEO);

      await this.ffmpeg.extractFrame(
        source,
        poster,
        probe.durationMs !== null && probe.durationMs > 1000 ? 1 : 0,
      );
      const { thumb, blurHash } = await thumbnailFrom(await readFile(poster));

      // Already the codec pair every phone decodes in hardware ⇒ nothing to re-encode.
      const alreadyPlayable =
        probe.videoCodec === 'h264' && (!probe.hasAudio || probe.audioCodec === 'aac');

      return {
        ...base,
        status: alreadyPlayable ? MediaStatus.READY : MediaStatus.PROCESSING,
        storageKey: await this.storage.save(file.buffer, extension),
        thumbStorageKey: await this.storage.save(thumb, 'jpg'),
        mimeType: alreadyPlayable ? base.mimeType : 'video/mp4',
        width: probe.width,
        height: probe.height,
        durationMs: probe.durationMs,
        blurHash,
      };
    });
  }

  private async enqueueIfNeeded(asset: MediaAsset): Promise<MediaAsset> {
    if (asset.status === MediaStatus.PROCESSING) {
      await this.queue.enqueueTranscode(asset.id);
    }
    return asset;
  }

  // ---- helpers ----

  private async probeOrReject(path: string): ReturnType<FfmpegRunner['probe']> {
    try {
      return await this.ffmpeg.probe(path);
    } catch (error) {
      this.logger.warn(`ffprobe rejected an upload: ${(error as Error).message}`);
      throw new AppException(
        ERROR_CODE.FILE_TYPE_NOT_ALLOWED,
        422,
        "Faylni o'qib bo'lmadi — u buzilgan bo'lishi mumkin",
      );
    }
  }

  private assertDuration(durationMs: number | null, kind: MediaKind): void {
    const max = MEDIA_LIMITS[kind].maxDurationMs;
    if (max !== null && durationMs !== null && durationMs > max) {
      throw new AppException(
        ERROR_CODE.MEDIA_TOO_LONG,
        422,
        `Davomiyligi ${Math.floor(max / 1000)} soniyadan oshmasligi kerak`,
      );
    }
  }

  /** Runs `work` in a scratch directory that is always removed, success or failure. */
  private async inTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'chat-media-'));
    try {
      return await work(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

function requireFile(file: UploadedChatFile | undefined): UploadedChatFile {
  if (file === undefined) {
    throw AppException.validation({ file: 'Fayl yuklang' });
  }
  return file;
}
