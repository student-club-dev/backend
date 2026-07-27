import { Injectable } from '@nestjs/common';
import { ConnectionStatus as PrismaConnectionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ConnectionPage, ConnectionsRepository } from '../domain/connections.repository';
import { Connection } from '../domain/entities/connection.entity';
import { ConnectionStatus } from '../domain/enums/connection-status.enum';
import { ConnectionMapper } from './connection.mapper';

/** Prisma implementation of the connections + blocks port. Prisma is used ONLY here. */
@Injectable()
export class ConnectionPrismaRepository implements ConnectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private static pair(a: string, b: string): Prisma.ConnectionWhereInput {
    return {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    };
  }

  async findEdge(a: string, b: string): Promise<Connection | null> {
    const row = await this.prisma.connection.findFirst({
      where: ConnectionPrismaRepository.pair(a, b),
    });
    return row === null ? null : ConnectionMapper.toDomain(row);
  }

  async findById(id: string): Promise<Connection | null> {
    const row = await this.prisma.connection.findUnique({ where: { id } });
    return row === null ? null : ConnectionMapper.toDomain(row);
  }

  async create(requesterId: string, addresseeId: string): Promise<Connection> {
    const row = await this.prisma.connection.create({ data: { requesterId, addresseeId } });
    return ConnectionMapper.toDomain(row);
  }

  async setStatus(id: string, status: ConnectionStatus): Promise<Connection> {
    const row = await this.prisma.connection.update({
      where: { id },
      data: { status: PrismaConnectionStatus[status], respondedAt: new Date() },
    });
    return ConnectionMapper.toDomain(row);
  }

  async deleteEdge(a: string, b: string): Promise<void> {
    await this.prisma.connection.deleteMany({ where: ConnectionPrismaRepository.pair(a, b) });
  }

  async listAccepted(studentId: string, page: number, size: number): Promise<ConnectionPage> {
    const where: Prisma.ConnectionWhereInput = {
      status: PrismaConnectionStatus.ACCEPTED,
      OR: [{ requesterId: studentId }, { addresseeId: studentId }],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.connection.findMany({
        where,
        orderBy: { respondedAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.connection.count({ where }),
    ]);
    return { items: rows.map(ConnectionMapper.toDomain), total };
  }

  async listPending(
    studentId: string,
    direction: 'incoming' | 'outgoing',
    page: number,
    size: number,
  ): Promise<ConnectionPage> {
    const where: Prisma.ConnectionWhereInput = {
      status: PrismaConnectionStatus.PENDING,
      ...(direction === 'incoming' ? { addresseeId: studentId } : { requesterId: studentId }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.connection.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.connection.count({ where }),
    ]);
    return { items: rows.map(ConnectionMapper.toDomain), total };
  }

  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const count = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return count > 0;
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      }),
      this.prisma.connection.deleteMany({
        where: ConnectionPrismaRepository.pair(blockerId, blockedId),
      }),
    ]);
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
  }

  async blockedIds(viewerId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
    }
    return [...ids];
  }
}
