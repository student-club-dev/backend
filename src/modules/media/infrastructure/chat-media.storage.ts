import { randomUUID } from 'crypto';
import { createReadStream, type ReadStream } from 'fs';
import { copyFile, mkdir, readdir, rename, rm, stat, statfs, writeFile } from 'fs/promises';
import { dirname, join, normalize, resolve, sep } from 'path';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';

/**
 * Private storage for chat attachments.
 *
 * Deliberately *not* the `StoragePort` used for listing images: those are served straight off a
 * static path, which is exactly what a private chat photo must never be. Nothing here returns a
 * public URL — the only way out is `GET /v1/media/{id}/raw`, which checks membership first.
 */
@Injectable()
export class ChatMediaStorage implements OnModuleInit {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('CHAT_MEDIA_DIR', { infer: true }));
  }

  /**
   * Creates the root and the scratch directory up front.
   *
   * `tempDir` has to exist before the first request rather than on demand: multer opens the
   * destination itself and fails the upload if it is missing, and `statfs` needs a real directory to
   * report on.
   */
  async onModuleInit(): Promise<void> {
    await mkdir(this.tempDir, { recursive: true });
  }

  /**
   * Where in-flight uploads land before they are accepted.
   *
   * Inside the media root on purpose: `saveFile` then promotes a finished upload with `rename`,
   * which is a metadata write on the same filesystem instead of copying the bytes a second time.
   */
  get tempDir(): string {
    return join(this.root, 'tmp');
  }

  /**
   * Moves an already-written file into storage under a fresh key.
   *
   * The bytes are never read, which is what makes `kind = FILE` byte-for-byte identical to what was
   * sent (parity spec §1.2) rather than merely intended to be. `rename` is the whole operation on one
   * filesystem; the copy fallback only runs when the scratch directory has been pointed somewhere
   * else.
   */
  async saveFile(sourcePath: string, extension: string): Promise<string> {
    const key = this.newKey(extension);
    const target = this.pathOf(key);
    await mkdir(dirname(target), { recursive: true });
    try {
      await rename(sourcePath, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
        throw error;
      }
      await copyFile(sourcePath, target);
      await rm(sourcePath, { force: true });
    }
    return key;
  }

  /**
   * Writes bytes under a fresh opaque key and returns it.
   *
   * For artifacts we *derived* — thumbnails, poster frames, transcoder output — which are small and
   * already in memory. An upload itself goes through `saveFile`.
   */
  async save(buffer: Buffer, extension: string): Promise<string> {
    const key = this.newKey(extension);
    const target = this.pathOf(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    return key;
  }

  /** Streams a stored object back. The caller must have already authorised the read. */
  read(key: string): ReadStream {
    return createReadStream(this.pathOf(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  /**
   * Fraction of the media volume in use, 0..1.
   *
   * The replacement for the size limits §2 removed: uploads are refused on how full the disk is
   * rather than on how big one file is, which is the bound that actually matters. `bavail` excludes
   * the blocks reserved for root, so this reads slightly high — erring toward refusing early is the
   * right direction for a check whose job is to fail loudly before the filesystem does.
   */
  async usedRatio(): Promise<number> {
    const stats = await statfs(this.root);
    if (stats.blocks === 0) {
      return 0;
    }
    return 1 - Number(stats.bavail) / Number(stats.blocks);
  }

  /**
   * Removes scratch files left behind by a request that never finished.
   *
   * The request path deletes its own temp file on every exit, so this only ever finds what a crash
   * or a `SIGKILL` mid-upload left — but with no size ceiling any more, a handful of those is real
   * disk. Anything younger than `olderThanMs` is left alone: an upload in progress is a file that
   * has not been touched yet either.
   */
  async sweepStaleTemp(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let entries: string[];
    try {
      entries = await readdir(this.tempDir);
    } catch {
      return 0;
    }

    let removed = 0;
    for (const entry of entries) {
      const path = join(this.tempDir, entry);
      try {
        const info = await stat(path);
        if (info.mtimeMs < cutoff) {
          await rm(path, { recursive: true, force: true });
          removed += 1;
        }
      } catch {
        // Raced with the request that owns it — which is the outcome we wanted anyway.
      }
    }
    return removed;
  }

  private newKey(extension: string): string {
    return `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
  }

  /**
   * Resolves a key inside the media root, refusing anything that climbs out of it. Keys are
   * server-generated today, but this is the one place a traversal would turn into an arbitrary file
   * read, so it is checked rather than assumed.
   */
  private pathOf(key: string): string {
    const target = resolve(join(this.root, normalize(key)));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error('storage key escapes the media root');
    }
    return target;
  }
}
