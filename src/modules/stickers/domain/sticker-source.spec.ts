import { isAllowedStickerUrl } from './sticker-source';

describe('isAllowedStickerUrl', () => {
  it.each(['https://static.klipy.com/ii/abc/md.webp', 'https://cdn.klipy.com/abc/sm.gif'])(
    'allows %s',
    (url) => {
      expect(isAllowedStickerUrl(url)).toBe(true);
    },
  );

  it.each([
    'https://static.klipy.com.evil.example/x.webp',
    'https://evil.example/static.klipy.com/x.webp',
    'https://klipy.com.attacker.io/x.webp',
    'https://evil.example.com/sticker.webp',
  ])('refuses %s — a lookalike host is the whole attack', (url) => {
    expect(isAllowedStickerUrl(url)).toBe(false);
  });

  it('refuses plain http even on an allowed host', () => {
    expect(isAllowedStickerUrl('http://static.klipy.com/abc/md.webp')).toBe(false);
  });

  it('refuses non-http schemes', () => {
    expect(isAllowedStickerUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedStickerUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedStickerUrl('data:image/webp;base64,AAAA')).toBe(false);
  });

  it('refuses garbage', () => {
    expect(isAllowedStickerUrl('not a url')).toBe(false);
    expect(isAllowedStickerUrl('')).toBe(false);
  });

  it('is not fooled by credentials in the authority', () => {
    expect(isAllowedStickerUrl('https://static.klipy.com@evil.example/x.webp')).toBe(false);
  });

  it('refuses the GIF-era CDNs — no sticker row predates KLIPY, so nothing needs them', () => {
    expect(isAllowedStickerUrl('https://media.tenor.com/abc/x.gif')).toBe(false);
    expect(isAllowedStickerUrl('https://i.giphy.com/abc.gif')).toBe(false);
  });
});
