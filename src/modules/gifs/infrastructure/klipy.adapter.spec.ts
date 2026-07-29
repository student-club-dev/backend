import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { MediaProvider } from '../../media/domain/enums/media-kind.enum';
import { KlipyAdapter } from './klipy.adapter';

function makeAdapter(apiKey: string | undefined): KlipyAdapter {
  const config = {
    get: (key: string) => (key === 'KLIPY_API_KEY' ? apiKey : 'https://api.klipy.com/api/v1'),
  } as unknown as ConfigService<never, true>;
  return new KlipyAdapter(config);
}

/** One item shaped the way KLIPY really returns it: size first, then format. */
function klipyItem(id: number, host = 'static.klipy.com'): unknown {
  const file = (name: string, w: number, h: number) => ({
    url: `https://${host}/ii/abc/${name}`,
    width: w,
    height: h,
    size: 1000,
  });
  return {
    id,
    slug: `slug-${id}`,
    title: 'a cat',
    blur_preview: 'data:image/png;base64,AAA',
    file: {
      hd: { mp4: file('hd.mp4', 640, 480), gif: file('hd.gif', 640, 480) },
      md: { mp4: file('md.mp4', 220, 230), gif: file('md.gif', 220, 230) },
      sm: { mp4: file('sm.mp4', 120, 120), gif: file('sm.gif', 120, 120) },
      xs: { mp4: file('xs.mp4', 60, 60), gif: file('xs.gif', 60, 60) },
    },
  };
}

function respond(items: unknown[], hasNext = false): unknown {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      result: true,
      data: { data: items, current_page: 1, per_page: 8, has_next: hasNext },
    }),
  };
}

describe('KlipyAdapter', () => {
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
      code: ERROR_CODE.GIF_PROVIDER_ERROR,
      status: 503,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('picks the md mp4 and a small still, not the largest of each', async () => {
    global.fetch = jest.fn().mockResolvedValue(respond([klipyItem(1)]));

    const page = await makeAdapter('key').search('cat', 8, null, 'uz_UZ');

    expect(page.provider).toBe(MediaProvider.KLIPY);
    // `md` for the clip: these autoplay in a grid on mobile data, where `hd` buys nothing.
    expect(page.items[0].url).toContain('md.mp4');
    expect(page.items[0].thumbUrl).toContain('sm.gif');
    expect(page.items[0]).toMatchObject({ id: '1', width: 220, height: 230, durationMs: null });
  });

  it('drops a result served from a host outside the allowlist', async () => {
    // Applied to the provider response too — a changed upstream must not inject a foreign host.
    global.fetch = jest.fn().mockResolvedValue(respond([klipyItem(2, 'evil.example')]));
    await expect(makeAdapter('key').search('cat', 8, null, 'uz_UZ')).resolves.toMatchObject({
      items: [],
    });
  });

  it('maps quota exhaustion to 429, distinct from an outage', async () => {
    // A test key allows 100 calls/hour, so this is the expected outcome during development.
    // Reporting it as 502 would send whoever is debugging looking for a network fault.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(makeAdapter('key').search('cat', 8, null, 'uz_UZ')).rejects.toMatchObject({
      code: ERROR_CODE.GIF_PROVIDER_RATE_LIMITED,
      status: 429,
    });
  });

  it('maps any other provider failure to 502', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(makeAdapter('key').search('cat', 8, null, 'uz_UZ')).rejects.toMatchObject({
      code: ERROR_CODE.GIF_PROVIDER_ERROR,
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
