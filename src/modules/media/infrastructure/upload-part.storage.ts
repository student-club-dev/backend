import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, rename, rm, stat } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';

/**
 * A part whose body ran past the agreed size.
 *
 * Its own type so the application layer can turn it into the right HTTP answer: infrastructure has
 * no business constructing an `AppException`, and a bare `Error` here would surface as a 500 for
 * what is really a bad request.
 */
export class PartTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`upload part exceeded ${maxBytes} bytes`);
    this.name = 'PartTooLargeError';
  }
}

/**
 * The parts of an in-flight resumable upload, on disk (parity spec §7).
 *
 * **This is where "which parts have arrived" lives** — the set of files in a session's directory,
 * not a column. Parts arrive in parallel, out of order, and sometimes twice, and each of those is
 * handled by the filesystem rather than by locking:
 *
 * - *out of order* — a part is named by its index, so order never mattered;
 * - *in parallel* — two PUTs write two different filenames, so there is nothing to race over;
 * - *repeated* — a retry writes to a scratch name and renames over the old one, which is atomic, so
 *   a reader either sees the whole old part or the whole new one and never a half-written mix.
 *
 * A database column would need every one of those writes to go through `array_append` in raw SQL to
 * avoid two concurrent PUTs losing an update between them.
 */
@Injectable()
export class UploadPartStorage {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(join(config.get('CHAT_MEDIA_DIR', { infer: true }), 'incoming'));
  }

  /**
   * Streams one part to disk, replacing any earlier copy of the same index.
   *
   * The body is never buffered: it goes from the socket to the file. Returns how many bytes landed.
   *
   * `maxBytes` is enforced **as the bytes arrive**, not afterwards, and that ordering is the point.
   * Checking the total at `complete` would be far too late: the disk is what an oversized part
   * costs, and by then it has already cost it. A body that runs over is cut off mid-stream and its
   * scratch file deleted, so an upload promising a kilobyte cannot quietly deposit a gigabyte.
   */
  async writePart(
    uploadId: string,
    index: number,
    body: NodeJS.ReadableStream,
    maxBytes: number,
  ): Promise<number> {
    const dir = this.dirOf(uploadId);
    await mkdir(dir, { recursive: true });

    // Written under a scratch name and renamed into place, so a part is never observed half-written
    // — an interrupted PUT leaves the previous copy intact rather than a truncated one.
    const scratch = join(dir, `${index}.partial`);
    const target = join(dir, String(index));

    let written = 0;
    const bounded = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        written += chunk.length;
        if (written > maxBytes) {
          done(new PartTooLargeError(maxBytes));
          return;
        }
        done(null, chunk);
      },
    });

    try {
      await pipeline(body, bounded, createWriteStream(scratch));
    } catch (error) {
      await rm(scratch, { force: true });
      throw error;
    }
    await rename(scratch, target);

    const { size } = await stat(target);
    return size;
  }

  /** Indexes that have arrived, ascending. Empty when the session has no directory yet. */
  async receivedParts(uploadId: string): Promise<number[]> {
    let entries: string[];
    try {
      entries = await readdir(this.dirOf(uploadId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    return entries
      .filter((name) => /^\d+$/.test(name))
      .map(Number)
      .sort((a, b) => a - b);
  }

  /** Total bytes received so far, for checking against the promised size. */
  async receivedBytes(uploadId: string): Promise<number> {
    const dir = this.dirOf(uploadId);
    const parts = await this.receivedParts(uploadId);
    let total = 0;
    for (const index of parts) {
      const { size } = await stat(join(dir, String(index)));
      total += size;
    }
    return total;
  }

  /**
   * Concatenates the parts, in index order, into `target`.
   *
   * Appended one stream at a time rather than read into memory: the whole reason this endpoint
   * exists is files too big to hold (parity spec §7).
   */
  async assemble(uploadId: string, target: string): Promise<void> {
    const dir = this.dirOf(uploadId);
    const parts = await this.receivedParts(uploadId);
    const out = createWriteStream(target);
    try {
      for (const index of parts) {
        // `end: false` keeps the destination open for the next part.
        await pipeline(createReadStream(join(dir, String(index))), out, { end: false });
      }
    } finally {
      await new Promise<void>((done) => out.end(done));
    }
  }

  /** Removes everything belonging to a session. Safe to call when nothing was ever written. */
  async discard(uploadId: string): Promise<void> {
    await rm(this.dirOf(uploadId), { recursive: true, force: true });
  }

  /**
   * Resolves a session directory, refusing an id that climbs out of the incoming root.
   *
   * Ids are server-generated cuids, but this value arrives back from the client in the URL, and it
   * is the one place a traversal would turn into writing wherever the attacker chose.
   */
  private dirOf(uploadId: string): string {
    const target = resolve(join(this.root, uploadId));
    if (!target.startsWith(this.root + sep)) {
      throw new Error('upload id escapes the incoming root');
    }
    return target;
  }
}
