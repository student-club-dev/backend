// Standalone script: nothing here boots Nest, so `ConfigModule` never runs and `.env` would not be
// read. Load it explicitly — a real shell variable still wins, since dotenv does not overwrite.
import 'dotenv/config';
import { KlipyAdapter } from '../src/modules/gifs/infrastructure/klipy.adapter';

/**
 * Checks a live KLIPY response against the adapter's field mapping.
 *
 * The public docs describe the response envelope but not the inner `files` object, so the format
 * keys the adapter reads are inferred. A wrong guess fails closed — zero results rather than wrong
 * URLs — and this script is how you tell the two apart in ten seconds.
 *
 *   npm run gifs:probe [-- search term]     # reads KLIPY_API_KEY from .env
 *   KLIPY_API_KEY=... npm run gifs:probe    # or from the environment
 *
 * It prints the *shape* of the response and never the key.
 */

const KEY = process.env.KLIPY_API_KEY;
const BASE = (process.env.KLIPY_BASE_URL ?? 'https://api.klipy.com/api/v1').replace(/\/+$/, '');
const QUERY = process.argv[2] ?? 'cat';

/** Just enough of KLIPY's nesting to read a sample URL's host. */
interface KlipySizesLike {
  md?: { mp4?: { url?: string } };
  sm?: { gif?: { url?: string } };
}

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
        '  KLIPY_API_KEY=... npm run gifs:probe\n',
    );
    process.exitCode = 1;
    return;
  }

  const url = `${BASE}/${KEY}/gifs/search?q=${encodeURIComponent(QUERY)}&per_page=8&rating=pg-13`;
  const response = await fetch(url);
  if (!response.ok) {
    // Never echo the URL — the key is in the path.
    process.stderr.write(`KLIPY answered ${response.status}\n`);
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
    // KLIPY nests by size first, then by format — print both levels, since that is exactly the
    // pair of names `toGifItem` has to get right.
    for (const [sizeName, formats] of Object.entries(files ?? {})) {
      if (formats === null || typeof formats !== 'object') {
        continue;
      }
      for (const [formatName, file] of Object.entries(formats as Record<string, unknown>)) {
        const fields =
          file !== null && typeof file === 'object'
            ? Object.keys(file as Record<string, unknown>).join(', ')
            : typeof file;
        process.stdout.write(`  ${sizeName}.${formatName}: { ${fields} }\n`);
      }
    }
    // Hostnames only — the CDN URL carries no key, but there is no reason to print more than the
    // one thing the allowlist actually checks.
    const sample = (item.file as KlipySizesLike | undefined)?.md?.mp4?.url;
    const sampleThumb = (item.file as KlipySizesLike | undefined)?.sm?.gif?.url;
    for (const [label, value] of [
      ['clip host', sample],
      ['thumb host', sampleThumb],
    ] as const) {
      if (typeof value === 'string') {
        process.stdout.write(`${label}: ${new URL(value).hostname}\n`);
      }
    }
    process.stdout.write('\n');
  }

  // The real test: does the adapter actually map anything?
  const adapter = new KlipyAdapter({
    get: (key: string) => (key === 'KLIPY_API_KEY' ? KEY : BASE),
  } as never);
  const page = await adapter.search(QUERY, 8, null, 'uz_UZ');

  process.stdout.write('--- adapter output ---\n');
  process.stdout.write(`mapped ${page.items.length} of ${body.data?.data?.length ?? 0} results\n`);
  if (page.items.length === 0) {
    process.stdout.write(
      'MAPPING IS WRONG — the format keys in klipy.adapter.ts `toGifItem` do not match the ' +
        '`files keys` printed above. Fix them and re-run.\n',
    );
    process.exitCode = 1;
    return;
  }
  const sample = page.items[0];
  process.stdout.write(
    `sample: ${sample.width}x${sample.height}\n  url:   ${sample.url}\n  thumb: ${sample.thumbUrl}\n`,
  );
  process.stdout.write('\nMapping looks correct.\n');
}

void main().catch((error: unknown) => {
  process.stderr.write(`probe failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
