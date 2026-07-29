import { MediaKind, MediaProvider, MediaStatus } from '../enums/media-kind.enum';

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
  conversationId: string;
  kind: MediaKind;
  status: MediaStatus;
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
  /** 48 normalised RMS points; empty for anything that is not a voice note. */
  waveform: number[];
  fileName: string | null;
  blurHash: string | null;
  messageId: string | null;
  createdAt: Date;
}

/** Everything needed to persist a freshly processed upload. */
export type NewMediaAsset = Omit<MediaAsset, 'id' | 'createdAt' | 'messageId'>;
