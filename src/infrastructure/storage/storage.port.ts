/**
 * Storage abstraction — the ONE seam that makes media storage swappable.
 *
 * Currently bound to `LocalDiskStorage` (see storage.module.ts). To move to S3 / Cloudflare R2
 * later: add `s3.storage.ts implements StoragePort` and swap the binding in `storage.module.ts`
 * (`useClass: LocalDiskStorage` → `useClass: S3Storage`) plus add the S3 env vars. NOTHING in the
 * media module changes — it depends only on the `STORAGE` token and this interface.
 */

/** DI token for the active `StoragePort` implementation. */
export const STORAGE = Symbol('STORAGE');

/** A binary object to persist. `contentType`/`ext` come from the detected image type. */
export interface StorageSaveInput {
  purpose: string;
  buffer: Buffer;
  contentType: string;
  ext: string;
}

/** Result of a successful save: the storage key and its public URL. */
export interface StorageSaveResult {
  key: string;
  url: string;
}

export interface StoragePort {
  save(input: StorageSaveInput): Promise<StorageSaveResult>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}
