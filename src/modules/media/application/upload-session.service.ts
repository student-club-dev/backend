import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';
import { MediaAsset } from '../domain/entities/media-asset.entity';
import { UploadSession } from '../domain/entities/upload-session.entity';
import { MediaKind, MediaQuality } from '../domain/enums/media-kind.enum';
import { sanitizeFileName } from '../domain/media-limits';
import {
  UPLOAD_SESSION_REPOSITORY,
  UploadSessionRepository,
} from '../domain/upload-session.repository';
import { ChatMediaStorage } from '../infrastructure/chat-media.storage';
import { PartTooLargeError, UploadPartStorage } from '../infrastructure/upload-part.storage';
import { ChatMediaService } from './chat-media.service';

/**
 * How much of a file goes in one part.
 *
 * 5 MB is a compromise between two failure modes: smaller parts mean more round trips and more
 * per-request overhead, larger ones mean a dropped connection wastes more work. It is also the
 * smallest part S3 multipart accepts, which keeps the door open to moving this to object storage
 * without changing the client.
 */
export const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

/**
 * How many uploads one account may have open at once.
 *
 * Each session is bounded by the size it declared, so this is what bounds them in aggregate — a
 * script opening sessions in a loop is the way to fill a disk without ever completing anything, and
 * completing is the only point at which the daily quota is charged. Twenty is far beyond any real
 * client, which uploads a handful of files at a time at most.
 */
export const MAX_OPEN_UPLOADS = 20;

/** What `init` was asked for. */
export interface InitUploadInput {
  kind: MediaKind;
  conversationId: string | null;
  quality?: MediaQuality;
  fileName?: string;
  totalBytes: number;
}

/** What the client needs to resume. */
export interface UploadProgress {
  uploadId: string;
  received: number[];
  chunkSize: number;
  totalBytes: number;
  expiresAt: Date;
}

/**
 * Resumable, chunked uploads (parity spec §7).
 *
 * The reason this exists is not size but **interruption**: a single `POST multipart` that drops at
 * 490 MB of 500 starts again from zero, which on mobile data means it may never finish at all. It
 * also lets the client overlap compressing with sending, which is most of why Telegram feels
 * instant — the muxer is still writing the end of the file while the beginning is already gone.
 *
 * No `MediaAsset` exists until `complete`. An abandoned session costs a row and some bytes, both
 * removed by the sweep, and it never appears in anyone's quota.
 */
@Injectable()
export class UploadSessionService {
  private readonly logger = new Logger(UploadSessionService.name);
  private readonly ttlMs: number;

  constructor(
    @Inject(UPLOAD_SESSION_REPOSITORY) private readonly sessions: UploadSessionRepository,
    private readonly parts: UploadPartStorage,
    private readonly storage: ChatMediaStorage,
    private readonly media: ChatMediaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('CHAT_UPLOAD_SESSION_TTL_HOURS', { infer: true }) * 60 * 60 * 1000;
  }

