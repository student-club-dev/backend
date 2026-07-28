import { ERROR_CODE } from '../../../common/errors/error-code';
import { District } from '../../geo/domain/entities/district.entity';
import { Region } from '../../geo/domain/entities/region.entity';
import {
  AdminGeoWriteRepository,
  DistrictWrite,
  RegionWrite,
} from '../domain/admin-geo-write.repository';
import { AdminGeoService } from './admin-geo.service';

const REGION: Region = {
  id: 'TOSHKENT_SHAHRI',
  nameUz: 'Toshkent shahri',
  nameRu: null,
  centerLat: null,
  centerLng: null,
};

const DISTRICT: District = {
  id: 'CHILONZOR',
  regionId: 'TOSHKENT_SHAHRI',
  nameUz: 'Chilonzor tumani',
  nameRu: null,
  centerLat: null,
  centerLng: null,
};

function regionWrite(overrides: Partial<RegionWrite> = {}): RegionWrite {
  return {
    nameUz: 'Toshkent shahri',
    nameRu: null,
    centerLat: null,
    centerLng: null,
    ...overrides,
  };
}

function districtWrite(overrides: Partial<DistrictWrite> = {}): DistrictWrite {
  return {
    regionId: 'TOSHKENT_SHAHRI',
    nameUz: 'Chilonzor tumani',
    nameRu: null,
    centerLat: null,
    centerLng: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<AdminGeoWriteRepository> = {}): AdminGeoWriteRepository {
  return {
    findRegionById: jest.fn().mockResolvedValue(null),
    createRegion: jest.fn(async (id: string) => ({ ...REGION, id })),
    updateRegion: jest.fn().mockResolvedValue(REGION),
    deleteRegion: jest.fn().mockResolvedValue(undefined),
    countDistrictsInRegion: jest.fn().mockResolvedValue(0),
    countBranchesInRegion: jest.fn().mockResolvedValue(0),
    findDistrictById: jest.fn().mockResolvedValue(null),
    createDistrict: jest.fn(async (id: string) => ({ ...DISTRICT, id })),
    updateDistrict: jest.fn().mockResolvedValue(DISTRICT),
    deleteDistrict: jest.fn().mockResolvedValue(undefined),
    countBranchesInDistrict: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('AdminGeoService', () => {
  describe('regions', () => {
    it('creates a region when the id is free', async () => {
      const repo = makeRepo();
      const service = new AdminGeoService(repo);

      const result = await service.createRegion('TOSHKENT_SHAHRI', regionWrite());

      expect(result.id).toBe('TOSHKENT_SHAHRI');
      expect(repo.createRegion).toHaveBeenCalledWith(
        'TOSHKENT_SHAHRI',
        expect.objectContaining({ nameUz: 'Toshkent shahri' }),
      );
    });

    it('rejects a duplicate region id with 409 REGION_EXISTS', async () => {
      const repo = makeRepo({ findRegionById: jest.fn().mockResolvedValue(REGION) });
      const service = new AdminGeoService(repo);

      await expect(service.createRegion('TOSHKENT_SHAHRI', regionWrite())).rejects.toMatchObject({
        code: ERROR_CODE.REGION_EXISTS,
        status: 409,
      });
      expect(repo.createRegion).not.toHaveBeenCalled();
    });

    it('throws 404 REGION_NOT_FOUND when updating a missing region', async () => {
      const repo = makeRepo({ findRegionById: jest.fn().mockResolvedValue(null) });
      const service = new AdminGeoService(repo);

      await expect(service.updateRegion('NOPE', { nameUz: 'X' })).rejects.toMatchObject({
        code: ERROR_CODE.REGION_NOT_FOUND,
        status: 404,
      });
      expect(repo.updateRegion).not.toHaveBeenCalled();
    });

    it('deletes an unreferenced region', async () => {
      const repo = makeRepo({ findRegionById: jest.fn().mockResolvedValue(REGION) });
      const service = new AdminGeoService(repo);

      await service.deleteRegion('TOSHKENT_SHAHRI');

      expect(repo.deleteRegion).toHaveBeenCalledWith('TOSHKENT_SHAHRI');
    });

    it('rejects deletion with 409 REGION_IN_USE when districts reference it', async () => {
      const repo = makeRepo({
        findRegionById: jest.fn().mockResolvedValue(REGION),
        countDistrictsInRegion: jest.fn().mockResolvedValue(3),
      });
      const service = new AdminGeoService(repo);

      await expect(service.deleteRegion('TOSHKENT_SHAHRI')).rejects.toMatchObject({
        code: ERROR_CODE.REGION_IN_USE,
        status: 409,
      });
      expect(repo.deleteRegion).not.toHaveBeenCalled();
    });

    it('rejects deletion with 409 REGION_IN_USE when branches reference it', async () => {
      const repo = makeRepo({
        findRegionById: jest.fn().mockResolvedValue(REGION),
        countBranchesInRegion: jest.fn().mockResolvedValue(2),
      });
      const service = new AdminGeoService(repo);

      await expect(service.deleteRegion('TOSHKENT_SHAHRI')).rejects.toMatchObject({
        code: ERROR_CODE.REGION_IN_USE,
        status: 409,
      });
    });
  });

  describe('districts', () => {
    it('creates a district when the id is free and the region exists', async () => {
      const repo = makeRepo({ findRegionById: jest.fn().mockResolvedValue(REGION) });
      const service = new AdminGeoService(repo);

      const result = await service.createDistrict('CHILONZOR', districtWrite());

      expect(result.id).toBe('CHILONZOR');
      expect(repo.createDistrict).toHaveBeenCalledWith(
        'CHILONZOR',
        expect.objectContaining({ regionId: 'TOSHKENT_SHAHRI' }),
      );
    });

    it('rejects a duplicate district id with 409 DISTRICT_EXISTS', async () => {
      const repo = makeRepo({ findDistrictById: jest.fn().mockResolvedValue(DISTRICT) });
      const service = new AdminGeoService(repo);

      await expect(service.createDistrict('CHILONZOR', districtWrite())).rejects.toMatchObject({
        code: ERROR_CODE.DISTRICT_EXISTS,
        status: 409,
      });
      expect(repo.createDistrict).not.toHaveBeenCalled();
    });

    it('throws 404 REGION_NOT_FOUND when the target region is missing', async () => {
      const repo = makeRepo({
        findDistrictById: jest.fn().mockResolvedValue(null),
        findRegionById: jest.fn().mockResolvedValue(null),
      });
      const service = new AdminGeoService(repo);

      await expect(service.createDistrict('CHILONZOR', districtWrite())).rejects.toMatchObject({
        code: ERROR_CODE.REGION_NOT_FOUND,
        status: 404,
      });
      expect(repo.createDistrict).not.toHaveBeenCalled();
    });

    it('throws 404 DISTRICT_NOT_FOUND when updating a missing district', async () => {
      const repo = makeRepo({ findDistrictById: jest.fn().mockResolvedValue(null) });
      const service = new AdminGeoService(repo);

      await expect(service.updateDistrict('NOPE', { nameUz: 'X' })).rejects.toMatchObject({
        code: ERROR_CODE.DISTRICT_NOT_FOUND,
        status: 404,
      });
      expect(repo.updateDistrict).not.toHaveBeenCalled();
    });

    it('validates a moved region on update (404 REGION_NOT_FOUND)', async () => {
      const repo = makeRepo({
        findDistrictById: jest.fn().mockResolvedValue(DISTRICT),
        findRegionById: jest.fn().mockResolvedValue(null),
      });
      const service = new AdminGeoService(repo);

      await expect(
        service.updateDistrict('CHILONZOR', { regionId: 'GHOST' }),
      ).rejects.toMatchObject({ code: ERROR_CODE.REGION_NOT_FOUND, status: 404 });
      expect(repo.updateDistrict).not.toHaveBeenCalled();
    });

    it('rejects deletion with 409 DISTRICT_IN_USE when branches reference it', async () => {
      const repo = makeRepo({
        findDistrictById: jest.fn().mockResolvedValue(DISTRICT),
        countBranchesInDistrict: jest.fn().mockResolvedValue(4),
      });
      const service = new AdminGeoService(repo);

      await expect(service.deleteDistrict('CHILONZOR')).rejects.toMatchObject({
        code: ERROR_CODE.DISTRICT_IN_USE,
        status: 409,
      });
      expect(repo.deleteDistrict).not.toHaveBeenCalled();
    });
  });
});
