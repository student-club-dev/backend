import { MediaKind } from './enums/media-kind.enum';

/**
 * Per-kind upload limits (chat media spec §1.1). Pure data — the upload use-case reads it, and the
 * numbers live in one place so the Swagger text, the multipart limit and the runtime check can never
 * disagree.
 */
export interface KindLimits {
  /** MIME types accepted, as detected from the file's magic bytes — never from the request header. */
  mimeTypes: readonly string[];
  maxBytes: number;
  /** Duration ceiling for time-based media, in ms. `null` for images and documents. */
  maxDurationMs: number | null;
  /** Longest allowed side in pixels, for images. `null` where it does not apply. */
  maxDimension: number | null;
}

const MB = 1024 * 1024;

/**
 * Executables are rejected outright, whatever the extension claims. A chat that will happily host
 * an APK is a malware delivery channel, and the store review that notices is not a conversation
 * anyone wants to have.
 */
export const BLOCKED_EXTENSIONS = [
  '.apk',
  '.exe',
  '.sh',
  '.bat',
  '.cmd',
  '.com',
  '.jar',
  '.dex',
  '.ipa',
  '.msi',
  '.dmg',
  '.scr',
  '.ps1',
] as const;

/** Documents a student can send. Anything outside this list is refused (spec §1.1). */
const FILE_MIME_TYPES = [
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
] as const;

export const MEDIA_LIMITS: Record<MediaKind, KindLimits> = {
  [MediaKind.IMAGE]: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    maxBytes: 12 * MB,
    maxDurationMs: null,
    maxDimension: 8192,
  },
  [MediaKind.GIF]: {
    // An .mp4 is accepted here too: "send as GIF" in the client means "play muted and looping",
    // which is a presentation choice, not a container.
    mimeTypes: ['image/gif', 'video/mp4'],
    maxBytes: 20 * MB,
    maxDurationMs: 30_000,
    maxDimension: null,
  },
  [MediaKind.VIDEO]: {
    mimeTypes: ['video/mp4', 'video/quicktime'],
    maxBytes: 64 * MB,
    maxDurationMs: 3 * 60_000,
    maxDimension: null,
  },
  [MediaKind.VOICE]: {
    mimeTypes: ['audio/mp4', 'audio/aac', 'audio/ogg', 'audio/mpeg', 'audio/x-m4a'],
    maxBytes: 16 * MB,
    maxDurationMs: 5 * 60_000,
    maxDimension: null,
  },
  [MediaKind.FILE]: {
    mimeTypes: FILE_MIME_TYPES,
    maxBytes: 48 * MB,
    maxDurationMs: null,
    maxDimension: null,
  },
};

/** The largest upload any kind allows — the multipart interceptor's hard ceiling. */
export const MAX_UPLOAD_BYTES = Math.max(
  ...Object.values(MEDIA_LIMITS).map((limits) => limits.maxBytes),
);

/** Voice waveform resolution the client draws. Fixed: the bubble is a fixed number of bars. */
export const WAVEFORM_POINTS = 48;

/** Long side an uploaded image is downscaled to; anything smaller is left alone. */
export const IMAGE_MAX_SIDE = 1920;

/** Long side of the generated thumbnail. */
export const THUMB_MAX_SIDE = 320;

/**
 * Strips a client-supplied filename down to something safe to store and echo back: no directory
 * traversal, no control characters, bounded length. Returns `null` when nothing usable is left.
 */
export function sanitizeFileName(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  // Take the basename only — `../` and any directory prefix go with it.
  const base = raw.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned.length === 0) {
    return null;
  }
  return cleaned.slice(0, 120);
}

/** Whether a filename ends in an extension we refuse regardless of detected MIME type. */
export function hasBlockedExtension(fileName: string | null): boolean {
  if (fileName === null) {
    return false;
  }
  const lower = fileName.toLowerCase();
  return BLOCKED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
