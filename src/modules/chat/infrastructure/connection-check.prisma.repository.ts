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

  async connectedIds(studentId: string): Promise<string[]> {
    const [edges, blocks] = await this.prisma.$transaction([
      this.prisma.connection.findMany({
        where: {
          status: ConnectionStatus.ACCEPTED,
          OR: [{ requesterId: studentId }, { addresseeId: studentId }],
        },
        select: { requesterId: true, addresseeId: true },
      }),
      this.prisma.block.findMany({
        where: { OR: [{ blockerId: studentId }, { blockedId: studentId }] },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const blocked = new Set(
      blocks.map((row) => (row.blockerId === studentId ? row.blockedId : row.blockerId)),
    );
    const ids = new Set(
      edges.map((row) => (row.requesterId === studentId ? row.addresseeId : row.requesterId)),
    );
    return [...ids].filter((id) => !blocked.has(id));
  }
}
