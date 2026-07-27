import { Injectable } from '@nestjs/common';
import { ConnectionStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ConnectionCheckRepository } from '../domain/connection-check.repository';

/**
 * Reads the connections/blocks tables to answer "are these two connected?" — the chat gate (C1).
 * Kept in chat/infrastructure so chat depends only on this shape, not the connections module.
 */
@Injectable()
export class ConnectionCheckPrismaRepository implements ConnectionCheckRepository {
  constructor(private readonly prisma: PrismaService) {}

  async areConnected(a: string, b: string): Promise<boolean> {
    const [accepted, blocked] = await this.prisma.$transaction([
      this.prisma.connection.count({
        where: {
          status: ConnectionStatus.ACCEPTED,
          OR: [
            { requesterId: a, addresseeId: b },
            { requesterId: b, addresseeId: a },
          ],
        },
      }),
      this.prisma.block.count({
        where: {
          OR: [
            { blockerId: a, blockedId: b },
            { blockerId: b, blockedId: a },
          ],
        },
      }),
    ]);
    return accepted > 0 && blocked === 0;
  }
}
