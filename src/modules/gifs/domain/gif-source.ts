import { MediaProvider } from '../../media/domain/enums/media-kind.enum';

/** One search hit, already reduced to what the client needs. */
export interface GifItem {
  id: string;
  /** Silent looping MP4 — never the `.gif`, which is ~20× the bytes for the same animation. */
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  durationMs: number | null;
}

/** A page of hits plus the provider cursor. */
export interface GifPage {
  items: GifItem[];
  next: string | null;
  provider: MediaProvider;
}

/**
 * Hosts a provider GIF may be served from.
 *
 * Without this the `gif` field on a send is an open redirect into any URL an attacker likes: the
 * client renders whatever it is handed, and the message would happily carry a link to somewhere
 * that logs every recipient's IP.
 */
const ALLOWED_HOSTS: readonly RegExp[] = [
  /^media\d*\.tenor\.com$/,
  /^media\.tenor\.com$/,
  /^c\.tenor\.com$/,
  /^media\d*\.giphy\.com$/,
  /^i\.giphy\.com$/,
];

/** Whether a provider URL may be stored on a message and rendered by the client. */
export function isAllowedGifUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  // Plain http would let a network attacker swap the content on the way to the phone.
  if (url.protocol !== 'https:') {
    return false;
  }
  return ALLOWED_HOSTS.some((pattern) => pattern.test(url.hostname));
}
