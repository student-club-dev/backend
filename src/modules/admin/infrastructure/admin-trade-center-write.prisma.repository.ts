import { Injectable } from '@nestjs/common';
import {
  TradeCenterFieldType as PrismaTradeCenterFieldType,
  TradeCenterStatus as PrismaTradeCenterStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TradeCenterField } from '../../trade-centers/domain/entities/trade-center.entity';
import { TradeCenterMapper } from '../../trade-centers/infrastructure/trade-center.mapper';
import {
  AdminTradeCenterWriteRepository,
  TradeCenterFieldWrite,
  TradeCenterWrite,
} from '../domain/admin-trade-center-write.repository';
import { AdminTradeCenterDetail } from '../domain/entities/admin-trade-center.entity';
import { AdminTradeCenterMapper } from './admin-trade-center.mapper';

/** Prisma write + admin-read port over the trade-center tables. Prisma is used ONLY here. */
@Injectable()
export class AdminTradeCenterWritePrismaRepository implements AdminTradeCenterWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  // -- centers --------------------------------------------------------------
  async findAll(): Promise<AdminTradeCenterDetail[]> {
    const rows = await this.prisma.tradeCenter.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    return rows.map((row) => AdminTradeCenterMapper.toDomainWithFields(row));
  }

  async findByIdWithFields(id: string): Promise<AdminTradeCenterDetail | null> {
    const row = await this.prisma.tradeCenter.findUnique({
      where: { id },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    return row === null ? null : AdminTradeCenterMapper.toDomainWithFields(row);
  }

  async findIdBySlug(slug: string): Promise<string | null> {
    const row = await this.prisma.tradeCenter.findUnique({ where: { slug }, select: { id: true } });
    return row === null ? null : row.id;
  }

  async create(data: TradeCenterWrite): Promise<AdminTradeCenterDetail> {
    const row = await this.prisma.tradeCenter.create({
      data: {
        name: data.name,
        slug: data.slug,
        status: PrismaTradeCenterStatus[data.status],
        sortOrder: data.sortOrder,
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    return AdminTradeCenterMapper.toDomainWithFields(row);
  }

  async update(id: string, data: Partial<TradeCenterWrite>): Promise<AdminTradeCenterDetail> {
    const row = await this.prisma.tradeCenter.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        status: data.status === undefined ? undefined : PrismaTradeCenterStatus[data.status],
        sortOrder: data.sortOrder,
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    return AdminTradeCenterMapper.toDomainWithFields(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.tradeCenter.delete({ where: { id } });
  }

  async countBranches(id: string): Promise<number> {
    return this.prisma.branch.count({ where: { tradeCenterId: id } });
  }

  // -- fields ---------------------------------------------------------------
  async findField(centerId: string, fieldId: string): Promise<TradeCenterField | null> {
    const row = await this.prisma.tradeCenterField.findFirst({
      where: { id: fieldId, tradeCenterId: centerId },
    });
    return row === null ? null : TradeCenterMapper.toField(row);
  }

  async createField(centerId: string, data: TradeCenterFieldWrite): Promise<TradeCenterField> {
    const row = await this.prisma.tradeCenterField.create({
      data: {
        tradeCenterId: centerId,
        label: data.label,
        type: PrismaTradeCenterFieldType[data.type],
        required: data.required,
        sortOrder: data.sortOrder,
      },
    });
    return TradeCenterMapper.toField(row);
  }

  async updateField(
    fieldId: string,
    data: Partial<TradeCenterFieldWrite>,
  ): Promise<TradeCenterField> {
    const row = await this.prisma.tradeCenterField.update({
      where: { id: fieldId },
      data: {
        label: data.label,
        type: data.type === undefined ? undefined : PrismaTradeCenterFieldType[data.type],
        required: data.required,
        sortOrder: data.sortOrder,
      },
    });
    return TradeCenterMapper.toField(row);
  }

  async deleteField(fieldId: string): Promise<void> {
    await this.prisma.tradeCenterField.delete({ where: { id: fieldId } });
  }

  async countFieldValues(fieldId: string): Promise<number> {
    return this.prisma.branchTradeCenterFieldValue.count({ where: { fieldId } });
  }
}
