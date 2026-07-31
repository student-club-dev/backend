import { isAllowedProviderUrl } from '../../../common/validation/provider-url';
import { MediaProvider } from '../../media/domain/enums/media-kind.enum';

/** One provider sticker. Send it back verbatim as `SendMessageDto.sticker` to post it. */
export interface StickerItem {
  id: string;
  /**
   * WebP (or a GIF that kept its alpha) — never MP4. Returning MP4 was the right call for GIF
   * search, and the wrong one here: MP4 has no alpha channel, so a transparent sticker arrives as a
   * white square sitting in the middle of the bubble.
   */
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  isAnimated: boolean;
}

/** A page of provider stickers plus the cursor. */
export interface StickerPage {
  items: StickerItem[];
  next: string | null;
  provider: MediaProvider;
}

/**
 * Hosts a provider sticker may be served from.
 *
 * Narrower than the GIF list on purpose: no sticker row predates KLIPY, so there is no legacy CDN to
 * keep rendering, and every host we do not need is one more place a lookalike could hide.
 */
const ALLOWED_HOSTS: readonly RegExp[] = [/^static\.klipy\.com$/, /^[a-z0-9-]+\.klipy\.com$/];

/** Whether a provider sticker URL may be returned to, and accepted back from, the client. */
export function isAllowedStickerUrl(raw: string): boolean {
  return isAllowedProviderUrl(raw, ALLOWED_HOSTS);
}
