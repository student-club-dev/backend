import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { District } from '../../geo/domain/entities/district.entity';
import { Region } from '../../geo/domain/entities/region.entity';
import { GeoMapper } from '../../geo/infrastructure/geo.mapper';
import {
  AdminGeoWriteRepository,
  DistrictWrite,
  RegionWrite,
} from '../domain/admin-geo-write.repository';

/** Prisma write port over the `regions` / `districts` tables for the admin panel. Prisma ONLY here. */
@Injectable()
export class AdminGeoWritePrismaRepository implements AdminGeoWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  // -- regions --------------------------------------------------------------
  async findRegionById(id: string): Promise<Region | null> {
    const row = await this.prisma.region.findUnique({ where: { id } });
    return row === null ? null : GeoMapper.toRegion(row);
  }

  async createRegion(id: string, data: RegionWrite): Promise<Region> {
    const row = await this.prisma.region.create({
      data: {
        id,
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
      },
    });
    return GeoMapper.toRegion(row);
  }

  async updateRegion(id: string, data: Partial<RegionWrite>): Promise<Region> {
    const row = await this.prisma.region.update({
      where: { id },
      data: {
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
      },
    });
    return GeoMapper.toRegion(row);
  }

  async deleteRegion(id: string): Promise<void> {
    await this.prisma.region.delete({ where: { id } });
  }

  async countDistrictsInRegion(id: string): Promise<number> {
    return this.prisma.district.count({ where: { regionId: id } });
  }

  async countBranchesInRegion(id: string): Promise<number> {
    return this.prisma.branch.count({ where: { regionId: id } });
  }

  // -- districts ------------------------------------------------------------
  async findDistrictById(id: string): Promise<District | null> {
    const row = await this.prisma.district.findUnique({ where: { id } });
    return row === null ? null : GeoMapper.toDistrict(row);
  }

  async createDistrict(id: string, data: DistrictWrite): Promise<District> {
    const row = await this.prisma.district.create({
      data: {
        id,
        regionId: data.regionId,
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
      },
    });
    return GeoMapper.toDistrict(row);
  }

  async updateDistrict(id: string, data: Partial<DistrictWrite>): Promise<District> {
    const row = await this.prisma.district.update({
      where: { id },
      data: {
        regionId: data.regionId,
        nameUz: data.nameUz,
        nameRu: data.nameRu,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
      },
    });
    return GeoMapper.toDistrict(row);
  }

  async deleteDistrict(id: string): Promise<void> {
    await this.prisma.district.delete({ where: { id } });
  }

  async countBranchesInDistrict(id: string): Promise<number> {
    return this.prisma.branch.count({ where: { districtId: id } });
  }
}
