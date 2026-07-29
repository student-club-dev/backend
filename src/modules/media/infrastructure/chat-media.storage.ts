import { randomUUID } from 'crypto';
import { createReadStream, type ReadStream } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join, normalize, resolve, sep } from 'path';
import { Injectable } from '@nestjs/common';
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
export class ChatMediaStorage {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('CHAT_MEDIA_DIR', { infer: true }));
  }

  /** Writes bytes under a fresh opaque key and returns it. */
  async save(buffer: Buffer, extension: string): Promise<string> {
    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
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
