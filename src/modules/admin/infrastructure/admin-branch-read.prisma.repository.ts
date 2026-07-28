import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  AdminBranchGeoFilter,
  AdminBranchListFilter,
  AdminBranchPage,
  AdminBranchReadRepository,
} from '../domain/admin-branch-read.repository';
import { AdminBranch } from '../domain/entities/admin-branch.entity';
import { AdminBranchSort } from '../domain/enums/admin-branch-sort.enum';
import {
  ADMIN_BRANCH_DETAIL_INCLUDE,
  ADMIN_BRANCH_SUMMARY_SELECT,
  AdminBranchMapper,
} from './admin-branch.mapper';

const ORDER_BY: Record<AdminBranchSort, Prisma.BranchOrderByWithRelationInput[]> = {
  [AdminBranchSort.NEWEST]: [{ createdAt: 'desc' }, { id: 'desc' }],
  [AdminBranchSort.NAME]: [{ name: 'asc' }, { id: 'asc' }],
};

/** Prisma read port over the whole `branches` table for the admin panel. Prisma is used ONLY here. */
@Injectable()
export class AdminBranchReadPrismaRepository implements AdminBranchReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: AdminBranchListFilter): Promise<AdminBranchPage> {
    const where = await this.buildWhere(filter);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        select: ADMIN_BRANCH_SUMMARY_SELECT,
        orderBy: ORDER_BY[filter.sort],
        skip: (filter.page - 1) * filter.size,
        take: filter.size,
      }),
      this.prisma.branch.count({ where }),
    ]);
    return { items: rows.map(AdminBranchMapper.toSummary), total };
  }

  async findById(id: string): Promise<AdminBranch | null> {
    const row = await this.prisma.branch.findUnique({
      where: { id },
      include: ADMIN_BRANCH_DETAIL_INCLUDE,
    });
    return row === null ? null : AdminBranchMapper.toDetail(row);
  }

  /**
   * Every filter narrows (AND); `q` ORs across name/address. The geo filter is the one part Prisma
   * cannot express — `geo_point` is an Unsupported PostGIS column — so it is resolved to a set of
   * matching branch ids via a raw PostGIS query (the same `ST_DWithin`/`&&` approach the discounts
   * feed uses) and folded back in as `id IN (...)`. This keeps the typed Prisma query (with its joins
   * for the display names) intact while the proximity test runs on the GiST index.
   */
  private async buildWhere(filter: AdminBranchListFilter): Promise<Prisma.BranchWhereInput> {
    const where: Prisma.BranchWhereInput = {};
    if (filter.q !== null) {
      where.OR = [
        { name: { contains: filter.q, mode: 'insensitive' } },
        { address: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    if (filter.businessId !== null) {
      where.businessId = filter.businessId;
    }
    if (filter.ownerId !== null) {
      where.business = { ownerId: filter.ownerId };
    }
    if (filter.regionId !== null) {
      where.regionId = filter.regionId;
    }
    if (filter.districtId !== null) {
      where.districtId = filter.districtId;
    }
    if (filter.tradeCenterId !== null) {
      where.tradeCenterId = filter.tradeCenterId;
    }
    if (filter.isActive !== null) {
      where.isActive = filter.isActive;
    }
    if (filter.hasDelivery !== null) {
      // `delivery_zone` is JSONB; match on its `enabled` flag.
      where.deliveryZone = { path: ['enabled'], equals: filter.hasDelivery };
    }
    if (filter.geo !== null) {
      where.id = { in: await this.geoBranchIds(filter.geo) };
    }
    return where;
  }

  /** Branch ids whose `geo_point` satisfies the bbox or radius constraint (PostGIS, geography/4326). */
  private async geoBranchIds(geo: AdminBranchGeoFilter): Promise<string[]> {
    const predicate =
      geo.mode === 'RADIUS'
        ? Prisma.sql`ST_DWithin(
            geo_point,
            ST_SetSRID(ST_MakePoint(${geo.scope.lng}, ${geo.scope.lat}), 4326)::geography,
            ${geo.scope.radiusMeters})`
        : Prisma.sql`geo_point && ST_MakeEnvelope(
            ${geo.box.minLng}, ${geo.box.minLat}, ${geo.box.maxLng}, ${geo.box.maxLat}, 4326)::geography`;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM branches WHERE geo_point IS NOT NULL AND ${predicate}
    `;
    return rows.map((row) => row.id);
  }
}
