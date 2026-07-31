/**
 * Host allowlisting for third-party media URLs (GIFs, stickers).
 *
 * These URLs make a round trip: search hands one to the client, the client hands it back on a send,
 * and we store it on a message that other people's phones will fetch. Without a check at both ends
 * the field is an open redirect into any host an attacker likes — a link that logs every recipient's
 * IP renders exactly like a real sticker.
 *
 * Parsing with `URL` first is what makes the check hold up. It resolves the three shapes a plain
 * `startsWith`/`includes` test misses: a lookalike suffix (`static.klipy.com.evil.example`),
 * credentials in the authority (`https://static.klipy.com@evil.example/x.webp` — whose *host* is
 * `evil.example`), and non-http schemes such as `javascript:` or `data:`.
 */
export function isAllowedProviderUrl(raw: string, allowedHosts: readonly RegExp[]): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  // Plain http would let a network attacker swap the content on the way to the phone; `javascript:`
  // and `data:` are rejected by the same clause.
  if (url.protocol !== 'https:') {
    return false;
  }
  return allowedHosts.some((pattern) => pattern.test(url.hostname));
}
