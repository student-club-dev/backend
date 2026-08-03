import { mkdtemp, rm, stat } from 'fs/promises';
import { join } from 'path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';
import { CHAT_ACCESS, ChatAccessRepository } from '../domain/chat-access.repository';
import { MediaAsset, NewMediaAsset } from '../domain/entities/media-asset.entity';
import {
  isChatKind,
  isStoryKind,
  MediaKind,
  MediaQuality,
  MediaStatus,
} from '../domain/enums/media-kind.enum';
import { MEDIA_LIMITS, sanitizeFileName } from '../domain/media-limits';
import { MEDIA_ASSET_REPOSITORY, MediaAssetRepository } from '../domain/media-asset.repository';
import { computeWaveform } from '../domain/waveform';
import { FfmpegRunner, type ProbeResult } from '../infrastructure/ffmpeg.runner';
import {
  processImage,
  processOriginalImage,
  readDimensions,
  thumbnailFrom,
} from '../infrastructure/image.processor';
import { ChatMediaStorage } from '../infrastructure/chat-media.storage';
import { detectMediaType } from '../infrastructure/media-type.detector';
import { ChatUploadInput, MEDIA_QUEUE, MediaQueuePort, UploadedChatFile } from './chat-media.io';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Chat attachment uploads (parity spec §1–§6).
 *
 * The order of checks matters and is not arbitrary: permission first (so an outsider never gets far
 * enough to spend CPU), then whether there is anywhere to put the bytes, then quota, then the file's
 * real type, and only then any decoding. Anything that costs money to run happens after everything
 * that can reject the request for free.
 *
 * Every path here works from a **file on disk**, never a buffer. Parity spec §2 removed the size
 * ceiling, and the only way to honour that without a 2 GB upload becoming 2 GB of heap is to never
 * hold one. It also makes `kind = FILE` byte-exact by construction: the temp file is moved into
 * storage and nothing ever reads it.
 */
