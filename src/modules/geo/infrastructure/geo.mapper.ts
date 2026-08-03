import {
  type District as DistrictRow,
  type MetroStation as MetroStationRow,
  type Region as RegionRow,
} from '@prisma/client';
import { District } from '../domain/entities/district.entity';
import { MetroStation } from '../domain/entities/metro-station.entity';
import { Region } from '../domain/entities/region.entity';

/** Maps Prisma rows to geo domain entities. */
export class GeoMapper {
  static toRegion(row: RegionRow): Region {
    return {
      id: row.id,
      nameUz: row.nameUz,
      nameRu: row.nameRu,
      centerLat: row.centerLat,
      centerLng: row.centerLng,
    };
  }

  static toDistrict(row: DistrictRow): District {
    return {
      id: row.id,
      regionId: row.regionId,
      nameUz: row.nameUz,
      nameRu: row.nameRu,
      centerLat: row.centerLat,
      centerLng: row.centerLng,
    };
  }

  static toMetroStation(row: MetroStationRow): MetroStation {
    return {
      id: row.id,
      nameUz: row.nameUz,
      nameRu: row.nameRu,
      line: row.line,
      lat: row.lat,
      lng: row.lng,
    };
  }
}
