import { Injectable } from '@nestjs/common';
import { BusinessOwnerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  AdminBusinessOwnerPage,
  AdminBusinessOwnerReadRepository,
  AdminOwnerListFilter,
} from '../domain/admin-business-owner-read.repository';
import {
  AdminBusinessOwner,
  AdminOwnerBusinessSummary,
} from '../domain/entities/admin-business-owner.entity';
import { AdminUserSort } from '../domain/enums/admin-user-sort.enum';
import {
  ADMIN_OWNER_BUSINESS_SELECT,
  ADMIN_OWNER_DETAIL_SELECT,
  ADMIN_OWNER_SUMMARY_SELECT,
  AdminUserMapper,
} from './admin-user.mapper';

const ORDER_BY: Record<AdminUserSort, Prisma.BusinessOwnerOrderByWithRelationInput[]> = {
  [AdminUserSort.NEWEST]: [{ createdAt: 'desc' }, { id: 'desc' }],
  [AdminUserSort.OLDEST]: [{ createdAt: 'asc' }, { id: 'asc' }],
};

/** Prisma read port over the whole `business_owners` table for the admin panel. Prisma ONLY here. */
@Injectable()
export class AdminBusinessOwnerReadPrismaRepository implements AdminBusinessOwnerReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AdminOwnerListFilter): Promise<AdminBusinessOwnerPage> {
    const where = this.buildWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.businessOwner.findMany({
        where,
        select: ADMIN_OWNER_SUMMARY_SELECT,
        orderBy: ORDER_BY[filter.sort],
        skip: (filter.page - 1) * filter.size,
        take: filter.size,
      }),
      this.prisma.businessOwner.count({ where }),
    ]);
    return { items: rows.map(AdminUserMapper.toOwnerSummary), total };
  }

  async findById(id: string): Promise<AdminBusinessOwner | null> {
    const row = await this.prisma.businessOwner.findUnique({
      where: { id },
      select: ADMIN_OWNER_DETAIL_SELECT,
    });
    return row === null ? null : AdminUserMapper.toOwner(row);
  }

  async exists(id: string): Promise<boolean> {
    return (await this.prisma.businessOwner.count({ where: { id } })) > 0;
  }

  async listBusinesses(ownerId: string): Promise<AdminOwnerBusinessSummary[]> {
    const rows = await this.prisma.business.findMany({
      where: { ownerId },
      select: ADMIN_OWNER_BUSINESS_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(AdminUserMapper.toOwnerBusiness);
  }

  /** Every filter narrows (AND); `q` ORs across the searchable columns. */
  private buildWhere(filter: AdminOwnerListFilter): Prisma.BusinessOwnerWhereInput {
    const where: Prisma.BusinessOwnerWhereInput = {};
    if (filter.q !== null) {
      where.OR = [
        { firstName: { contains: filter.q, mode: 'insensitive' } },
        { lastName: { contains: filter.q, mode: 'insensitive' } },
        { phoneNumber: { contains: filter.q, mode: 'insensitive' } },
        { email: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    if (filter.status !== null) {
      // AdminUserStatus and Prisma BusinessOwnerStatus share wire values — index the Prisma enum by ours.
      where.status = BusinessOwnerStatus[filter.status];
    }
    if (filter.phoneVerified !== null) {
      where.phoneVerified = filter.phoneVerified;
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
