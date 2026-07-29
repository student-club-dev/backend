import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { MessageSticker, StickerDirectoryRepository } from '../domain/sticker-directory.repository';

/** Prisma implementation of the chat-side sticker lookup. Prisma is used ONLY here. */
@Injectable()
export class StickerDirectoryPrismaRepository implements StickerDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(stickerId: string): Promise<MessageSticker | null> {
    return this.prisma.sticker.findUnique({
      where: { id: stickerId },
      select: { id: true, packId: true, emoji: true, url: true, width: true, height: true },
    });
  }
}
