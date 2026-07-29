import { Injectable } from '@nestjs/common';
import { MediaAsset } from '../domain/entities/media-asset.entity';

/** Called when an asset finishes processing. Chat turns this into the `media:ready` WS event. */
export type MediaReadyListener = (asset: MediaAsset) => void | Promise<void>;

/**
 * One-way notification from media to whoever cares that a transcode finished.
 *
 * A port injected the other way round would make the two modules import each other: chat already
 * imports media (to validate a `mediaId`), so media cannot import chat. A bus media owns and chat
 * subscribes to keeps the dependency pointing one way.
 */
@Injectable()
export class MediaReadyBus {
  private readonly listeners: MediaReadyListener[] = [];

  subscribe(listener: MediaReadyListener): void {
    this.listeners.push(listener);
  }

  /** Best-effort: a listener that throws must not fail the transcode that triggered it. */
  async publish(asset: MediaAsset): Promise<void> {
    await Promise.all(
      this.listeners.map(async (listener) => {
        try {
          await listener(asset);
        } catch {
          // Swallowed on purpose — see above. The asset is already stored either way.
        }
      }),
    );
  }
}
