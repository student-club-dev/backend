import { MediaKind } from '../domain/enums/media-kind.enum';

/** The subset of a Multer file the upload use-case reads. */
export interface UploadedChatFile {
  buffer: Buffer;
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
  file?: UploadedChatFile;
}

/** Injection token for the transcode queue port. */
export const MEDIA_QUEUE = Symbol('MEDIA_QUEUE');

/**
 * Long-running work that must not block the upload response. Video is the only user of this today:
 * a 64 MB clip can take a minute to re-encode, and the client needs its `mediaId` immediately so it
 * can send the message and show a placeholder.
 */
export interface MediaQueuePort {
  enqueueTranscode(assetId: string): Promise<void>;
}
