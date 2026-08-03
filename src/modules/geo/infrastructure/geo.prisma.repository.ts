import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { District } from '../domain/entities/district.entity';
import { MetroStation } from '../domain/entities/metro-station.entity';
import { Region } from '../domain/entities/region.entity';
import { GeoRepository } from '../domain/geo.repository';
import { GeoMapper } from './geo.mapper';

/** Prisma implementation of the geo repository port. Prisma is used ONLY here. */
@Injectable()
export class GeoPrismaRepository implements GeoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRegions(): Promise<Region[]> {
    const rows = await this.prisma.region.findMany({ orderBy: { nameUz: 'asc' } });
    return rows.map((row) => GeoMapper.toRegion(row));
  }

  async findDistricts(): Promise<District[]> {
    const rows = await this.prisma.district.findMany({ orderBy: { nameUz: 'asc' } });
    return rows.map((row) => GeoMapper.toDistrict(row));
  }

  async findDistrictsByRegion(regionId: string): Promise<District[]> {
    const rows = await this.prisma.district.findMany({
      where: { regionId },
      orderBy: { nameUz: 'asc' },
    });
    return rows.map((row) => GeoMapper.toDistrict(row));
  }

  async regionExists(regionId: string): Promise<boolean> {
    const row = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true },
    });
    return row !== null;
  }

  async findMetroStations(): Promise<MetroStation[]> {
    const rows = await this.prisma.metroStation.findMany({
      orderBy: [{ line: 'asc' }, { sortOrder: 'asc' }],
    });
    return rows.map((row) => GeoMapper.toMetroStation(row));
  }
}
