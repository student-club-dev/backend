import { Injectable } from '@nestjs/common';
import { BusinessStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { OwningBusinessRepository } from '../domain/owning-business.repository';

/** Prisma implementation of the owning-business lookup port. Prisma is used ONLY here. */
@Injectable()
export class OwningBusinessPrismaRepository implements OwningBusinessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOwnerId(businessId: string): Promise<string | null> {
    const row = await this.prisma.business.findFirst({
      where: { id: businessId, status: { not: BusinessStatus.ARCHIVED } },
      select: { ownerId: true },
    });
    return row === null ? null : row.ownerId;
  }
}
