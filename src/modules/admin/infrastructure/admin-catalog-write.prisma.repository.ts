import { Injectable } from '@nestjs/common';
import { Gender as PrismaGender } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CatalogGroup } from '../../catalog/domain/entities/catalog-group.entity';
import { Gender } from '../../catalog/domain/enums/gender.enum';
import { CatalogMapper } from '../../catalog/infrastructure/catalog.mapper';
import {
  AdminCatalogWriteRepository,
  AttributeSpecUpdate,
  AttributeSpecWrite,
  CatalogGroupWrite,
  CategoryUpdate,
  CategoryWrite,
} from '../domain/admin-catalog-write.repository';
import { AdminAttributeSpec } from '../domain/entities/admin-attribute-spec.entity';
import { AdminCategory } from '../domain/entities/admin-category.entity';
import { AdminCatalogMapper } from './admin-catalog.mapper';

/**
 * Prisma write port over the catalog config tables (`catalog_groups`, `categories`,
 * `attribute_specs`) for the admin panel. Prisma is used ONLY here. Group rows reuse the catalog
 * module's mapper; categories/attribute specs use the admin mapper (they expose the raw `id`).
 */
@Injectable()
export class AdminCatalogWritePrismaRepository implements AdminCatalogWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async businessTypeExists(type: string): Promise<boolean> {
    const row = await this.prisma.businessTypeInfo.findUnique({
      where: { type },
      select: { type: true },
    });
    return row !== null;
  }

  // -- catalog groups -------------------------------------------------------
  async findGroupByKey(key: string): Promise<CatalogGroup | null> {
    const row = await this.prisma.catalogGroup.findUnique({
      where: { key },
      include: { businessTypes: { select: { type: true }, orderBy: { type: 'asc' } } },
    });
    return row === null
      ? null
      : CatalogMapper.toCatalogGroup(
          row,
          row.businessTypes.map((businessType) => businessType.type),
        );
  }

  async createGroup(key: string, data: CatalogGroupWrite): Promise<CatalogGroup> {
    const row = await this.prisma.catalogGroup.create({
      data: {
        key,
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        emoji: data.emoji,
        icon: data.icon,
        accentColor: data.accentColor,
        sortOrder: data.sortOrder,
      },
    });
    return CatalogMapper.toCatalogGroup(row, []);
  }

  async updateGroup(key: string, data: Partial<CatalogGroupWrite>): Promise<CatalogGroup> {
    const row = await this.prisma.catalogGroup.update({
      where: { key },
      data: {
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        emoji: data.emoji,
        icon: data.icon,
        accentColor: data.accentColor,
        sortOrder: data.sortOrder,
      },
      include: { businessTypes: { select: { type: true }, orderBy: { type: 'asc' } } },
    });
    return CatalogMapper.toCatalogGroup(
      row,
      row.businessTypes.map((businessType) => businessType.type),
    );
  }

  async deleteGroup(key: string): Promise<void> {
    await this.prisma.catalogGroup.delete({ where: { key } });
  }

  async countBusinessTypesInGroup(key: string): Promise<number> {
    return this.prisma.businessTypeInfo.count({ where: { groupKey: key } });
  }

  // -- categories -----------------------------------------------------------
  async findCategoryById(id: string): Promise<AdminCategory | null> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    return row === null ? null : AdminCatalogMapper.toAdminCategory(row);
  }

  async findCategoryByUnique(
    businessType: string,
    gender: Gender | null,
    key: string,
  ): Promise<AdminCategory | null> {
    const row = await this.prisma.category.findFirst({
      where: { businessType, gender: gender === null ? null : PrismaGender[gender], key },
    });
    return row === null ? null : AdminCatalogMapper.toAdminCategory(row);
  }

  async createCategory(data: CategoryWrite): Promise<AdminCategory> {
    const row = await this.prisma.category.create({
      data: AdminCatalogMapper.toCategoryCreateData(data),
    });
    return AdminCatalogMapper.toAdminCategory(row);
  }

  async updateCategory(id: string, data: CategoryUpdate): Promise<AdminCategory> {
    const row = await this.prisma.category.update({
      where: { id },
      data: AdminCatalogMapper.toCategoryUpdateData(data),
    });
    return AdminCatalogMapper.toAdminCategory(row);
  }

  async deleteCategory(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

  async countListingsUsingCategory(businessType: string, key: string): Promise<number> {
    return this.prisma.listing.count({
      where: { categoryKey: key, business: { type: businessType } },
    });
  }

  // -- attribute specs ------------------------------------------------------
  async findAttributeSpecById(id: string): Promise<AdminAttributeSpec | null> {
    const row = await this.prisma.attributeSpec.findUnique({ where: { id } });
    return row === null ? null : AdminCatalogMapper.toAdminAttributeSpec(row);
  }

  async findAttributeSpecByUnique(
    businessType: string,
    categoryKey: string | null,
    key: string,
  ): Promise<AdminAttributeSpec | null> {
    const row = await this.prisma.attributeSpec.findFirst({
      where: { businessType, categoryKey, key },
    });
    return row === null ? null : AdminCatalogMapper.toAdminAttributeSpec(row);
  }

  async createAttributeSpec(data: AttributeSpecWrite): Promise<AdminAttributeSpec> {
    const row = await this.prisma.attributeSpec.create({
      data: AdminCatalogMapper.toAttributeSpecCreateData(data),
    });
    return AdminCatalogMapper.toAdminAttributeSpec(row);
  }

  async updateAttributeSpec(id: string, data: AttributeSpecUpdate): Promise<AdminAttributeSpec> {
    const row = await this.prisma.attributeSpec.update({
      where: { id },
      data: AdminCatalogMapper.toAttributeSpecUpdateData(data),
    });
    return AdminCatalogMapper.toAdminAttributeSpec(row);
  }

  async deleteAttributeSpec(id: string): Promise<void> {
    await this.prisma.attributeSpec.delete({ where: { id } });
  }
}
