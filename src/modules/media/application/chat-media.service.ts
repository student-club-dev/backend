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
import { isChatKind, isStoryKind, MediaKind, MediaStatus } from '../domain/enums/media-kind.enum';
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

    // 1. Permission. For a chat attachment, scoping the upload to a conversation is what stops the
    //    endpoint being used as anonymous file hosting by someone with nobody to send to. A profile
    //    photo or a story has no conversation to scope to; the daily byte quota below is what bounds
    //    those, together with the per-set caps their own endpoints enforce.
    if (isChatKind(input.kind)) {
      if (input.conversationId === null) {
        throw AppException.validation({ conversationId: 'Suhbat id sini yuboring' });
      }
      if (!(await this.access.canSend(input.conversationId, user.id))) {
        throw new AppException(ERROR_CODE.NOT_CONNECTED, 403, "Bu suhbatga fayl yuklab bo'lmaydi");
      }
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
      // Already forced to null for the non-chat kinds by the controller; a stray value here would
      // otherwise make a story readable to a conversation's members.
      conversationId: isChatKind(input.kind) ? input.conversationId : null,
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
      // A profile photo and a story image go through exactly the same pipeline as a chat image —
      // EXIF (including GPS) stripped, downscaled, thumbnail and BlurHash generated. Story framing
      // is the client's business: a 9:16 crop is what it sends, but a different ratio is accepted
      // and simply rendered to fit.
      case MediaKind.IMAGE:
      case MediaKind.PROFILE_PHOTO:
      case MediaKind.STORY_IMAGE:
        return this.assets.create(await this.buildImage(base, file));
      case MediaKind.GIF:
        return this.assets.create(await this.buildGif(base, file, detected.extension));
      case MediaKind.VOICE:
        return this.assets.create(await this.buildVoice(base, file, detected.extension));
      case MediaKind.VIDEO:
      case MediaKind.STORY_VIDEO:
        return this.enqueueIfNeeded(
          await this.assets.create(
            await this.buildVideo(base, file, detected.extension, input.kind),
          ),
        );
      case MediaKind.FILE:
        return this.assets.create({
          ...base,
          storageKey: await this.storage.save(file.buffer, detected.extension),
          fileName,
        });
    }
  }

  /**
   * The asset behind a `mediaId`, checked against whoever is asking for it.
   *
   * Three rules, one per family of kinds, because they are genuinely different questions:
   *
   * - chat attachments — **membership**, not ownership: the recipient has to be able to open what
   *   was sent to them;
   * - profile photos — any signed-in student, since they already appear in search results and
   *   conversation lists to people who are not connected;
   * - story media — the owner, or someone still connected to them: the same gate the story feed
   *   applies, re-checked here so a story URL forwarded to an outsider is not a way around it.
   *
   * Every failure is the same 404. Distinguishing "does not exist" from "not yours" would confirm
   * that a given id exists to anyone who guesses one.
   */
  async findForMember(id: string, studentId: string): Promise<MediaAsset> {
    const asset = await this.assets.findById(id);
    if (asset === null) {
      throw AppException.notFound(ERROR_CODE.MEDIA_NOT_FOUND, 'Fayl topilmadi');
    }
    if (!(await this.mayRead(asset, studentId))) {
      throw AppException.notFound(ERROR_CODE.MEDIA_NOT_FOUND, 'Fayl topilmadi');
    }
    return asset;
  }

  private async mayRead(asset: MediaAsset, studentId: string): Promise<boolean> {
    if (asset.ownerId === studentId) {
      return true;
    }
    if (isStoryKind(asset.kind)) {
      return this.access.areConnected(asset.ownerId, studentId);
    }
    if (asset.kind === MediaKind.PROFILE_PHOTO) {
      return true;
    }
    // A chat attachment always has a conversation; a null one would mean a corrupt row, and failing
    // closed is the only safe reading of it.
    return asset.conversationId !== null
      ? this.access.isMember(asset.conversationId, studentId)
      : false;
  }

  /**
   * Removes uploads that were never attached to a message, bytes first. A day's grace: long enough
   * that a slow send or a retried one is never caught, short enough that abandoned picks do not
   * accumulate. Returns how many rows went.
   */
  async deleteOrphans(olderThanMs = DAY_MS, batch = 500): Promise<number> {
    const orphans = await this.assets.findOrphans(new Date(Date.now() - olderThanMs), batch);
    if (orphans.length === 0) {
      return 0;
    }
    for (const asset of orphans) {
      for (const key of [asset.storageKey, asset.thumbStorageKey]) {
        if (key !== null) {
          // Storage first: a row without bytes is recoverable noise, bytes without a row are a leak
          // nothing will ever find again.
          await this.storage.delete(key).catch(() => undefined);
        }
      }
    }
    await this.assets.deleteMany(orphans.map((asset) => asset.id));
    return orphans.length;
  }

  /**
   * Deletes specific assets, bytes first, whatever their kind.
   *
   * The story cleanup drives this: a `Story` row cascades from its `MediaAsset`, so removing the
   * asset removes the story and its views in one step, in the right order — bytes gone before the
   * row that names them, since bytes without a row are a leak nothing will ever find again.
   */
  async deleteAssets(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }
    for (const asset of await this.assets.findByIds(ids)) {
      for (const key of [asset.storageKey, asset.thumbStorageKey]) {
        if (key !== null) {
          await this.storage.delete(key).catch(() => undefined);
        }
      }
    }
    await this.assets.deleteMany(ids);
    return ids.length;
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
    kind: MediaKind,
  ): Promise<NewMediaAsset> {
    return this.inTempDir(async (dir) => {
      const source = join(dir, `in.${extension}`);
      const poster = join(dir, 'poster.jpg');
      await writeFile(source, file.buffer);

      const probe = await this.probeOrReject(source);
      // `kind`, not a hardcoded VIDEO: a story is capped at 30 seconds where a chat video gets three
      // minutes, and passing the wrong one here would let a 3-minute story through.
      this.assertDuration(probe.durationMs, kind);

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
        // Keep the real type until the transcode actually runs — the bytes on disk are still the
        // original container, and the transcoder sets `video/mp4` when it has produced one.
        mimeType: base.mimeType,
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
