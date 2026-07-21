import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { isWithinUzbekistan } from '../../../common/geo/uzbekistan-bounds';
import { haversineMeters } from '../../../common/utils/geo-distance.util';
import { District } from '../domain/entities/district.entity';
import { GEO_REPOSITORY, GeoRepository } from '../domain/geo.repository';
import { GEOCODER, GeocoderPort } from '../domain/geocoder.port';
import { GeocodeResult, ReverseGeocodeResult } from './geocoding.io';

/**
 * Geocoding use-cases — forward/reverse address lookup. Talks to the external provider through
 * GeocoderPort (pure provider access) and enriches each result with OUR region/district, resolved
 * from district centres — never trusting the provider's admin names. Enforces Uzbekistan bounds on
 * reverse lookups. Depends on the port + repository interfaces only.
 */
@Injectable()
export class GeocodingService {
  constructor(
    @Inject(GEOCODER) private readonly geocoder: GeocoderPort,
    @Inject(GEO_REPOSITORY) private readonly geoRepository: GeoRepository,
  ) {}

  /**
   * Forward geocode a free-text query to candidates, best-confidence first. When `regionId` is given
   * it must exist (else 422), biases the query, and the results are restricted to that region.
   */
  async geocode(query: string, regionId: string | null): Promise<GeocodeResult[]> {
    const providerQuery = await this.biasByRegion(query, regionId);
    const matches = await this.geocoder.geocode(providerQuery);
    if (matches.length === 0) {
      return [];
    }
    const districts = await this.geoRepository.findDistricts();
    const results = matches.map((match) => {
      const resolved = this.nearestDistrict(match.lat, match.lng, districts);
      return {
        lat: match.lat,
        lng: match.lng,
        regionId: resolved.regionId,
        districtId: resolved.districtId,
        formattedAddress: match.formattedAddress,
        confidence: match.confidence,
      };
    });
    return regionId === null ? results : results.filter((result) => result.regionId === regionId);
  }

  /**
   * Reverse geocode coordinates. Rejects points outside Uzbekistan (422 LOCATION_OUT_OF_BOUNDS)
   * before any provider call; resolves region/district from our data; nearestMetro is null (Level-1).
   */
  async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
    if (!isWithinUzbekistan(lat, lng)) {
      throw new AppException(
        ERROR_CODE.LOCATION_OUT_OF_BOUNDS,
        422,
        'Koordinata O‘zbekiston chegarasidan tashqarida',
      );
    }
    const districts = await this.geoRepository.findDistricts();
    const resolved = this.nearestDistrict(lat, lng, districts);
    const { address } = await this.geocoder.reverseGeocode(lat, lng);
    return {
      regionId: resolved.regionId,
      districtId: resolved.districtId,
      address,
      nearestMetro: null,
    };
  }

  /** Validates `regionId` (if given) and returns the query prefixed with the region name to bias it. */
  private async biasByRegion(query: string, regionId: string | null): Promise<string> {
    if (regionId === null) {
      return query;
    }
    const regions = await this.geoRepository.findRegions();
    const region = regions.find((candidate) => candidate.id === regionId);
    if (region === undefined) {
      throw AppException.validation({ regionId: 'Viloyat topilmadi' }, 'Viloyat topilmadi');
    }
    return `${region.nameUz}, ${query}`;
  }

  /** Nearest district by centre to (lat,lng); districts with no centre are skipped. */
  private nearestDistrict(
    lat: number,
    lng: number,
    districts: District[],
  ): { regionId: string | null; districtId: string | null } {
    let nearest: District | null = null;
    let best = Infinity;
    for (const district of districts) {
      if (district.centerLat === null || district.centerLng === null) {
        continue;
      }
      const distance = haversineMeters(lat, lng, district.centerLat, district.centerLng);
      if (distance < best) {
        best = distance;
        nearest = district;
      }
    }
    return nearest === null
      ? { regionId: null, districtId: null }
      : { regionId: nearest.regionId, districtId: nearest.id };
  }
}
