import type { Response } from 'express';

/** What the download endpoint needs to know to decide how a stored object may be presented. */
export interface DownloadHeaderOptions {
  /**
   * True when the bytes are a `FILE` — arbitrary content we never decoded and must never let a
   * browser interpret.
   */
  opaque: boolean;
  /** The type to advertise. Ignored entirely when `opaque`. */
  contentType: string;
  /** Original upload name, when there is one. */
  fileName: string | null;
}

/** What an opaque download is always labelled, whatever it actually contains. */
const OPAQUE_CONTENT_TYPE = 'application/octet-stream';

/**
 * Sets the response headers for a stored attachment (parity spec §1.3).
 *
 * Removing the type allowlist in §1 is only safe because of what happens here. The allowlist was not
 * merely a restriction — it was what stopped an `.html` or `.svg` uploaded to a chat from executing
 * on our own origin, with our own cookies, when someone opened its link. Accepting every type and
 * serving it honestly would turn the chat into stored XSS and the domain into malware hosting.
 *
 * So an opaque download is:
 *
 * - **always `application/octet-stream`.** The real type never reaches a response header. The client
 *   still gets it in `AttachmentDto.mimeType` and can pick an icon from that; a browser cannot.
 * - **always `Content-Disposition: attachment`.** Never `inline`, even for something we know is an
 *   image — the whole point is that this path makes no claims about the content.
 * - **`nosniff`**, so a browser does not helpfully re-derive the type we just refused to state.
 * - **`default-src 'none'; sandbox`**, which neuters it even if it is somehow rendered anyway.
 *
 * This is what Telegram does too: every type accepted, none of them ever opened in a browser.
 *
 * The last two headers are set for decoded media as well. They cost nothing there and mean the
 * defence does not depend on the `opaque` flag being right.
 */
export function applyDownloadHeaders(response: Response, options: DownloadHeaderOptions): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  // Immutable: an asset's bytes never change, so the client may cache them forever. Private:
  // it must never land in a shared cache, since the authorisation is per-user.
  response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

  if (options.opaque) {
    response.setHeader('Content-Type', OPAQUE_CONTENT_TYPE);
    // Unconditional, unlike the decoded kinds below: a document with no stored name still must not
    // render in a tab, so it gets a disposition with a generic one rather than none at all.
    response.setHeader('Content-Disposition', contentDisposition(options.fileName ?? 'file'));
    return;
  }

  response.setHeader('Content-Type', options.contentType);
  if (options.fileName !== null) {
    response.setHeader('Content-Disposition', contentDisposition(options.fileName));
  }
}

/**
 * RFC 6266 `Content-Disposition` for a filename that may not be ASCII.
 *
 * Header values are latin-1: handing Node a Cyrillic name — or even the `ʻ` of Uzbek Latin —
 * throws `ERR_INVALID_CHAR` and turns the download into a 500. So the quoted form carries an ASCII
 * fallback and `filename*` carries the real name, percent-encoded as UTF-8.
 */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^ -~]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
