import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  BranchRepository,
  CreateBranchData,
  UpdateBranchData,
} from '../domain/branches.repository';
import { Branch, BranchTradeCenterFieldInput } from '../domain/entities/branch.entity';
import { BRANCH_INCLUDE, BranchMapper } from './branch.mapper';

/** Prisma implementation of the branch repository port. Prisma is used ONLY here. */
@Injectable()
export class BranchPrismaRepository implements BranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the branch and its trade-center field values in one transaction. `geo_point` is
   * populated from lat/lng by the DB trigger `branches_set_geo_point`.
   */
  async create(data: CreateBranchData): Promise<Branch> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({ data: BranchMapper.toCreateData(data) });
      await this.writeFieldValues(tx, created.id, data.tradeCenterId, data.tradeCenterFields);
      return tx.branch.findUniqueOrThrow({ where: { id: created.id }, include: BRANCH_INCLUDE });
    });
    return BranchMapper.toDomain(row);
  }

  async findById(id: string): Promise<Branch | null> {
    const row = await this.prisma.branch.findUnique({ where: { id }, include: BRANCH_INCLUDE });
    return row === null ? null : BranchMapper.toDomain(row);
  }

  async findManyByBusiness(businessId: string): Promise<Branch[]> {
    const rows = await this.prisma.branch.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: BRANCH_INCLUDE,
    });
    return rows.map((row) => BranchMapper.toDomain(row));
  }

  /**
   * Full-replace update of the branch and its trade-center field values in one transaction.
   * Existing field values are deleted and the submitted set re-created; clearing `tradeCenterId`
   * (null) leaves no values behind. `geo_point` is refreshed by the DB trigger.
   */
  async update(id: string, data: UpdateBranchData): Promise<Branch> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.branch.update({ where: { id }, data: BranchMapper.toUpdateData(data) });
      await tx.branchTradeCenterFieldValue.deleteMany({ where: { branchId: id } });
      await this.writeFieldValues(tx, id, data.tradeCenterId, data.tradeCenterFields);
      return tx.branch.findUniqueOrThrow({ where: { id }, include: BRANCH_INCLUDE });
    });
    return BranchMapper.toDomain(row);
  }

  /** Inserts the submitted trade-center field values (none when the branch has no center). */
  private async writeFieldValues(
    tx: Prisma.TransactionClient,
    branchId: string,
    tradeCenterId: string | null,
    fields: BranchTradeCenterFieldInput[],
  ): Promise<void> {
    if (tradeCenterId === null || fields.length === 0) {
      return;
    }
    await tx.branchTradeCenterFieldValue.createMany({
      data: fields.map((field) => ({ branchId, fieldId: field.fieldId, value: field.value })),
    });
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
