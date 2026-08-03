import { AppException } from '../../../common/exceptions/app.exception';
import { District } from '../domain/entities/district.entity';
import { MetroStation } from '../domain/entities/metro-station.entity';
import { Region } from '../domain/entities/region.entity';
import { GeoRepository } from '../domain/geo.repository';
import { GeoService } from './geo.service';

function region(id: string): Region {
  return { id, nameUz: id, nameRu: null, centerLat: null, centerLng: null };
}

function district(id: string, regionId: string): District {
  return { id, regionId, nameUz: id, nameRu: null, centerLat: null, centerLng: null };
}

const REGIONS: Region[] = [region('TOSHKENT_SHAHRI'), region('ANDIJON')];
const ALL_DISTRICTS: District[] = [
  district('CHILONZOR', 'TOSHKENT_SHAHRI'),
  district('OLTINKOL', 'ANDIJON'),
];
const TASHKENT_DISTRICTS: District[] = [district('CHILONZOR', 'TOSHKENT_SHAHRI')];

function makeRepository(overrides: Partial<GeoRepository> = {}): GeoRepository {
  return {
    findRegions: jest.fn().mockResolvedValue(REGIONS),
    findDistricts: jest.fn().mockResolvedValue(ALL_DISTRICTS),
    findDistrictsByRegion: jest.fn().mockResolvedValue(TASHKENT_DISTRICTS),
    regionExists: jest.fn().mockResolvedValue(true),
    findMetroStations: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('GeoService', () => {
  describe('getRegions', () => {
    it('returns all regions', async () => {
      const service = new GeoService(makeRepository());
      expect(await service.getRegions()).toBe(REGIONS);
    });
  });

  describe('getDistricts', () => {
    it('returns all districts when no region is given', async () => {
      const repository = makeRepository();
      const service = new GeoService(repository);
      const result = await service.getDistricts(null);
      expect(result).toBe(ALL_DISTRICTS);
      expect(repository.findDistrictsByRegion).not.toHaveBeenCalled();
      expect(repository.regionExists).not.toHaveBeenCalled();
    });

    it("returns a region's districts when the region exists", async () => {
      const repository = makeRepository();
      const service = new GeoService(repository);
      const result = await service.getDistricts('TOSHKENT_SHAHRI');
      expect(result).toBe(TASHKENT_DISTRICTS);
      expect(repository.findDistrictsByRegion).toHaveBeenCalledWith('TOSHKENT_SHAHRI');
    });

    it('throws a 404 AppException when the region does not exist', async () => {
      const repository = makeRepository({ regionExists: jest.fn().mockResolvedValue(false) });
      const service = new GeoService(repository);
      await expect(service.getDistricts('NOPE')).rejects.toBeInstanceOf(AppException);
      expect(repository.findDistrictsByRegion).not.toHaveBeenCalled();
    });
  });

  describe('getMetroStations', () => {
    const STATIONS: MetroStation[] = [
      {
        id: 'CHILONZOR',
        nameUz: 'Chilonzor',
        nameRu: 'Чиланзар',
        line: 'CHILONZOR',
        lat: 41.27436,
        lng: 69.20497,
      },
    ];

    it('returns the stations the repository provides, unfiltered', async () => {
      const repository = makeRepository({
        findMetroStations: jest.fn().mockResolvedValue(STATIONS),
      });
      const service = new GeoService(repository);

      await expect(service.getMetroStations()).resolves.toBe(STATIONS);
    });

    it('returns an empty list rather than throwing when nothing is seeded', async () => {
      const service = new GeoService(makeRepository());

      await expect(service.getMetroStations()).resolves.toEqual([]);
    });
  });
});
