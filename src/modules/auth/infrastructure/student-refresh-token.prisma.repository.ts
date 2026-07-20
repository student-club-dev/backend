import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CreateRefreshTokenData, RefreshToken } from '../domain/entities/refresh-token.entity';
import { RefreshTokenRepository } from '../domain/refresh-token.repository';
import { toRefreshToken } from './refresh-token.mapper';

/** Prisma implementation of RefreshTokenRepository for `student_refresh_tokens`. */
@Injectable()
export class StudentRefreshTokenPrismaRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRefreshTokenData): Promise<void> {
    await this.prisma.studentRefreshToken.create({ data: toCreateInput(data) });
  }

  async findActiveByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.prisma.studentRefreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (row === null) {
      return null;
    }
    return toRefreshToken({
      id: row.id,
      accountId: row.studentId,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    });
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.prisma.studentRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async rotate(currentTokenId: string, next: CreateRefreshTokenData): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.studentRefreshToken.update({
        where: { id: currentTokenId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.studentRefreshToken.create({ data: toCreateInput(next) }),
    ]);
  }
}

function toCreateInput(
  data: CreateRefreshTokenData,
): Prisma.StudentRefreshTokenUncheckedCreateInput {
  return {
    studentId: data.accountId,
    tokenHash: data.tokenHash,
    expiresAt: data.expiresAt,
    deviceName: data.deviceName,
    platform: data.platform,
    ipAddress: data.ipAddress,
    lastUsedAt: data.lastUsedAt,
  };
}
