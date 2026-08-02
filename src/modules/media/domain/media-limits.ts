import { MediaKind } from './enums/media-kind.enum';

/**
 * Per-kind upload rules. Pure data — the upload use-case reads it, and the numbers live in one place
 * so the Swagger text and the runtime check can never disagree.
 *
 * Parity spec §2 removed the product-level ceilings: `maxBytes` is `null` for almost everything, and
 * what remains is either a format definition (a round video *is* short and small) or a guard against
 * a file that would take the process down rather than one that is merely large.
 */
export interface KindLimits {
  /**
   * MIME types accepted, as detected from the file's magic bytes — never from the request header.
   * `null` means **any type at all**, which is what `FILE` is (parity spec §1).
   */
  mimeTypes: readonly string[] | null;
  /** Byte ceiling. `null` where the kind has none — the daily quota is the only bound. */
  maxBytes: number | null;
  /** Duration ceiling for time-based media, in ms. `null` where the kind has none. */
  maxDurationMs: number | null;
  /** Longest allowed side in pixels, for images. `null` where it does not apply. */
  maxDimension: number | null;
}

const MB = 1024 * 1024;

const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;

/**
 * Voice containers.
 *
 * Opus (`audio/opus`, and Opus-in-WebM) is what Telegram uses and is roughly half the bytes, but the
 * m4a/AAC set has to stay: iOS's system recorder cannot produce Opus at all, and on Android it needs
 * API 29+. Dropping either half would silently break voice notes on real devices (parity spec §6).
 */
const VOICE_MIME_TYPES = [
  'audio/mp4',
  'audio/aac',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/ogg',
  'audio/opus',
  'audio/webm',
] as const;

/**
 * The pixel ceiling that stops a decompression bomb, not a product limit.
 *
 * A 50000×50000 PNG is a few hundred kilobytes on disk and about ten gigabytes decoded, so this
 * check has to survive §2's "no size limits" — it is about what the file costs to *open*, not what it
 * costs to store. 16384 is sharp's own default pixel budget, and anything larger can still be sent
 * as `FILE`, byte for byte.
 */
export const MAX_IMAGE_DIMENSION = 16384;

export const MEDIA_LIMITS: Record<MediaKind, KindLimits> = {
  [MediaKind.IMAGE]: {
    mimeTypes: IMAGE_MIME_TYPES,
    maxBytes: null,
    maxDurationMs: null,
    maxDimension: MAX_IMAGE_DIMENSION,
  },
  [MediaKind.IMAGE_ORIGINAL]: {
    mimeTypes: IMAGE_MIME_TYPES,
    maxBytes: null,
    maxDurationMs: null,
    maxDimension: MAX_IMAGE_DIMENSION,
  },
  [MediaKind.GIF]: {
    // An .mp4 is accepted here too: "send as GIF" in the client means "play muted and looping",
    // which is a presentation choice, not a container.
    mimeTypes: ['image/gif', 'video/mp4'],
    maxBytes: null,
    maxDurationMs: null,
    maxDimension: null,
  },
  [MediaKind.VIDEO]: {
    mimeTypes: VIDEO_MIME_TYPES,
    maxBytes: null,
    maxDurationMs: null,
    maxDimension: null,
  },
  [MediaKind.VIDEO_NOTE]: {
    // The one kind that keeps both ceilings, because they are what the format *is* rather than a
    // restriction on it: a round message is a glance, recorded at 384², and a minute of that is
    // nowhere near 12 MB (parity spec §5).
    mimeTypes: VIDEO_MIME_TYPES,
    maxBytes: 12 * MB,
    maxDurationMs: 60_000,
    maxDimension: null,
  },
  [MediaKind.VOICE]: {
    mimeTypes: VOICE_MIME_TYPES,
    maxBytes: null,
    maxDurationMs: null,
    maxDimension: null,
  },
  [MediaKind.FILE]: {
    // Any type at all. The allowlist that used to live here is gone (parity spec §1); what replaced
    // it is on the way out — `application/octet-stream` and `Content-Disposition: attachment`, so a
    // browser never executes what a chat stored.
    mimeTypes: null,
    maxBytes: null,
    maxDurationMs: null,
    maxDimension: null,
  },
  [MediaKind.PROFILE_PHOTO]: {
    mimeTypes: IMAGE_MIME_TYPES,
    maxBytes: null,
    maxDurationMs: null,
    maxDimension: MAX_IMAGE_DIMENSION,
  },
  [MediaKind.STORY_IMAGE]: {
    mimeTypes: IMAGE_MIME_TYPES,
    maxBytes: null,
    maxDurationMs: null,
    maxDimension: MAX_IMAGE_DIMENSION,
  },
  [MediaKind.STORY_VIDEO]: {
    mimeTypes: VIDEO_MIME_TYPES,
    // Size is unbounded — a minute of 4K is welcome. The minute itself is not: a story is tapped
    // through, and the cap is a product decision rather than a technical one (parity spec §2).
    maxBytes: null,
    maxDurationMs: 60_000,
    maxDimension: null,
  },
};

/** Voice waveform resolution the client draws (parity spec §6: 48 was too coarse to read). */
export const WAVEFORM_POINTS = 100;

/** Long side an uploaded `IMAGE` is downscaled to; anything smaller is left alone. */
export const IMAGE_MAX_SIDE = 1920;

/** Long side of the generated thumbnail. */
export const THUMB_MAX_SIDE = 320;

/**
 * Strips a client-supplied filename down to something safe to store and echo back: no directory
 * traversal, no control characters, bounded length. Returns `null` when nothing usable is left.
 *
 * This survived §1's removal of the type allowlist and always will: `../../etc/passwd` is a path
 * traversal, not a file type, and the two were never the same check.
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
