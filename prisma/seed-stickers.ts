import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Seeds the sticker catalogue from a manifest.
 *
 * The images themselves are a content task, not a code one — see `docs/handoff/PENDING_ACTIONS.md`.
 * Point `url` at wherever they are hosted; this script only writes the rows.
 *
 *   npx ts-node prisma/seed-stickers.ts [path/to/manifest.json]
 *
 * Re-runnable: packs are matched by their stable `key`, and a pack's stickers are replaced wholesale
 * so removing one from the manifest removes it here too. Any change bumps `version`, which is what
 * tells cached clients to refetch.
 */

interface StickerSeed {
  emoji: string;
  url: string;
  width?: number;
  height?: number;
}

interface PackSeed {
  key: string;
  name: string;
  coverUrl: string;
  isDefault?: boolean;
  sortOrder?: number;
  stickers: StickerSeed[];
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const manifestPath = resolve(
    process.argv[2] ?? resolve(__dirname, 'seed-data', 'stickers.json'),
  );
  const packs = JSON.parse(await readFile(manifestPath, 'utf8')) as PackSeed[];

  for (const [index, pack] of packs.entries()) {
    const existing = await prisma.stickerPack.findUnique({ where: { key: pack.key } });
    const row = await prisma.stickerPack.upsert({
      where: { key: pack.key },
      create: {
        key: pack.key,
        name: pack.name,
        coverUrl: pack.coverUrl,
        isDefault: pack.isDefault ?? false,
        sortOrder: pack.sortOrder ?? index,
      },
      update: {
        name: pack.name,
        coverUrl: pack.coverUrl,
        isDefault: pack.isDefault ?? false,
        sortOrder: pack.sortOrder ?? index,
        // Bumping here is the whole cache-invalidation story: `GET /v1/stickers/packs` returns the
        // highest version as its ETag.
        version: (existing?.version ?? 0) + 1,
      },
    });

    await prisma.sticker.deleteMany({ where: { packId: row.id } });
    await prisma.sticker.createMany({
      data: pack.stickers.map((sticker, order) => ({
        packId: row.id,
        emoji: sticker.emoji,
        url: sticker.url,
        width: sticker.width ?? 512,
        height: sticker.height ?? 512,
        sortOrder: order,
      })),
    });

    process.stdout.write(`${pack.key}: ${pack.stickers.length} stickers (v${row.version})\n`);
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`sticker seed failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