  /**
   * Opens a session.
   *
   * Everything that can refuse the upload for free is checked here rather than at `complete`: there
   * is no point taking a gigabyte from someone who was never allowed to send it, or who has no
   * quota left for it.
   *
   * `totalBytes` is an **upper bound**, not a promise of the exact figure. A client encoding a video
   * while it uploads cannot know the final size yet, so it declares one it is certain not to exceed
   * — the source file — and sends the real number to `complete`. Every guard here still measures
   * against the bound, so declaring one costs the same as declaring an exact size.
   */
  async init(user: AuthenticatedUser, input: InitUploadInput): Promise<UploadProgress> {
    if (!Number.isInteger(input.totalBytes) || input.totalBytes <= 0) {
      throw AppException.validation({ totalBytes: 'Fayl hajmini yuboring' });
    }
    await this.media.assertMayUpload(user, input.kind, input.conversationId);
    await this.media.assertStorageAvailable();
    await this.media.assertWithinQuota(user.id, input.totalBytes);

    // Quota is only charged at `complete`, so opening sessions is the one way to put bytes on disk
    // without ever being billed for them. Each one is capped at the size it declared; this is what
    // stops a script simply opening more of them.
    if ((await this.sessions.countOpen(user.id, new Date())) >= MAX_OPEN_UPLOADS) {
      throw new AppException(
        ERROR_CODE.UPLOAD_RATE_LIMIT,
        429,
        "Juda ko'p yuklash boshlandi — avvalgilarini tugating yoki bekor qiling",
      );
    }

    const session = await this.sessions.create({
      ownerId: user.id,
      conversationId: input.conversationId,
      kind: input.kind,
      quality: input.quality ?? null,
      fileName: sanitizeFileName(input.fileName),
      totalBytes: input.totalBytes,
      chunkSize: UPLOAD_CHUNK_SIZE,
      expiresAt: new Date(Date.now() + this.ttlMs),
    });

    return {
      uploadId: session.id,
      received: [],
      chunkSize: session.chunkSize,
      totalBytes: session.totalBytes,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Stores one part and reports everything received so far.
   *
   * Idempotent by construction: the same index written twice is the same filename written twice.
   * A client that lost the response to a PUT can simply repeat it.
   */
  async writePart(
    user: AuthenticatedUser,
    uploadId: string,
    index: number,
    body: NodeJS.ReadableStream,
  ): Promise<UploadProgress> {
    const session = await this.require(uploadId, user.id);
    // The disk check is repeated per part, not just at init: a session may sit open for a day, and
    // the volume can fill in that time.
    await this.media.assertStorageAvailable();

    const partCount = Math.ceil(session.totalBytes / session.chunkSize);
    if (!Number.isInteger(index) || index < 0 || index >= partCount) {
      throw AppException.validation({
        index: `Bo'lak raqami 0 dan ${partCount - 1} gacha bo'lishi kerak`,
      });
    }

    // Bounding the part is what makes `totalBytes` mean anything. Without it a session that
    // promised a kilobyte could still write a gigabyte to disk and only be caught at `complete`,
    // by which point the disk has already paid for it. The last part is allowed to be shorter,
    // never longer.
    try {
      await this.parts.writePart(uploadId, index, body, session.chunkSize);
    } catch (error) {
      if (error instanceof PartTooLargeError) {
        throw new AppException(
          ERROR_CODE.FILE_TOO_LARGE,
          413,
          `Bo'lak hajmi ${session.chunkSize} baytdan oshmasligi kerak`,
        );
      }
      throw error;
    }
    return this.progress(session);
  }

  /** What has arrived, so an interrupted client knows what to send next. */
  async status(user: AuthenticatedUser, uploadId: string): Promise<UploadProgress> {
    return this.progress(await this.require(uploadId, user.id));
  }

  /**
   * Assembles the parts and runs them through the ordinary upload pipeline.
   *
   * Reusing `ChatMediaService.upload` is deliberate and load-bearing: a file that arrived in pieces
   * gets exactly the same permission checks, type detection, processing and quota accounting as one
   * that arrived whole. Two code paths would eventually disagree, and the one nobody looks at would
   * be the lenient one.
   */
  async complete(
    user: AuthenticatedUser,
    uploadId: string,
    finalTotalBytes?: number,
  ): Promise<MediaAsset> {
    const session = await this.require(uploadId, user.id);

    // Completeness is a question about the parts themselves — 0,1,2,… with no hole — rather than
    // about a count derived from `totalBytes`. That is what lets a client start sending before it
    // knows the final size: it declares an upper bound at `init` and the real figure here.
    const received = await this.parts.receivedParts(uploadId);
    const gap = firstGap(received);
    if (gap !== null) {
      throw new AppException(
        ERROR_CODE.UPLOAD_INCOMPLETE,
        422,
        `Yuklash tugallanmagan — ${gap}-bo'lak yetishmayapti`,
      );
    }

    // Absent, the declared size stands — which is exactly the old behaviour for a client that
    // knew the size up front and never sends this.
    const declared = finalTotalBytes ?? session.totalBytes;
    const actualBytes = await this.parts.receivedBytes(uploadId);

    // Short, with no hole in the middle, means the parts simply stop early — the tail has not
    // arrived yet. That is "incomplete" and not "wrong size": the client's next move is to send
    // more parts, and telling it the numbers disagree would send it looking for the wrong bug.
    if (actualBytes < declared) {
      throw new AppException(
        ERROR_CODE.UPLOAD_INCOMPLETE,
        422,
        `Yuklash tugallanmagan — ${declared - actualBytes} bayt yetishmayapti`,
      );
    }
    if (actualBytes > declared) {
      // Not pedantry: the parts are what the pipeline is about to treat as one file, and a
      // mismatch means either the client or the disk is wrong about which bytes those are.
      throw new AppException(
        ERROR_CODE.UPLOAD_SIZE_MISMATCH,
        422,
        "Yuklangan hajm e'lon qilingan hajmga mos kelmadi",
      );
    }
    if (actualBytes > session.totalBytes) {
      // The quota and the disk check at `init` were both answered for `session.totalBytes`. Letting
      // the real file exceed it would make that approval meaningless, so the bound stays a bound.
      throw new AppException(
        ERROR_CODE.UPLOAD_SIZE_MISMATCH,
        422,
        "Yuklangan hajm boshda e'lon qilingan chegaradan oshib ketdi",
      );
    }

    const dir = await mkdtemp(join(this.storage.tempDir, 'assemble-'));
    try {
      const assembled = join(dir, 'upload');
      await this.parts.assemble(uploadId, assembled);

      const asset = await this.media.upload(user, {
        kind: session.kind,
        conversationId: session.conversationId,
        quality: session.quality ?? undefined,
        file: {
          path: assembled,
          size: actualBytes,
          originalname: session.fileName ?? undefined,
        },
      });

      // Only once the asset exists: until then the parts are the only copy of the upload, and a
      // failure part-way through should leave the session resumable rather than lost.
      await this.discard(session);
      return asset;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Abandons a session and removes its parts. */
  async cancel(user: AuthenticatedUser, uploadId: string): Promise<void> {
    await this.discard(await this.require(uploadId, user.id));
  }

  /**
   * Removes sessions past their expiry, bytes first.
   *
   * The counterpart to the 24-hour TTL: without this, every abandoned pick leaves its parts on disk
   * for good. Returns how many sessions went.
   */
  async sweepExpired(limit = 200): Promise<number> {
    const expired = await this.sessions.findExpired(new Date(), limit);
    for (const session of expired) {
      await this.discard(session).catch((error: Error) => {
        this.logger.warn(`Could not sweep upload ${session.id}: ${error.message}`);
      });
    }

    // The other thing that leaves bytes behind: a request killed between multer writing the upload
    // and the handler deleting it. Nothing tracks those, so age is the only signal there is.
    const staleTemp = await this.storage.sweepStaleTemp(this.ttlMs).catch((error: Error) => {
      this.logger.warn(`Could not sweep scratch files: ${error.message}`);
      return 0;
    });
    if (staleTemp > 0) {
      this.logger.log(`Removed ${staleTemp} abandoned scratch file(s)`);
    }

    return expired.length;
  }

  private async discard(session: UploadSession): Promise<void> {
    // Parts first: a row with no parts is resolvable noise, parts with no row are bytes nothing will
    // ever look for again.
    await this.parts.discard(session.id);
    await this.sessions.delete(session.id);
  }

  private async progress(session: UploadSession): Promise<UploadProgress> {
    return {
      uploadId: session.id,
      received: await this.parts.receivedParts(session.id),
      chunkSize: session.chunkSize,
      totalBytes: session.totalBytes,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * The session, if it is this student's and has not expired.
   *
   * One 404 for all three failures — unknown, someone else's, expired. Telling them apart would let
   * anyone with a guessed id learn that it exists.
   */
  private async require(uploadId: string, ownerId: string): Promise<UploadSession> {
    const session = await this.sessions.findById(uploadId);
    if (
      session === null ||
      session.ownerId !== ownerId ||
      session.expiresAt.getTime() < Date.now()
    ) {
      throw AppException.notFound(
        ERROR_CODE.UPLOAD_SESSION_NOT_FOUND,
        'Yuklash sessiyasi topilmadi',
      );
    }
    return session;
  }
}

/**
 * The first missing index in an ascending, de-duplicated part list, or `null` when it runs 0..n-1
 * unbroken. An empty list is a gap at 0 — nothing was ever sent.
 */
function firstGap(received: number[]): number | null {
  for (let index = 0; index < received.length; index += 1) {
    if (received[index] !== index) {
      return index;
    }
  }
  return received.length === 0 ? 0 : null;
}
