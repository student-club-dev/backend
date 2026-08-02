import { MediaKind, MediaProvider, MediaQuality, MediaStatus } from '../enums/media-kind.enum';

/**
 * One rendition of a video at a particular height (parity spec §4.3).
 *
 * Nothing writes these yet — the second phase picks a rendition from the recipient's bandwidth the
 * way Telegram does. The shape is fixed now so that turning it on is a background job rather than a
 * migration plus a client release.
 */
export interface MediaVariant {
  height: number;
  bitrate: number;
  url: string;
}

/**
 * One chat attachment.
 *
 * Covers two sources that the client must not have to tell apart: bytes a student uploaded to us
 * (`storageKey` set) and a GIF picked from provider search (`externalUrl` set). Tenor's terms forbid
 * re-hosting, so those are referenced rather than copied — but they still get a row, which is what
 * keeps `MessageDto.attachment` a single shape.
 */
export interface MediaAsset {
  id: string;
  ownerId: string;
  /** `null` for the kinds with no conversation — `PROFILE_PHOTO` and the `STORY_*` pair. */
  conversationId: string | null;
  kind: MediaKind;
  status: MediaStatus;
  /** What the sender asked for on a video upload. `null` for every other kind. */
  quality: MediaQuality | null;
  isAnimated: boolean;
  storageKey: string | null;
  thumbStorageKey: string | null;
  externalUrl: string | null;
  externalThumbUrl: string | null;
  provider: MediaProvider | null;
  externalId: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Normalised RMS points; empty for anything that is not a voice note. */
  waveform: number[];
  /** Speech-to-text for a voice note. Always `null` today — reserved by parity spec §6. */
  transcript: string | null;
  /** Alternative renditions of a video. Always `null` today — reserved by parity spec §4.3. */
  variants: MediaVariant[] | null;
  fileName: string | null;
  blurHash: string | null;
  messageId: string | null;
  createdAt: Date;
}

/** Everything needed to persist a freshly processed upload. */
export type NewMediaAsset = Omit<MediaAsset, 'id' | 'createdAt' | 'messageId'>;
