import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { District } from '../domain/entities/district.entity';
import { MetroStation } from '../domain/entities/metro-station.entity';
import { Region } from '../domain/entities/region.entity';
import { GeoRepository } from '../domain/geo.repository';
import { GeocoderMatch, GeocoderPort } from '../domain/geocoder.port';
import { GeocodingService } from './geocoding.service';

function region(id: string, nameUz: string): Region {
  return { id, nameUz, nameRu: null, centerLat: null, centerLng: null };
}

function district(
  id: string,
  regionId: string,
  centerLat: number | null,
  centerLng: number | null,
): District {
  return { id, regionId, nameUz: id, nameRu: null, centerLat, centerLng };
}

const REGIONS: Region[] = [
  region('TOSHKENT_SHAHRI', 'Toshkent shahri'),
  region('SAMARQAND', 'Samarqand'),
];

const DISTRICTS: District[] = [
  district('CHILONZOR', 'TOSHKENT_SHAHRI', 41.2856, 69.2034),
  district('YUNUSOBOD', 'TOSHKENT_SHAHRI', 41.36, 69.28),
  district('SAMARQAND_SHAHRI', 'SAMARQAND', 39.627, 66.975),
  district('NO_CENTER', 'SAMARQAND', null, null),
];

const TASHKENT_POINT = { lat: 41.2856, lng: 69.2034 }; // → CHILONZOR
const SAMARQAND_POINT = { lat: 39.627, lng: 66.975 }; // → SAMARQAND_SHAHRI

function match(lat: number, lng: number, extra: Partial<GeocoderMatch> = {}): GeocoderMatch {
  return { lat, lng, formattedAddress: 'addr', confidence: 1, ...extra };
}

