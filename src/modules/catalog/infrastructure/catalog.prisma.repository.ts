import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BusinessTypeWrite, CatalogRepository } from '../domain/catalog.repository';
import { BusinessType } from '../domain/entities/business-type.entity';
import { Category } from '../domain/entities/category.entity';
import { CatalogMapper } from './catalog.mapper';

/** Prisma implementation of the catalog repository port. Prisma is used ONLY here. */
@Injectable()
export class CatalogPrismaRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBusinessTypes(): Promise<BusinessType[]> {
    const rows = await this.prisma.businessTypeInfo.findMany({ orderBy: { type: 'asc' } });
    return rows.map((row) => CatalogMapper.toBusinessType(row));
  }

  async findCategoriesByType(type: string): Promise<Category[] | null> {
    const businessType = await this.prisma.businessTypeInfo.findUnique({
      where: { type },
      select: { type: true },
    });
    if (businessType === null) {
      return null;
    }

    const [categories, specs] = await Promise.all([
      this.prisma.category.findMany({
        where: { businessType: type },
        orderBy: [{ gender: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }],
      }),
      this.prisma.attributeSpec.findMany({
        where: { businessType: type },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    return categories.map((category) => CatalogMapper.toCategory(category, specs));
  }

  async typeExists(type: string): Promise<boolean> {
    const row = await this.prisma.businessTypeInfo.findUnique({
      where: { type },
      select: { type: true },
    });
    return row !== null;
  }

  async createType(type: string, data: BusinessTypeWrite): Promise<BusinessType> {
    const row = await this.prisma.businessTypeInfo.create({
      data: CatalogMapper.toBusinessTypeCreateData(type, data),
    });
    return CatalogMapper.toBusinessType(row);
  }

  async updateType(type: string, data: Partial<BusinessTypeWrite>): Promise<BusinessType> {
    const row = await this.prisma.businessTypeInfo.update({
      where: { type },
      data: CatalogMapper.toBusinessTypeUpdateData(data),
    });
    return CatalogMapper.toBusinessType(row);
  }

  async deleteType(type: string): Promise<void> {
    await this.prisma.businessTypeInfo.delete({ where: { type } });
  }

  async countBusinessesOfType(type: string): Promise<number> {
    return this.prisma.business.count({ where: { type } });
  }

  async countCategoriesOfType(type: string): Promise<number> {
    return this.prisma.category.count({ where: { businessType: type } });
  }
}
