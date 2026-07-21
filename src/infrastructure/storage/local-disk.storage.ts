import { randomUUID } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { StoragePort, StorageSaveInput, StorageSaveResult } from './storage.port';

/**
 * Local-disk `StoragePort`: writes to `<UPLOADS_DIR>/<purpose>/<uuid>.<ext>` and serves the file
 * back over `<PUBLIC_MEDIA_BASE_URL>/<key>` (Express static in dev, Nginx in prod).
 */
@Injectable()
export class LocalDiskStorage implements StoragePort {
  private readonly uploadsDir: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.uploadsDir = config.get('UPLOADS_DIR', { infer: true });
    this.baseUrl = config.get('PUBLIC_MEDIA_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  async save(input: StorageSaveInput): Promise<StorageSaveResult> {
    const key = `${input.purpose}/${randomUUID()}.${input.ext}`;
    await mkdir(join(this.uploadsDir, input.purpose), { recursive: true });
    await writeFile(join(this.uploadsDir, key), input.buffer);
    return { key, url: this.publicUrl(key) };
  }

  async delete(key: string): Promise<void> {
    await rm(join(this.uploadsDir, key), { force: true });
  }

  publicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}
