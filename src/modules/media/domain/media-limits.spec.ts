import { MediaKind } from './enums/media-kind.enum';
import { MAX_IMAGE_DIMENSION, MEDIA_LIMITS, sanitizeFileName } from './media-limits';

describe('media limits', () => {
  // Parity spec §2. These assertions are deliberately the inverse of what they used to be: the old
  // suite proved every kind had a ceiling, and the product decision was to remove them.
  it('puts no byte ceiling on anything but a round video message', () => {
    const capped = Object.values(MediaKind).filter((kind) => MEDIA_LIMITS[kind].maxBytes !== null);
    expect(capped).toEqual([MediaKind.VIDEO_NOTE]);
    expect(MEDIA_LIMITS[MediaKind.VIDEO_NOTE].maxBytes).toBe(12 * 1024 * 1024);
  });

  it('leaves only the two duration ceilings that are product decisions', () => {
    expect(MEDIA_LIMITS[MediaKind.STORY_VIDEO].maxDurationMs).toBe(60_000);
    expect(MEDIA_LIMITS[MediaKind.VIDEO_NOTE].maxDurationMs).toBe(60_000);

    expect(MEDIA_LIMITS[MediaKind.VIDEO].maxDurationMs).toBeNull();
    expect(MEDIA_LIMITS[MediaKind.VOICE].maxDurationMs).toBeNull();
    expect(MEDIA_LIMITS[MediaKind.GIF].maxDurationMs).toBeNull();
    expect(MEDIA_LIMITS[MediaKind.IMAGE].maxDurationMs).toBeNull();
    expect(MEDIA_LIMITS[MediaKind.FILE].maxDurationMs).toBeNull();
  });

  it('accepts any type at all for FILE, and only for FILE', () => {
    const unrestricted = Object.values(MediaKind).filter(
      (kind) => MEDIA_LIMITS[kind].mimeTypes === null,
    );
    expect(unrestricted).toEqual([MediaKind.FILE]);
  });

  it('still pins every other kind to an explicit allowlist', () => {
    for (const kind of Object.values(MediaKind)) {
      if (kind === MediaKind.FILE) {
        continue;
      }
      expect(MEDIA_LIMITS[kind].mimeTypes?.length ?? 0).toBeGreaterThan(0);
    }
  });

  // Opus is what parity spec §6 asked for; m4a/AAC has to stay because iOS's system recorder cannot
  // produce Opus at all, and dropping it would silently break voice notes on every iPhone.
  it('accepts both Opus and the m4a/AAC family for voice', () => {
    const voice = MEDIA_LIMITS[MediaKind.VOICE].mimeTypes ?? [];
    expect(voice).toEqual(expect.arrayContaining(['audio/opus', 'audio/ogg', 'audio/webm']));
    expect(voice).toEqual(expect.arrayContaining(['audio/mp4', 'audio/aac', 'audio/x-m4a']));
  });

  it('keeps a pixel ceiling on every image kind — a decode bomb is not a size limit', () => {
    for (const kind of [
      MediaKind.IMAGE,
      MediaKind.IMAGE_ORIGINAL,
      MediaKind.PROFILE_PHOTO,
      MediaKind.STORY_IMAGE,
    ]) {
      expect(MEDIA_LIMITS[kind].maxDimension).toBe(MAX_IMAGE_DIMENSION);
    }
  });

  it('gives the full-resolution image kind the same types as the compressed one', () => {
    expect(MEDIA_LIMITS[MediaKind.IMAGE_ORIGINAL].mimeTypes).toEqual(
      MEDIA_LIMITS[MediaKind.IMAGE].mimeTypes,
    );
  });
});

describe('sanitizeFileName', () => {
  it('strips directory traversal down to the basename', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('..\\..\\windows\\system32\\cmd')).toBe('cmd');
  });

  it('keeps ordinary names, spaces and all', () => {
    expect(sanitizeFileName('Diplom ishi v2.pdf')).toBe('Diplom ishi v2.pdf');
  });

  it('removes control characters', () => {
    expect(sanitizeFileName('a\u0000b\u001fc.txt')).toBe('abc.txt');
  });

  it('keeps a name that only looks suspicious', () => {
    expect(sanitizeFileName('re-port_2026 (final).pdf')).toBe('re-port_2026 (final).pdf');
  });

  // The extension blocklist went with §1; sanitising did not. The two were never the same check —
  // one was about file types, this one is about paths.
  it('keeps an executable extension, because that is no longer its business', () => {
    expect(sanitizeFileName('app-release.apk')).toBe('app-release.apk');
    expect(sanitizeFileName('../../../tmp/app.apk')).toBe('app.apk');
  });

  it('caps the length at 120 characters', () => {
    expect(sanitizeFileName(`${'a'.repeat(300)}.pdf`)).toHaveLength(120);
  });

  it('returns null when nothing usable is left', () => {
    expect(sanitizeFileName('   ')).toBeNull();
    expect(sanitizeFileName(undefined)).toBeNull();
    expect(sanitizeFileName('../')).toBeNull();
  });
});
