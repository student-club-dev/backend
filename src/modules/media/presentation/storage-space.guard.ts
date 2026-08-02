import { CanActivate, Injectable } from '@nestjs/common';
import { ChatMediaService } from '../application/chat-media.service';

/**
 * Refuses an upload when the media volume is nearly full (parity spec §2.1).
 *
 * A **guard** rather than a check inside the handler, and that is the whole point of it: guards run
 * before interceptors, so this fires before multer has written a single byte. Checking in the service
 * would mean a 2 GB upload lands on a disk with no room for it and is only then rejected — which is
 * the failure the check exists to prevent.
 *
 * The service keeps its own copy of the check for the resumable path, where each part arrives through
 * a different request.
 */
@Injectable()
export class StorageSpaceGuard implements CanActivate {
  constructor(private readonly media: ChatMediaService) {}

  async canActivate(): Promise<boolean> {
    // Throws 503 STORAGE_FULL rather than returning false: a plain `false` would surface as 403,
    // which tells the client to stop trying instead of to try again later.
    await this.media.assertStorageAvailable();
    return true;
  }
}
