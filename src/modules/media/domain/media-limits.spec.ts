import { MediaKind } from './enums/media-kind.enum';
import {
  BLOCKED_EXTENSIONS,
  hasBlockedExtension,
  MAX_UPLOAD_BYTES,
  MEDIA_LIMITS,
  sanitizeFileName,
} from './media-limits';

describe('media limits', () => {
  it('caps the multipart interceptor at the largest kind, not at an arbitrary number', () => {
    expect(MAX_UPLOAD_BYTES).toBe(MEDIA_LIMITS[MediaKind.VIDEO].maxBytes);
  });

  it('gives every kind an explicit MIME allowlist', () => {
    for (const kind of Object.values(MediaKind)) {
      expect(MEDIA_LIMITS[kind].mimeTypes.length).toBeGreaterThan(0);
    }
  });

  it('bounds the duration of time-based media only', () => {
    expect(MEDIA_LIMITS[MediaKind.VOICE].maxDurationMs).toBe(5 * 60_000);
    expect(MEDIA_LIMITS[MediaKind.VIDEO].maxDurationMs).toBe(3 * 60_000);
    expect(MEDIA_LIMITS[MediaKind.GIF].maxDurationMs).toBe(30_000);
    expect(MEDIA_LIMITS[MediaKind.IMAGE].maxDurationMs).toBeNull();
    expect(MEDIA_LIMITS[MediaKind.FILE].maxDurationMs).toBeNull();
  });

  it('never accepts an executable MIME type under any kind', () => {
    const everyMime = Object.values(MEDIA_LIMITS).flatMap((limits) => [...limits.mimeTypes]);
    for (const mime of everyMime) {
      expect(mime).not.toMatch(/octet-stream|x-msdownload|x-executable|vnd\.android/);
    }
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

  it('caps the length at 120 characters', () => {
    expect(sanitizeFileName(`${'a'.repeat(300)}.pdf`)).toHaveLength(120);
  });

  it('returns null when nothing usable is left', () => {
    expect(sanitizeFileName('   ')).toBeNull();
    expect(sanitizeFileName(undefined)).toBeNull();
    expect(sanitizeFileName('../')).toBeNull();
  });
});

describe('hasBlockedExtension', () => {
  it.each([...BLOCKED_EXTENSIONS])('rejects %s', (extension) => {
    expect(hasBlockedExtension(`payload${extension}`)).toBe(true);
  });

  it('is case-insensitive — .APK is still an APK', () => {
    expect(hasBlockedExtension('Payload.APK')).toBe(true);
  });

  it('allows ordinary documents', () => {
    expect(hasBlockedExtension('report.pdf')).toBe(false);
    expect(hasBlockedExtension('data.csv')).toBe(false);
  });

  it('is a no-op when there is no filename', () => {
    expect(hasBlockedExtension(null)).toBe(false);
  });
});
