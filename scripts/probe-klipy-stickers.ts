// Standalone script: nothing here boots Nest, so `ConfigModule` never runs and `.env` would not be
// read. Load it explicitly — a real shell variable still wins, since dotenv does not overwrite.
import 'dotenv/config';
import { KlipyStickerAdapter } from '../src/modules/stickers/infrastructure/klipy-sticker.adapter';

/**
 * Checks a live KLIPY **sticker** response against the adapter's field mapping.
 *
 * The twin of `probe-klipy.ts`, and it exists for a reason that script cannot cover: `/stickers/…`
 * is a different upstream path from `/gifs/…`, and the format keys `toStickerItem` reads were
 * inferred from the GIF response rather than from documentation. Two things can therefore be true
 * with no visible symptom:
 *
 *   - the account has GIF access but not sticker access;
 *   - the sticker response nests its renditions under different names.
 *
 * Both fail *closed* — an empty grid, not a broken image — which is exactly the failure mode nobody
 * notices until a user reports "search returns nothing". This script tells the two apart, and tells
 * them apart from "the key is missing", in ten seconds.
 *
 *   npm run stickers:probe [-- search term]     # reads KLIPY_API_KEY from .env
 *   KLIPY_API_KEY=... npm run stickers:probe    # or from the environment
 *
 * It prints the *shape* of the response and never the key.
 */

const KEY = process.env.KLIPY_API_KEY;
const BASE = (process.env.KLIPY_BASE_URL ?? 'https://api.klipy.com/api/v1').replace(/\/+$/, '');
const QUERY = process.argv[2] ?? 'cat';

/** Recursively describe a value's structure, without printing any content. */
function shapeOf(value: unknown, depth = 0): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return value.length === 0
      ? 'array(empty)'
      : `array[${value.length}] of ${shapeOf(value[0], depth + 1)}`;
  }
  if (typeof value === 'object') {
    if (depth > 3) return 'object{…}';
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${shapeOf(v, depth + 1)}`,
    );
    return `{ ${entries.join(', ')} }`;
  }
  return typeof value;
}

async function main(): Promise<void> {
  if (KEY === undefined || KEY.length === 0) {
    process.stderr.write(
      'KLIPY_API_KEY is not set.\n' +
        'Put it in .env (KLIPY_API_KEY=...) or pass it inline:\n' +
        '  KLIPY_API_KEY=... npm run stickers:probe\n',
    );
    process.exitCode = 1;
    return;
  }

  const url = `${BASE}/${KEY}/stickers/search?q=${encodeURIComponent(QUERY)}&per_page=8&rating=pg-13`;
  const response = await fetch(url);
  if (!response.ok) {
    // Never echo the URL — the key is in the path.
    process.stderr.write(`KLIPY answered ${response.status} on /stickers/search\n`);
    if (response.status === 404) {
      process.stderr.write(
        'A 404 here usually means the sticker API is not enabled on this account, not that the ' +
          'path is wrong. GIF search can keep working while this does not.\n',
      );
    }
    if (response.status === 429) {
      process.stderr.write(
        'Quota spent. A test key allows 100 calls an hour across GIF *and* sticker search.\n',
      );
    }
    process.exitCode = 1;
    return;
  }

  const body = (await response.json()) as { data?: { data?: unknown[] } };
  const first = body.data?.data?.[0];

  process.stdout.write('--- response shape (no content, no key) ---\n');
  process.stdout.write(`${shapeOf(body)}\n\n`);
  if (first !== undefined) {
    process.stdout.write('--- first item, media keys ---\n');
    const item = first as Record<string, unknown>;
    const files = (item.files ?? item.file) as Record<string, unknown> | undefined;
    process.stdout.write(`item keys: ${Object.keys(item).join(', ')}\n`);
    process.stdout.write(
      `files keys: ${files === undefined ? '(none)' : Object.keys(files).join(', ')}\n`,
    );
    // Size first, then format — exactly the pair of names `toStickerItem` has to get right. Watch
    // for `webp`: if only `mp4` appears here, every result will be dropped on purpose, because MP4
    // has no alpha channel and a transparent sticker would arrive as a white square.
    for (const [sizeName, formats] of Object.entries(files ?? {})) {
      if (formats === null || typeof formats !== 'object') {
        continue;
      }
      for (const [formatName, file] of Object.entries(formats as Record<string, unknown>)) {
        if (file === null || typeof file !== 'object') {
          process.stdout.write(`  ${sizeName}.${formatName}: ${typeof file}\n`);
          continue;
        }
        // Dimensions and bytes, not just field names: which size tier to prefer is a real decision
        // (a sticker renders at roughly 120 dp, so ~360 px on a 3× screen), and it cannot be made
        // without seeing what each tier actually costs.
        const meta = file as { width?: number; height?: number; size?: number };
        const dims =
          meta.width === undefined ? Object.keys(meta).join(', ') : `${meta.width}x${meta.height}`;
        const kb = meta.size === undefined ? '' : `, ${Math.round(meta.size / 1024)} KB`;
        process.stdout.write(`  ${sizeName}.${formatName}: ${dims}${kb}\n`);
      }
    }
    process.stdout.write('\n');
  }

  // The real test: does the adapter actually map anything?
  const adapter = new KlipyStickerAdapter({
    get: (key: string) => (key === 'KLIPY_API_KEY' ? KEY : BASE),
  } as never);
  const page = await adapter.search(QUERY, 8, null, 'uz_UZ');

  process.stdout.write('--- adapter output ---\n');
  process.stdout.write(`mapped ${page.items.length} of ${body.data?.data?.length ?? 0} results\n`);
  if (page.items.length === 0) {
    process.stdout.write(
      'MAPPING IS WRONG, or every result was alpha-less.\n' +
        'Compare the `files keys` above with `toStickerItem` in klipy-sticker.adapter.ts:\n' +
        '  - no `webp`/`gif` rendition at all  -> the catalogue is MP4-only; the drop is deliberate\n' +
        '  - different size/format names        -> fix the keys and re-run\n' +
        '  - a host outside *.klipy.com         -> update ALLOWED_HOSTS in sticker-source.ts\n',
    );
    process.exitCode = 1;
    return;
  }
  const sample = page.items[0];
  process.stdout.write(
    `sample: ${sample.width}x${sample.height}\n` +
      `  url:   ${sample.url}\n` +
      `  thumb: ${sample.thumbUrl}\n`,
  );
  // The whole point of the sticker path: alpha survives. MP4 here would be a bug in the adapter.
  if (/\.mp4(\?|$)/i.test(sample.url)) {
    process.stdout.write('\nWRONG: the mapped url is an MP4 — transparency is gone.\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('\nMapping looks correct (alpha-preserving format).\n');
}

void main().catch((error: unknown) => {
  process.stderr.write(`probe failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
