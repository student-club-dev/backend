import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { isWithinUzbekistan } from '../../../common/geo/uzbekistan-bounds';
import { haversineMeters } from '../../../common/utils/geo-distance.util';
import { District } from '../domain/entities/district.entity';
import { MetroStation } from '../domain/entities/metro-station.entity';
import { GEO_REPOSITORY, GeoRepository } from '../domain/geo.repository';
import { GEOCODER, GeocoderPort } from '../domain/geocoder.port';
import { GeocodeResult, ReverseGeocodeResult } from './geocoding.io';

/**
 * Past this a station stops being a useful landmark and becomes a misleading one. Tashkent's
 * stations sit roughly 1–2 km apart, so 3 km still names a station for anywhere genuinely "near
 * the metro" without labelling half the country.
 */
const NEAREST_METRO_MAX_METERS = 3_000;

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
   * before any provider call, resolves region/district from our own data, and reports the nearest
   * metro station when one is close enough to serve as a landmark.
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
    const stations = await this.geoRepository.findMetroStations();
    const { address } = await this.geocoder.reverseGeocode(lat, lng);
    return {
      regionId: resolved.regionId,
      districtId: resolved.districtId,
      address,
      nearestMetro: this.nearestMetro(lat, lng, stations),
    };
  }

  /**
   * The closest station within {@link NEAREST_METRO_MAX_METERS}, or null when there is none — no
   * stations loaded, or none near enough. The cap matters: without it a branch in Samarkand would
   * be described by a Tashkent station, which is worse than saying nothing.
   */
  private nearestMetro(lat: number, lng: number, stations: MetroStation[]): string | null {
    let nearest: MetroStation | null = null;
    let best = Infinity;
    for (const station of stations) {
      const distance = haversineMeters(lat, lng, station.lat, station.lng);
      if (distance < best) {
        best = distance;
        nearest = station;
      }
    }
    return nearest !== null && best <= NEAREST_METRO_MAX_METERS ? nearest.nameUz : null;
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
