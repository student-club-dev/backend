import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { MessageSticker, StickerDirectoryRepository } from '../domain/sticker-directory.repository';

/** Prisma implementation of the chat-side sticker lookup. Prisma is used ONLY here. */
@Injectable()
export class StickerDirectoryPrismaRepository implements StickerDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(stickerId: string): Promise<MessageSticker | null> {
    const row = await this.prisma.sticker.findUnique({
      where: { id: stickerId },
      select: { id: true, packId: true, emoji: true, url: true, width: true, height: true },
    });
    if (row === null) {
      return null;
    }
    // `provider` and `thumbUrl` are the fields only a provider sticker fills. A catalogue sticker is
    // a 512×512 WebP that needs no separate preview, and carries no attribution.
    return { ...row, provider: null, thumbUrl: null };
  }
}
