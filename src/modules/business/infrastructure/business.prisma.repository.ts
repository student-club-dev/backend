import { Injectable } from '@nestjs/common';
import { BusinessStatus, ListingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  BusinessRepository,
  CreateBusinessData,
  UpdateBusinessData,
} from '../domain/business.repository';
import { Business } from '../domain/entities/business.entity';
import { BusinessStatus as DomainBusinessStatus } from '../domain/enums/business-status.enum';
import { BusinessMapper } from './business.mapper';

/** Prisma implementation of the business repository port. Prisma is used ONLY here. */
@Injectable()
export class BusinessPrismaRepository implements BusinessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateBusinessData): Promise<Business> {
    const row = await this.prisma.business.create({ data: BusinessMapper.toCreateData(data) });
    return BusinessMapper.toDomain(row);
  }

  async findById(id: string): Promise<Business | null> {
    const row = await this.prisma.business.findUnique({ where: { id } });
    return row === null ? null : BusinessMapper.toDomain(row);
  }

  async findManyByOwner(ownerId: string): Promise<Business[]> {
    const rows = await this.prisma.business.findMany({
      where: { ownerId, status: { not: BusinessStatus.ARCHIVED } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => BusinessMapper.toDomain(row));
  }

  async update(id: string, data: UpdateBusinessData): Promise<Business> {
    const row = await this.prisma.business.update({
      where: { id },
      data: BusinessMapper.toUpdateData(data),
    });
    return BusinessMapper.toDomain(row);
  }

  async setStatus(
    id: string,
    status: DomainBusinessStatus,
    rejectionReason: string | null,
  ): Promise<Business> {
    const row = await this.prisma.business.update({
      where: { id },
      data: BusinessMapper.toStatusData(status, rejectionReason),
    });
    return BusinessMapper.toDomain(row);
  }

  async countByOwner(ownerId: string): Promise<number> {
    return this.prisma.business.count({
      where: { ownerId, status: { not: BusinessStatus.ARCHIVED } },
    });
  }

  /** Archive the business and cascade all its listings to ARCHIVED in one transaction. */
  async archive(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.business.update({
        where: { id },
        data: { status: BusinessStatus.ARCHIVED },
      }),
      this.prisma.listing.updateMany({
        where: { businessId: id },
        data: { status: ListingStatus.ARCHIVED },
      }),
    ]);
  }
}
