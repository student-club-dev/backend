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
  /**
   * The ceiling this session may not exceed: the size the client promised, or — for a streaming
   * session — the reserve taken on its behalf. Checked against what actually arrived before
   * `complete` runs.
   */
  totalBytes: number;
  /**
   * `init` was called without `totalBytes` (streaming upload spec §1), so the final size is not
   * known yet and `complete` must be told both it and the part count.
   */
  streaming: boolean;
  chunkSize: number;
  expiresAt: Date;
  createdAt: Date;
}

export type NewUploadSession = Omit<UploadSession, 'id' | 'createdAt'>;
