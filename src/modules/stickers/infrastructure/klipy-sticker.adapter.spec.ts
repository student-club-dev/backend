import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { MediaProvider } from '../../media/domain/enums/media-kind.enum';
import { KlipyStickerAdapter } from './klipy-sticker.adapter';

function makeAdapter(apiKey: string | undefined): KlipyStickerAdapter {
  const config = {
    get: (key: string) => (key === 'KLIPY_API_KEY' ? apiKey : 'https://api.klipy.com/api/v1'),
  } as unknown as ConfigService<never, true>;
  return new KlipyStickerAdapter(config);
}

/** One item shaped the way KLIPY really returns it: size first, then format. */
function klipyItem(id: number, host = 'static.klipy.com', formats = ['webp', 'gif', 'mp4']) {
  const file = (name: string, w: number, h: number) => ({
    url: `https://${host}/ii/abc/${name}`,
    width: w,
    height: h,
  });
  const bySize = (size: string, w: number, h: number) =>
    Object.fromEntries(formats.map((f) => [f, file(`${size}.${f}`, w, h)]));
  return {
    id,
    slug: `slug-${id}`,
    title: 'a cat',
    file: {
      hd: bySize('hd', 640, 640),
      md: bySize('md', 512, 512),
      sm: bySize('sm', 200, 200),
      xs: bySize('xs', 100, 100),
    },
  };
}

function respond(items: unknown[], hasNext = false): unknown {
  return {
    ok: true,
    status: 200,
    json: async () => ({ result: true, data: { data: items, has_next: hasNext } }),
  };
}

describe('KlipyStickerAdapter', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('reports whether it can serve at all', () => {
    expect(makeAdapter(undefined).isConfigured()).toBe(false);
    expect(makeAdapter('key').isConfigured()).toBe(true);
  });

  it('answers 503 without calling out when no key is configured', async () => {
    global.fetch = jest.fn();
    await expect(makeAdapter(undefined).search('cat', 8, null, 'uz_UZ')).rejects.toMatchObject({
      code: ERROR_CODE.STICKER_PROVIDER_ERROR,
      status: 503,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('asks the sticker endpoint, not the GIF one', async () => {
    const fetchMock = jest.fn().mockResolvedValue(respond([klipyItem(1)]));
    global.fetch = fetchMock;

    await makeAdapter('key').search('cat', 8, null, 'uz_UZ');

    const requested = (fetchMock.mock.calls[0][0] as URL).pathname;
    expect(requested).toContain('/stickers/search');
  });

  it('falls back to trending when the query is empty', async () => {
    const fetchMock = jest.fn().mockResolvedValue(respond([klipyItem(1)]));
    global.fetch = fetchMock;

    await makeAdapter('key').search('', 8, null, 'uz_UZ');

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toContain('/stickers/trending');
    expect(url.searchParams.has('q')).toBe(false);
  });

  it('returns WebP, never the MP4 rendition', async () => {
    global.fetch = jest.fn().mockResolvedValue(respond([klipyItem(1)]));

    const page = await makeAdapter('key').search('cat', 8, null, 'uz_UZ');

    expect(page.provider).toBe(MediaProvider.KLIPY);
    // MP4 has no alpha channel: it would render as a white square in the bubble.
    expect(page.items[0].url).not.toContain('.mp4');
    expect(page.items[0].url).toContain('md.webp');
    expect(page.items[0].thumbUrl).toContain('xs.webp');
    expect(page.items[0]).toMatchObject({ id: '1', width: 512, height: 512, isAnimated: true });
  });

  it('takes an alpha-preserving GIF when there is no WebP', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(respond([klipyItem(1, 'static.klipy.com', ['gif'])]));

    const page = await makeAdapter('key').search('cat', 8, null, 'uz_UZ');

    expect(page.items[0].url).toContain('md.gif');
  });

  it('drops an item that only has MP4 rather than shipping a white square', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(respond([klipyItem(1, 'static.klipy.com', ['mp4'])]));

    await expect(makeAdapter('key').search('cat', 8, null, 'uz_UZ')).resolves.toMatchObject({
      items: [],
    });
  });

  it('drops a result served from a host outside the allowlist', async () => {
    // Applied to the provider response too — a changed upstream must not inject a foreign host.
    global.fetch = jest.fn().mockResolvedValue(respond([klipyItem(2, 'evil.example')]));
    await expect(makeAdapter('key').search('cat', 8, null, 'uz_UZ')).resolves.toMatchObject({
      items: [],
    });
  });

  it('maps quota exhaustion to 429, distinct from an outage', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(makeAdapter('key').search('cat', 8, null, 'uz_UZ')).rejects.toMatchObject({
      code: ERROR_CODE.STICKER_PROVIDER_RATE_LIMITED,
      status: 429,
    });
  });

  it('maps any other provider failure to 502', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(makeAdapter('key').search('cat', 8, null, 'uz_UZ')).rejects.toMatchObject({
      code: ERROR_CODE.STICKER_PROVIDER_ERROR,
      status: 502,
    });
  });

  it('never leaks the API key, which rides in the request path', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(
      makeAdapter('SECRET-KEY-123').search('cat', 8, null, 'uz_UZ'),
    ).rejects.not.toMatchObject({ message: expect.stringContaining('SECRET-KEY-123') });
  });

  it('turns the page number into an opaque cursor, and stops at the end', async () => {
    global.fetch = jest.fn().mockResolvedValue(respond([klipyItem(1)], true));
    await expect(makeAdapter('key').search('cat', 8, null, 'uz_UZ')).resolves.toMatchObject({
      next: '2',
    });

    global.fetch = jest.fn().mockResolvedValue(respond([klipyItem(1)], false));
    await expect(makeAdapter('key').search('cat', 8, '3', 'uz_UZ')).resolves.toMatchObject({
      next: null,
    });
  });

  it('has nothing to register for a share, and says so quietly', async () => {
    global.fetch = jest.fn();
    await expect(makeAdapter('key').registerShare()).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
