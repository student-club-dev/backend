import { Injectable } from '@nestjs/common';
import { BusinessStatus as PrismaBusinessStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BusinessReadRepository, BusinessSummary } from '../domain/business-read.repository';
import { BusinessStatus } from '../domain/enums/business-status.enum';

/** Prisma implementation of the Business context read port. Prisma is used ONLY here. */
@Injectable()
export class BusinessReadPrismaRepository implements BusinessReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSummaryById(id: string): Promise<BusinessSummary | null> {
    const row = await this.prisma.business.findFirst({
      where: { id, status: { not: PrismaBusinessStatus.ARCHIVED } },
      select: { id: true, ownerId: true, type: true, status: true, isOnlineOnly: true },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      ownerId: row.ownerId,
      type: row.type,
      status: BusinessStatus[row.status],
      isOnlineOnly: row.isOnlineOnly,
    };
  }
}
