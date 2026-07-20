import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  BranchRepository,
  CreateBranchData,
  UpdateBranchData,
} from '../domain/branches.repository';
import { Branch } from '../domain/entities/branch.entity';
import { BranchMapper } from './branch.mapper';

/** Prisma implementation of the branch repository port. Prisma is used ONLY here. */
@Injectable()
export class BranchPrismaRepository implements BranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `geo_point` is populated from lat/lng by the DB trigger `branches_set_geo_point`. */
  async create(data: CreateBranchData): Promise<Branch> {
    const row = await this.prisma.branch.create({ data: BranchMapper.toCreateData(data) });
    return BranchMapper.toDomain(row);
  }

  async findById(id: string): Promise<Branch | null> {
    const row = await this.prisma.branch.findUnique({ where: { id } });
    return row === null ? null : BranchMapper.toDomain(row);
  }

  async findManyByBusiness(businessId: string): Promise<Branch[]> {
    const rows = await this.prisma.branch.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => BranchMapper.toDomain(row));
  }

  /** `geo_point` is refreshed from lat/lng by the DB trigger `branches_set_geo_point`. */
  async update(id: string, data: UpdateBranchData): Promise<Branch> {
    const row = await this.prisma.branch.update({
      where: { id },
      data: BranchMapper.toUpdateData(data),
    });
    return BranchMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.branch.delete({ where: { id } });
  }

  async existsWithinRadius(
    businessId: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    excludeBranchId?: string,
  ): Promise<boolean> {
    const excludeClause =
      excludeBranchId === undefined ? Prisma.empty : Prisma.sql`AND id <> ${excludeBranchId}`;
    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1 FROM branches
        WHERE business_id = ${businessId}
        ${excludeClause}
        AND ST_DWithin(
          geo_point,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      ) AS "exists"
    `;
    return rows[0]?.exists === true;
  }
}
