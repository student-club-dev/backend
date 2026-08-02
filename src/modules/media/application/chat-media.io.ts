import { MediaKind, MediaQuality } from '../domain/enums/media-kind.enum';

/**
 * An upload waiting on disk.
 *
 * A **path**, not a buffer: parity spec §2 removed the size ceiling, and multer's `memoryStorage`
 * turns a 2 GB send into 2 GB of heap. Everything downstream — `file-type`, sharp, ffmpeg — reads
 * from a path more cheaply than from a buffer anyway, so nothing is worse for it.
 *
 * The caller owns the file and deletes it once the upload has been processed, whether it succeeded
 * or not.
 */
export interface UploadedChatFile {
  path: string;
  size: number;
  mimetype?: string;
  originalname?: string;
}

/**
 * A validated `POST /v1/media/chat-upload` request.
 *
 * `conversationId` is `null` for the kinds that have no conversation — `PROFILE_PHOTO` and the
 * `STORY_*` pair. The controller rejects a missing one for every other kind before we get here.
 */
export interface ChatUploadInput {
  kind: MediaKind;
  conversationId: string | null;
  /** Video only, ignored elsewhere. Absent ⇒ `AUTO` (parity spec §4.2). */
  quality?: MediaQuality;
  file?: UploadedChatFile;
}

/** Injection token for the transcode queue port. */
export const MEDIA_QUEUE = Symbol('MEDIA_QUEUE');

/**
 * Long-running work that must not block the upload response. Video is the only user of this today:
 * a long clip can take minutes to re-encode, and the client needs its `mediaId` immediately so it
 * can send the message and show a placeholder.
 */
export interface MediaQueuePort {
  enqueueTranscode(assetId: string): Promise<void>;
}
