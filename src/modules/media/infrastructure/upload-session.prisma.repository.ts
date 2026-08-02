import { Injectable } from '@nestjs/common';
import type { UploadSession as PrismaUploadSession } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { NewUploadSession, UploadSession } from '../domain/entities/upload-session.entity';
import { MediaKind, MediaQuality } from '../domain/enums/media-kind.enum';
import { UploadSessionRepository } from '../domain/upload-session.repository';

/** Prisma implementation of the upload-session port. Prisma is used ONLY here. */
@Injectable()
export class UploadSessionPrismaRepository implements UploadSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(session: NewUploadSession): Promise<UploadSession> {
    const row = await this.prisma.uploadSession.create({
      data: { ...session, totalBytes: BigInt(session.totalBytes) },
    });
    return toDomain(row);
  }

  async findById(id: string): Promise<UploadSession | null> {
    const row = await this.prisma.uploadSession.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  async countOpen(ownerId: string, now: Date): Promise<number> {
    return this.prisma.uploadSession.count({
      where: { ownerId, expiresAt: { gte: now } },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.uploadSession.deleteMany({ where: { id } });
  }

  async findExpired(now: Date, limit: number): Promise<UploadSession[]> {
    const rows = await this.prisma.uploadSession.findMany({
      where: { expiresAt: { lt: now } },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }
}

function toDomain(row: PrismaUploadSession): UploadSession {
  return {
    id: row.id,
    ownerId: row.ownerId,
    conversationId: row.conversationId,
    kind: MediaKind[row.kind],
    quality: row.quality === null ? null : MediaQuality[row.quality],
    fileName: row.fileName,
    // Stored as BigInt because the point of this endpoint is files that do not fit an Int of bytes;
    // narrowed here because the rest of the app counts bytes as numbers, and Number holds every
    // integer below 9 PB exactly.
    totalBytes: Number(row.totalBytes),
    chunkSize: row.chunkSize,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}
