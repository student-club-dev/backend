import { MediaKind, MediaQuality } from '../enums/media-kind.enum';

/**
 * An upload in progress, sent in parts (parity spec §7).
 *
 * Holds only what `init` was told. **Which parts have arrived is deliberately not here** — that is
 * the set of files on disk, and the reason is concurrency: parts may arrive in parallel, out of
 * order and more than once, so a list in a column would need every write to go through
 * `array_append` to avoid two simultaneous PUTs losing one another. A filename is atomic for free.
 */
export interface UploadSession {
  id: string;
  ownerId: string;
  conversationId: string | null;
  kind: MediaKind;
  quality: MediaQuality | null;
  fileName: string | null;
  /** The size the client promised. Checked against what actually arrived before `complete` runs. */
  totalBytes: number;
  chunkSize: number;
  expiresAt: Date;
  createdAt: Date;
}

export type NewUploadSession = Omit<UploadSession, 'id' | 'createdAt'>;
