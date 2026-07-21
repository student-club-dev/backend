import { Module } from '@nestjs/common';
import { LocalDiskStorage } from './local-disk.storage';
import { STORAGE } from './storage.port';

/**
 * Binds the active `StoragePort`. To move off local disk, swap `useClass` here (and add the adapter
 * class + env vars) — see storage.port.ts. Exported so any module can inject the `STORAGE` token.
 */
@Module({
  providers: [{ provide: STORAGE, useClass: LocalDiskStorage }],
  exports: [STORAGE],
})
export class StorageModule {}
