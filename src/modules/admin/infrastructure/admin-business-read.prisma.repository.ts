import { Injectable } from '@nestjs/common';
import { BusinessStatus as PrismaBusinessStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  AdminBusinessListFilter,
  AdminBusinessPage,
  AdminBusinessReadRepository,
} from '../domain/admin-business-read.repository';
import { AdminBusiness } from '../domain/entities/admin-business.entity';
import { AdminBusinessSort } from '../domain/enums/admin-business-sort.enum';
import {
  ADMIN_BUSINESS_DETAIL_INCLUDE,
  ADMIN_BUSINESS_SUMMARY_SELECT,
  AdminBusinessMapper,
} from './admin-business.mapper';

const ORDER_BY: Record<AdminBusinessSort, Prisma.BusinessOrderByWithRelationInput[]> = {
  [AdminBusinessSort.NEWEST]: [{ createdAt: 'desc' }, { id: 'desc' }],
  [AdminBusinessSort.OLDEST]: [{ createdAt: 'asc' }, { id: 'asc' }],
  [AdminBusinessSort.NAME]: [{ name: 'asc' }, { id: 'asc' }],
};

/** Prisma read port over the whole `businesses` table for the admin panel. Prisma is used ONLY here. */
@Injectable()
export class AdminBusinessReadPrismaRepository implements AdminBusinessReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AdminBusinessListFilter): Promise<AdminBusinessPage> {
    const where = this.buildWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.business.findMany({
        where,
        select: ADMIN_BUSINESS_SUMMARY_SELECT,
        orderBy: ORDER_BY[filter.sort],
        skip: (filter.page - 1) * filter.size,
        take: filter.size,
      }),
      this.prisma.business.count({ where }),
    ]);
    return { items: rows.map(AdminBusinessMapper.toSummary), total };
  }

  async findById(id: string): Promise<AdminBusiness | null> {
    const row = await this.prisma.business.findUnique({
      where: { id },
      include: ADMIN_BUSINESS_DETAIL_INCLUDE,
    });
    return row === null ? null : AdminBusinessMapper.toDetail(row);
  }

  /** Every filter narrows (AND); `q` ORs across the searchable columns. */
  private buildWhere(filter: AdminBusinessListFilter): Prisma.BusinessWhereInput {
    const where: Prisma.BusinessWhereInput = {};
    if (filter.q !== null) {
      where.OR = [
        { name: { contains: filter.q, mode: 'insensitive' } },
        { legalName: { contains: filter.q, mode: 'insensitive' } },
        { inn: { contains: filter.q, mode: 'insensitive' } },
        { phone: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    if (filter.ownerId !== null) {
      where.ownerId = filter.ownerId;
    }
    if (filter.statuses.length > 0) {
      where.status = { in: filter.statuses.map((status) => PrismaBusinessStatus[status]) };
    }
    if (filter.type !== null) {
      where.type = filter.type;
    }
    if (filter.regionId !== null) {
      // A business "in" a region = it has at least one branch there.
      where.branches = { some: { regionId: filter.regionId } };
    }
    if (filter.isOnlineOnly !== null) {
      where.isOnlineOnly = filter.isOnlineOnly;
    }
    if (filter.createdFrom !== null || filter.createdTo !== null) {
      where.createdAt = {
        ...(filter.createdFrom === null ? {} : { gte: filter.createdFrom }),
        ...(filter.createdTo === null ? {} : { lte: filter.createdTo }),
      };
    }
    return where;
  }
}
