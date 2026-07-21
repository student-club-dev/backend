import { Injectable } from '@nestjs/common';
import { TradeCenterStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TradeCenter, TradeCenterWithFields } from '../domain/entities/trade-center.entity';
import { TradeCenterRepository } from '../domain/trade-center.repository';
import { TradeCenterMapper } from './trade-center.mapper';

/** Prisma implementation of the trade-center repository port. Prisma is used ONLY here. */
@Injectable()
export class TradeCenterPrismaRepository implements TradeCenterRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(): Promise<TradeCenter[]> {
    const rows = await this.prisma.tradeCenter.findMany({
      where: { status: TradeCenterStatus.ACTIVE },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => TradeCenterMapper.toDomain(row));
  }

  async findActiveByIdWithFields(id: string): Promise<TradeCenterWithFields | null> {
    const row = await this.prisma.tradeCenter.findFirst({
      where: { id, status: TradeCenterStatus.ACTIVE },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    return row === null ? null : TradeCenterMapper.toDomainWithFields(row);
  }
}
