import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { BusinessTypeWrite, CatalogRepository, GeoScope } from '../domain/catalog.repository';
import { AttributeSpec } from '../domain/entities/attribute-spec.entity';
import { BusinessType } from '../domain/entities/business-type.entity';
import { CatalogGroup } from '../domain/entities/catalog-group.entity';
import { Category } from '../domain/entities/category.entity';
import { TypeAttributeSchema } from '../domain/entities/type-attribute-schema.entity';
import { TypeCountRow, typeCountQuery } from './catalog-count.sql';
import { CatalogMapper } from './catalog.mapper';

/** Prisma implementation of the catalog repository port. Prisma is used ONLY here. */
@Injectable()
export class CatalogPrismaRepository implements CatalogRepository {
  /** Counts change slowly; 5 minutes keeps the home screen off the aggregate query. */
  private static readonly COUNT_CACHE_TTL_SECONDS = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Cache key for the count aggregate. Coordinates are rounded to ~1 km (2 decimals — one degree
   * of latitude ≈ 111 km) so nearby students share one entry instead of each minting their own.
   */
  private static countCacheKey(geo: GeoScope | null): string {
    if (geo === null) {
      return 'catalog:counts:type:all';
    }
    return `catalog:counts:type:${geo.lat.toFixed(2)}:${geo.lng.toFixed(2)}:${geo.radiusMeters}`;
  }

  async findBusinessTypes(): Promise<BusinessType[]> {
    const rows = await this.prisma.businessTypeInfo.findMany({ orderBy: { type: 'asc' } });
    return rows.map((row) => CatalogMapper.toBusinessType(row));
  }

  async findGroups(): Promise<CatalogGroup[]> {
    const rows = await this.prisma.catalogGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { businessTypes: { select: { type: true }, orderBy: { type: 'asc' } } },
    });
    return rows.map((row) =>
      CatalogMapper.toCatalogGroup(
        row,
        row.businessTypes.map((businessType) => businessType.type),
      ),
    );
  }

  async findBusinessTypesByGroups(groupKeys: string[]): Promise<BusinessType[]> {
    if (groupKeys.length === 0) {
      return [];
    }
    const rows = await this.prisma.businessTypeInfo.findMany({
      where: { groupKey: { in: groupKeys } },
      orderBy: { type: 'asc' },
    });
    return rows.map((row) => CatalogMapper.toBusinessType(row));
  }

  async groupExists(key: string): Promise<boolean> {
    const row = await this.prisma.catalogGroup.findUnique({
      where: { key },
      select: { key: true },
    });
    return row !== null;
  }

  async countVisibleListingsByType(geo: GeoScope | null): Promise<Map<string, number>> {
    const key = CatalogPrismaRepository.countCacheKey(geo);
    const cached = await this.redis.get(key);
    if (cached !== null) {
      return new Map(JSON.parse(cached) as [string, number][]);
    }

    const rows = await this.prisma.$queryRaw<TypeCountRow[]>(typeCountQuery(geo));
    const counts = new Map(rows.map((row) => [row.type, row.count]));
    await this.redis.set(
      key,
      JSON.stringify([...counts]),
      CatalogPrismaRepository.COUNT_CACHE_TTL_SECONDS,
    );
    return counts;
  }

  async countCategoriesByType(): Promise<Map<string, number>> {
    const rows = await this.prisma.category.groupBy({
      by: ['businessType'],
      where: { gender: null },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.businessType, row._count._all]));
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

  async findAttributeSpecs(businessType: string, categoryKey: string): Promise<AttributeSpec[]> {
    const rows = await this.prisma.attributeSpec.findMany({
      where: { businessType, OR: [{ categoryKey: null }, { categoryKey }] },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) => CatalogMapper.toAttributeSpec(row));
  }

  async findTypeAttributeSchema(businessType: string): Promise<TypeAttributeSchema | null> {
    if (!(await this.typeExists(businessType))) {
      return null;
    }
    const rows = await this.prisma.attributeSpec.findMany({
      where: { businessType },
      orderBy: { sortOrder: 'asc' },
    });
    return CatalogMapper.toTypeAttributeSchema(businessType, rows);
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
