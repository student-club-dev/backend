/**
 * What an upload is. Wire values match the Prisma `MediaKind`.
 *
 * The chat kinds are scoped to a conversation. `PROFILE_PHOTO` and the `STORY_*` pair share the same
 * upload pipeline — EXIF stripping, transcoding, thumbnails — but have no conversation, and are
 * authorised on read by their own rule instead.
 */
export enum MediaKind {
  IMAGE = 'IMAGE',
  /**
   * The same picture, sent at full resolution (parity spec §3). Only EXIF is removed; the pixels and
   * the container are the sender's. A message carrying one is still `type: IMAGE` — the difference
   * is quality, not how it renders.
   */
  IMAGE_ORIGINAL = 'IMAGE_ORIGINAL',
  GIF = 'GIF',
  VIDEO = 'VIDEO',
  /** Telegram's round video message (parity spec §5). Square, short, and never captioned. */
  VIDEO_NOTE = 'VIDEO_NOTE',
  VOICE = 'VOICE',
  FILE = 'FILE',
  PROFILE_PHOTO = 'PROFILE_PHOTO',
  STORY_IMAGE = 'STORY_IMAGE',
  STORY_VIDEO = 'STORY_VIDEO',
}

/** Kinds that belong to a conversation, and therefore require a `conversationId` on upload. */
const CHAT_KINDS: ReadonlySet<MediaKind> = new Set([
  MediaKind.IMAGE,
  MediaKind.IMAGE_ORIGINAL,
  MediaKind.GIF,
  MediaKind.VIDEO,
  MediaKind.VIDEO_NOTE,
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

/**
 * Kinds served as opaque bytes rather than as decodable media.
 *
 * `FILE` accepts anything at all now (parity spec §1), which is only safe because nothing it holds is
 * ever handed to a browser as its real type. This predicate is what the download endpoint keys the
 * `application/octet-stream` + `attachment` pair off, so the two halves of that decision cannot drift
 * apart.
 */
export function isOpaqueKind(kind: MediaKind): boolean {
  return kind === MediaKind.FILE;
}

/** Processing state. `PROCESSING` only ever applies to video, which transcodes on a queue. */
export enum MediaStatus {
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

/**
 * How hard to try on a video upload (parity spec §4.2).
 *
 * `AUTO` is what every client that says nothing gets, and matches the behaviour that shipped before
 * the field existed. `ORIGINAL` is the escape hatch: the file is stored exactly as it arrived and
 * never queued, so the sender's own encode is what the recipient plays.
 */
export enum MediaQuality {
  AUTO = 'AUTO',
  HIGH = 'HIGH',
  ORIGINAL = 'ORIGINAL',
}

/**
 * Where an attachment came from when the student picked it from search instead of uploading it.
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