function makeGeocoder(overrides: Partial<GeocoderPort> = {}): GeocoderPort {
  return {
    geocode: jest.fn().mockResolvedValue([]),
    reverseGeocode: jest.fn().mockResolvedValue({ address: null }),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<GeoRepository> = {}): GeoRepository {
  return {
    findRegions: jest.fn().mockResolvedValue(REGIONS),
    findDistricts: jest.fn().mockResolvedValue(DISTRICTS),
    findDistrictsByRegion: jest.fn().mockResolvedValue([]),
    regionExists: jest.fn().mockResolvedValue(true),
    findMetroStations: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('GeocodingService', () => {
  describe('geocode (forward)', () => {
    it('resolves our region/district for each match from district data', async () => {
      const geocoder = makeGeocoder({
        geocode: jest.fn().mockResolvedValue([match(TASHKENT_POINT.lat, TASHKENT_POINT.lng)]),
      });
      const service = new GeocodingService(geocoder, makeRepo());

      const results = await service.geocode('Chilonzor 42', null);

      expect(results).toEqual([
        {
          lat: TASHKENT_POINT.lat,
          lng: TASHKENT_POINT.lng,
          regionId: 'TOSHKENT_SHAHRI',
          districtId: 'CHILONZOR',
          formattedAddress: 'addr',
          confidence: 1,
        },
      ]);
    });

    it('returns [] and does not load districts when there are no matches', async () => {
      const repo = makeRepo();
      const service = new GeocodingService(makeGeocoder(), repo);

      expect(await service.geocode('nowhere', null)).toEqual([]);
      expect(repo.findDistricts).not.toHaveBeenCalled();
    });

    it('restricts results to the given region and biases the query with the region name', async () => {
      const geocoder = makeGeocoder({
        geocode: jest
          .fn()
          .mockResolvedValue([
            match(TASHKENT_POINT.lat, TASHKENT_POINT.lng),
            match(SAMARQAND_POINT.lat, SAMARQAND_POINT.lng),
          ]),
      });
      const service = new GeocodingService(geocoder, makeRepo());

      const results = await service.geocode('markaz', 'TOSHKENT_SHAHRI');

      expect(results).toHaveLength(1);
      expect(results[0].regionId).toBe('TOSHKENT_SHAHRI');
      expect(geocoder.geocode).toHaveBeenCalledWith('Toshkent shahri, markaz');
    });

    it('throws 422 VALIDATION_ERROR for an unknown regionId and never calls the provider', async () => {
      const geocoder = makeGeocoder();
      const service = new GeocodingService(geocoder, makeRepo());

      await expect(service.geocode('x', 'NOPE')).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
      });
      expect(geocoder.geocode).not.toHaveBeenCalled();
    });
  });

  describe('reverseGeocode', () => {
    it('resolves our region/district and returns the provider address', async () => {
      const geocoder = makeGeocoder({
        reverseGeocode: jest.fn().mockResolvedValue({ address: 'Chilonzor 42' }),
      });
      const service = new GeocodingService(geocoder, makeRepo());

      expect(await service.reverseGeocode(TASHKENT_POINT.lat, TASHKENT_POINT.lng)).toEqual({
        regionId: 'TOSHKENT_SHAHRI',
        districtId: 'CHILONZOR',
        address: 'Chilonzor 42',
        // No stations seeded in this repo stub — the nearestMetro cases are covered below.
        nearestMetro: null,
      });
    });

    describe('nearestMetro', () => {
      /** Two real stations ~5 km apart, so "closest" is unambiguous from the Chilonzor point. */
      const STATIONS: MetroStation[] = [
        {
          id: 'CHILONZOR',
          nameUz: 'Chilonzor',
          nameRu: 'Чиланзар',
          line: 'CHILONZOR',
          lat: 41.27436,
          lng: 69.20497,
        },
        {
          id: 'BUYUK_IPAK_YOLI',
          nameUz: 'Buyuk Ipak Yoʻli',
          nameRu: 'Буюк Ипак Йули',
          line: 'CHILONZOR',
          lat: 41.32611,
          lng: 69.32856,
        },
      ];

      function serviceWith(stations: MetroStation[]): GeocodingService {
        return new GeocodingService(
          makeGeocoder({ reverseGeocode: jest.fn().mockResolvedValue({ address: 'X' }) }),
          makeRepo({ findMetroStations: jest.fn().mockResolvedValue(stations) }),
        );
      }

      it('reports the closest station', async () => {
        const service = serviceWith(STATIONS);

        // TASHKENT_POINT is ~1.3 km from Chilonzor and ~11 km from Buyuk Ipak Yoʻli.
        const result = await service.reverseGeocode(TASHKENT_POINT.lat, TASHKENT_POINT.lng);

        expect(result.nearestMetro).toBe('Chilonzor');
      });

      it('is null when no station is seeded', async () => {
        const service = serviceWith([]);

        const result = await service.reverseGeocode(TASHKENT_POINT.lat, TASHKENT_POINT.lng);

        expect(result.nearestMetro).toBeNull();
      });

      it('is null for a point nowhere near the network — a Tashkent station is no landmark in Samarkand', async () => {
        const service = serviceWith(STATIONS);

        const result = await service.reverseGeocode(SAMARQAND_POINT.lat, SAMARQAND_POINT.lng);

        expect(result.nearestMetro).toBeNull();
      });
    });

    it('throws 422 LOCATION_OUT_OF_BOUNDS for a point outside Uzbekistan, before any provider call', async () => {
      const geocoder = makeGeocoder();
      const repo = makeRepo();
      const service = new GeocodingService(geocoder, repo);

      await expect(service.reverseGeocode(50, 69)).rejects.toMatchObject({
        code: ERROR_CODE.LOCATION_OUT_OF_BOUNDS,
        status: 422,
      });
      expect(geocoder.reverseGeocode).not.toHaveBeenCalled();
      expect(repo.findDistricts).not.toHaveBeenCalled();
    });

    it('returns a null address when the provider has none (region/district still resolved)', async () => {
      const service = new GeocodingService(makeGeocoder(), makeRepo());

      const result = await service.reverseGeocode(TASHKENT_POINT.lat, TASHKENT_POINT.lng);

      expect(result.address).toBeNull();
      expect(result.districtId).toBe('CHILONZOR');
    });

    it('propagates a provider failure (GEOCODER_UNAVAILABLE)', async () => {
      const geocoder = makeGeocoder({
        reverseGeocode: jest
          .fn()
          .mockRejectedValue(new AppException(ERROR_CODE.GEOCODER_UNAVAILABLE, 503, 'down')),
      });
      const service = new GeocodingService(geocoder, makeRepo());

      await expect(
        service.reverseGeocode(TASHKENT_POINT.lat, TASHKENT_POINT.lng),
      ).rejects.toMatchObject({ code: ERROR_CODE.GEOCODER_UNAVAILABLE, status: 503 });
    });

    it('skips districts with no centre and resolves to null when none have one', async () => {
      const repo = makeRepo({
        findDistricts: jest
          .fn()
          .mockResolvedValue([district('NO_CENTER', 'SAMARQAND', null, null)]),
      });
      const service = new GeocodingService(makeGeocoder(), repo);

      const result = await service.reverseGeocode(TASHKENT_POINT.lat, TASHKENT_POINT.lng);

      expect(result.regionId).toBeNull();
      expect(result.districtId).toBeNull();
    });
  });
});
