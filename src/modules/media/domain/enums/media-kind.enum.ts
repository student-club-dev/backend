/**
 * What an upload is. Wire values match the Prisma `MediaKind`.
 *
 * The first five are chat attachments and are scoped to a conversation. `PROFILE_PHOTO` and the
 * `STORY_*` pair share the same upload pipeline — EXIF stripping, transcoding, thumbnails — but have
 * no conversation, and are authorised on read by their own rule instead.
 */
export enum MediaKind {
  IMAGE = 'IMAGE',
  GIF = 'GIF',
  VIDEO = 'VIDEO',
  VOICE = 'VOICE',
  FILE = 'FILE',
  PROFILE_PHOTO = 'PROFILE_PHOTO',
  STORY_IMAGE = 'STORY_IMAGE',
  STORY_VIDEO = 'STORY_VIDEO',
}

/** Kinds that belong to a conversation, and therefore require a `conversationId` on upload. */
const CHAT_KINDS: ReadonlySet<MediaKind> = new Set([
  MediaKind.IMAGE,
  MediaKind.GIF,
  MediaKind.VIDEO,
  MediaKind.VOICE,
  MediaKind.FILE,
]);

/**
 * Whether this kind is a chat attachment.
 *
 * The one predicate that decides both halves of the permission model: on upload, whether a
 * `conversationId` is required and checked; on read, whether membership of that conversation is what
 * grants access. Everything else keys off it, so a new kind cannot end up authorised by accident.
 */
export function isChatKind(kind: MediaKind): boolean {
  return CHAT_KINDS.has(kind);
}

/** Whether this kind is story media (either half of the pair). */
export function isStoryKind(kind: MediaKind): boolean {
  return kind === MediaKind.STORY_IMAGE || kind === MediaKind.STORY_VIDEO;
}

/** Processing state. `PROCESSING` only ever applies to video, which transcodes on a queue. */
export enum MediaStatus {
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

/**
 * Where a GIF came from when the student picked it from search instead of uploading it.
 *
 * Only `KLIPY` is ever written today. `GIPHY` and `TENOR` are kept so this enum stays in lockstep
 * with the Postgres type — dropping a value there needs a migration and fails on any row still
 * holding it, and neither is worth spending one on for two unused labels.
 */
export enum MediaProvider {
  KLIPY = 'KLIPY',
  GIPHY = 'GIPHY',
  TENOR = 'TENOR',
}
