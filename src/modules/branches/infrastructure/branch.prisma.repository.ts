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

  /** Create the branch, then populate the PostGIS `geo_point` column in the same transaction. */
  async create(data: CreateBranchData): Promise<Branch> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({ data: BranchMapper.toCreateData(data) });
      await this.writeGeoPoint(tx, created.id, created.lng, created.lat);
      return created;
    });
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

  /** Update the branch, then refresh the PostGIS `geo_point` column in the same transaction. */
  async update(id: string, data: UpdateBranchData): Promise<Branch> {
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id },
        data: BranchMapper.toUpdateData(data),
      });
      await this.writeGeoPoint(tx, updated.id, updated.lng, updated.lat);
      return updated;
    });
    return BranchMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.branch.delete({ where: { id } });
  }

  /**
   * Populates the PostGIS `geo_point` geography column from lat/lng. Prisma cannot write the
   * Unsupported type, so it is set via raw SQL (ST_MakePoint takes X=lng, Y=lat).
   */
  private writeGeoPoint(
    tx: Prisma.TransactionClient,
    id: string,
    lng: number,
    lat: number,
  ): Promise<number> {
    return tx.$executeRaw`UPDATE branches SET geo_point = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) WHERE id = ${id}`;
  }
}
