import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Sticker, StickerCatalogue, StickerRepository } from '../domain/sticker.repository';

/** Prisma implementation of the sticker catalogue port. Prisma is used ONLY here. */
@Injectable()
export class StickerPrismaRepository implements StickerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async catalogue(): Promise<StickerCatalogue> {
    const rows = await this.prisma.stickerPack.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      include: { stickers: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    });
    return {
      packs: rows.map((pack) => ({
        id: pack.id,
        key: pack.key,
        name: pack.name,
        coverUrl: pack.coverUrl,
        isDefault: pack.isDefault,
        stickers: pack.stickers.map(toSticker),
      })),
      // The highest pack version: bumping any one pack invalidates the client's cached catalogue,
      // which is exactly right — it holds all of them together.
      version: rows.reduce((highest, pack) => Math.max(highest, pack.version), 0),
    };
  }

  async findById(id: string): Promise<Sticker | null> {
    const row = await this.prisma.sticker.findUnique({ where: { id } });
    return row === null ? null : toSticker(row);
  }
}

function toSticker(row: {
  id: string;
  packId: string;
  emoji: string;
  url: string;
  width: number;
  height: number;
}): Sticker {
  return {
    id: row.id,
    packId: row.packId,
    emoji: row.emoji,
    url: row.url,
    width: row.width,
    height: row.height,
  };
}