@Injectable()
export class ChatMediaService {
  private readonly logger = new Logger(ChatMediaService.name);
  private readonly ffmpeg: FfmpegRunner;
  private readonly dailyByteQuota: number;
  private readonly diskFullRatio: number;

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
    this.diskFullRatio = config.get('CHAT_MEDIA_DISK_FULL_RATIO', { infer: true });
  }

  /**
   * Accepts an upload and returns the stored asset.
   *
   * The temp file is removed on every exit, including a rejection — except where a builder has
   * already moved it into storage, in which case the removal is a no-op.
   */
  async upload(user: AuthenticatedUser, input: ChatUploadInput): Promise<MediaAsset> {
    const file = requireFile(input.file);
    try {
      return await this.store(user, input, file);
    } finally {
      await rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  private async store(
    user: AuthenticatedUser,
    input: ChatUploadInput,
    file: UploadedChatFile,
  ): Promise<MediaAsset> {
    // 1. Permission. For a chat attachment, scoping the upload to a conversation is what stops the
    //    endpoint being used as anonymous file hosting by someone with nobody to send to. A profile
    //    photo or a story has no conversation to scope to; the daily byte quota below is what bounds
    //    those, together with the per-set caps their own endpoints enforce.
    await this.assertMayUpload(user, input.kind, input.conversationId);

    // 2. Somewhere to put it, then how much of their allowance is left. Both replace the per-file
    //    size ceiling that parity spec §2 removed.
    await this.assertStorageAvailable();
    await this.assertWithinQuota(user.id, file.size);

    const limits = MEDIA_LIMITS[input.kind];
    if (limits.maxBytes !== null && file.size > limits.maxBytes) {
      throw new AppException(
        ERROR_CODE.FILE_TOO_LARGE,
        413,
        `Fayl hajmi ${Math.floor(limits.maxBytes / (1024 * 1024))} MB dan oshmasligi kerak`,
      );
    }

    // 3. What the bytes really are. For `FILE` this can no longer fail — every type is allowed
    //    (parity spec §1) — and the detected type is kept only so the client can show an icon.
    const fileName = sanitizeFileName(file.originalname);
    const detected = await detectMediaType(file.path, input.kind, file.mimetype);
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
      quality: null,
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
      transcript: null,
      variants: null,
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
        return this.assets.create(await this.buildImage(base, file, input.kind));
      case MediaKind.IMAGE_ORIGINAL:
        return this.assets.create(await this.buildOriginalImage(base, file, input.kind));
      case MediaKind.GIF:
        return this.assets.create(await this.buildGif(base, file));
      case MediaKind.VOICE:
        return this.assets.create(await this.buildVoice(base, file, detected.extension));
      case MediaKind.VIDEO:
      case MediaKind.VIDEO_NOTE:
      case MediaKind.STORY_VIDEO:
        return this.enqueueIfNeeded(
          await this.assets.create(
            await this.buildVideo(base, file, detected.extension, input.kind, input.quality),
          ),
        );
      case MediaKind.FILE:
        // Nothing reads the bytes: they are moved into storage exactly as they arrived, which is
        // what makes the sha256 of the download equal the sha256 of the upload (parity spec §1.2).
        return this.assets.create({
          ...base,
          storageKey: await this.storage.saveFile(file.path, detected.extension),
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

  /**
   * The upload-time permission check, shared with the resumable path (parity spec §7) so that
   * starting a chunked upload cannot bypass what a one-shot upload has to pass.
   */
  async assertMayUpload(
    user: AuthenticatedUser,
    kind: MediaKind,
    conversationId: string | null,
  ): Promise<void> {
    if (!isChatKind(kind)) {
      return;
    }
    if (conversationId === null) {
      throw AppException.validation({ conversationId: 'Suhbat id sini yuboring' });
    }
    if (!(await this.access.canSend(conversationId, user.id))) {
      throw new AppException(ERROR_CODE.NOT_CONNECTED, 403, "Bu suhbatga fayl yuklab bo'lmaydi");
    }
  }

  /**
   * Refuses the upload when the media volume is nearly full.
   *
   * This is one half of what replaced the per-file size limits: the bound that matters is not how
   * big one upload is but whether there is room for it, and a 503 that says so is far easier to act
   * on than writes failing one at a time deep inside the pipeline (parity spec §2.1).
   */
  async assertStorageAvailable(): Promise<void> {
    const used = await this.storage.usedRatio().catch((error: Error) => {
      // A filesystem that will not report its size is not a reason to stop accepting uploads.
      this.logger.warn(`Could not read media volume usage: ${error.message}`);
      return 0;
    });
    if (used >= this.diskFullRatio) {
      throw new AppException(
        ERROR_CODE.STORAGE_FULL,
        503,
        "Server hozircha yangi fayl qabul qila olmaydi, birozdan so'ng urinib ko'ring",
      );
    }
  }

  /** The other half: a per-account daily byte allowance, which is what stops a scripted flood. */
  async assertWithinQuota(ownerId: string, incomingBytes: number): Promise<void> {
    const usedToday = await this.assets.bytesUploadedSince(ownerId, new Date(Date.now() - DAY_MS));
    if (usedToday + incomingBytes > this.dailyByteQuota) {
      throw new AppException(
        ERROR_CODE.UPLOAD_RATE_LIMIT,
        429,
        "Kunlik yuklash chegarasiga yetdingiz, ertaga urinib ko'ring",
      );
    }
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

  private async buildImage(
    base: NewMediaAsset,
    file: UploadedChatFile,
    kind: MediaKind,
  ): Promise<NewMediaAsset> {
    await this.assertDecodable(file, kind);
    const processed = await processImage(file.path);
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

  /**
   * Full-resolution image (parity spec §3).
   *
   * `full === null` means the processor found nothing to strip, so the upload's own bytes are what
   * gets stored — `saveFile` moves them without reading them, and the recipient downloads exactly
   * what the sender picked.
   */
  private async buildOriginalImage(
    base: NewMediaAsset,
    file: UploadedChatFile,
    kind: MediaKind,
  ): Promise<NewMediaAsset> {
    await this.assertDecodable(file, kind);
    const processed = await processOriginalImage(file.path);
    return {
      ...base,
      storageKey:
        processed.full === null
          ? await this.storage.saveFile(file.path, processed.extension)
          : await this.storage.save(processed.full, processed.extension),
      thumbStorageKey: await this.storage.save(processed.thumb, 'webp'),
      mimeType: processed.mimeType,
      sizeBytes: processed.full === null ? file.size : processed.full.length,
      width: processed.width,
      height: processed.height,
      blurHash: processed.blurHash,
    };
  }

  /** GIF in, silent looping MP4 out — the same trade every modern chat makes. */
  private async buildGif(base: NewMediaAsset, file: UploadedChatFile): Promise<NewMediaAsset> {
    return this.inTempDir(async (dir) => {
      const output = join(dir, 'out.mp4');
      const poster = join(dir, 'poster.jpg');

      const probe = await this.probeOrReject(file.path);
      this.assertDuration(probe.durationMs, MediaKind.GIF);

      await this.ffmpeg.toLoopingMp4(file.path, output);
      await this.ffmpeg.extractFrame(output, poster, 0);

      const { thumb, blurHash } = await thumbnailFrom(poster);
      const converted = await this.ffmpeg.probe(output);
      const { size } = await stat(output);

      return {
        ...base,
        isAnimated: true,
        storageKey: await this.storage.saveFile(output, 'mp4'),
        thumbStorageKey: await this.storage.save(thumb, 'jpg'),
        mimeType: 'video/mp4',
        sizeBytes: size,
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
    const probe = await this.probeOrReject(file.path);
    this.assertDuration(probe.durationMs, MediaKind.VOICE);

    // The waveform is not decoration: without it the client cannot draw the bubble at all, so a
    // half-computed voice note is worse than a rejected one.
    const waveform = computeWaveform(await this.ffmpeg.decodePcm(file.path));

    return {
      ...base,
      storageKey: await this.storage.saveFile(file.path, extension),
      durationMs: probe.durationMs,
      waveform,
    };
  }

  private async buildVideo(
    base: NewMediaAsset,
    file: UploadedChatFile,
    extension: string,
    kind: MediaKind,
    requested: MediaQuality | undefined,
  ): Promise<NewMediaAsset> {
    return this.inTempDir(async (dir) => {
      const poster = join(dir, 'poster.jpg');

      const probe = await this.probeOrReject(file.path);
      // `kind`, not a hardcoded VIDEO: a story is capped at a minute and so is a round message,
      // where a chat video has no ceiling at all. Passing the wrong one here would let an
      // hour-long story through.
      this.assertDuration(probe.durationMs, kind);
      if (kind === MediaKind.VIDEO_NOTE) {
        assertSquare(probe);
      }

      // A round message is a glance — the first frame is the subject's face. A normal clip often
      // opens on black, so a second in is the more useful poster.
      const posterAt = kind === MediaKind.VIDEO_NOTE ? 0 : posterOffsetFor(probe.durationMs);
      await this.ffmpeg.extractFrame(file.path, poster, posterAt);
      const { thumb, blurHash } = await thumbnailFrom(poster);

      // Already the codec pair every phone decodes in hardware ⇒ nothing to re-encode. `ORIGINAL`
      // says not to re-encode whatever the codecs are: the sender chose their own encode, and
      // honouring that is the entire point of the setting (parity spec §4.2).
      const quality = requested ?? MediaQuality.AUTO;
      const alreadyPlayable =
        probe.videoCodec === 'h264' && (!probe.hasAudio || probe.audioCodec === 'aac');
      const keepAsSent = quality === MediaQuality.ORIGINAL || alreadyPlayable;

      return {
        ...base,
        status: keepAsSent ? MediaStatus.READY : MediaStatus.PROCESSING,
        quality,
        storageKey: await this.storage.saveFile(file.path, extension),
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

  /**
   * Checks that sharp can open the image and that it is not a decompression bomb.
   *
   * This survives §2's removal of the size limits on purpose, because it is not about size: a
   * 50000×50000 PNG is a few hundred kilobytes on disk and about ten gigabytes decoded.
   */
  private async assertDecodable(file: UploadedChatFile, kind: MediaKind): Promise<void> {
    const dimensions = await readDimensions(file.path).catch(() => null);
    if (dimensions === null) {
      throw new AppException(ERROR_CODE.FILE_TYPE_NOT_ALLOWED, 422, "Rasmni o'qib bo'lmadi");
    }
    const maxSide = MEDIA_LIMITS[kind].maxDimension;
    if (maxSide !== null && Math.max(dimensions.width, dimensions.height) > maxSide) {
      throw new AppException(
        ERROR_CODE.MEDIA_TOO_LARGE_DIMENSIONS,
        422,
        `Rasm tomoni ${maxSide} pikseldan oshmasligi kerak`,
      );
    }
  }

  private async probeOrReject(path: string): Promise<ProbeResult> {
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

  /**
   * The only duration ceilings left after parity spec §2: a story video and a round message, both a
   * minute. A story gets its own error code because the client shows that limit to the user.
   */
  private assertDuration(durationMs: number | null, kind: MediaKind): void {
    const max = MEDIA_LIMITS[kind].maxDurationMs;
    if (max === null || durationMs === null || durationMs <= max) {
      return;
    }
    const seconds = Math.floor(max / 1000);
    if (kind === MediaKind.STORY_VIDEO) {
      throw new AppException(
        ERROR_CODE.STORY_VIDEO_TOO_LONG,
        422,
        `Story uchun video ${seconds} soniyadan oshmasligi kerak`,
      );
    }
    throw new AppException(
      ERROR_CODE.MEDIA_TOO_LONG,
      422,
      `Davomiyligi ${seconds} soniyadan oshmasligi kerak`,
    );
  }

  /** Runs `work` in a scratch directory that is always removed, success or failure. */
  private async inTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
    // Inside the media root, not the OS temp dir: `saveFile` then promotes ffmpeg's output with a
    // rename instead of copying every byte of it a second time.
    const dir = await mkdtemp(join(this.storage.tempDir, 'work-'));
    try {
      return await work(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** A round video message that is not round would reach the recipient as a squashed circle. */
function assertSquare(probe: ProbeResult): void {
  if (probe.width === null || probe.height === null || probe.width !== probe.height) {
    throw new AppException(
      ERROR_CODE.MEDIA_NOT_SQUARE,
      422,
      "Dumaloq video xabar kvadrat bo'lishi kerak",
    );
  }
}

/** A second in, unless the clip is shorter than that. */
function posterOffsetFor(durationMs: number | null): number {
  return durationMs !== null && durationMs > 1000 ? 1 : 0;
}

function requireFile(file: UploadedChatFile | undefined): UploadedChatFile {
  if (file === undefined) {
    throw AppException.validation({ file: 'Fayl yuklang' });
  }
  return file;
}
