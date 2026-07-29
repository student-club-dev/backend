import { isAllowedGifUrl } from './gif-source';

describe('isAllowedGifUrl', () => {
  it.each([
    'https://static.klipy.com/ii/abc/md.mp4',
    'https://cdn.klipy.com/abc/sm.gif',
    'https://media.tenor.com/abc/animation.mp4',
    'https://media1.tenor.com/abc/animation.mp4',
    'https://c.tenor.com/abc/tiny.gif',
    'https://media0.giphy.com/media/abc/giphy.mp4',
    'https://i.giphy.com/abc.gif',
  ])('allows %s', (url) => {
    expect(isAllowedGifUrl(url)).toBe(true);
  });

  it.each([
    'https://static.klipy.com.evil.example/x.mp4',
    'https://evil.example/static.klipy.com/x.mp4',
    'https://klipy.com.attacker.io/x.mp4',
    'https://evil.example.com/animation.mp4',
    'https://tenor.com.evil.example/animation.mp4',
    'https://evil.example/media.tenor.com/animation.mp4',
    'https://media.tenor.com.evil.example/x.mp4',
  ])('refuses %s — a lookalike host is the whole attack', (url) => {
    expect(isAllowedGifUrl(url)).toBe(false);
  });

  it('refuses plain http even on an allowed host', () => {
    expect(isAllowedGifUrl('http://media.tenor.com/abc/animation.mp4')).toBe(false);
  });

  it('refuses non-http schemes', () => {
    expect(isAllowedGifUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedGifUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedGifUrl('data:image/gif;base64,AAAA')).toBe(false);
  });

  it('refuses garbage', () => {
    expect(isAllowedGifUrl('not a url')).toBe(false);
    expect(isAllowedGifUrl('')).toBe(false);
  });

  it('is not fooled by credentials in the authority', () => {
    expect(isAllowedGifUrl('https://media.tenor.com@evil.example/x.mp4')).toBe(false);
  });
});
