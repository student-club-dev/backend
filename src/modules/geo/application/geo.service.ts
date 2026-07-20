import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { District } from '../domain/entities/district.entity';
import { Region } from '../domain/entities/region.entity';
import { GEO_REPOSITORY, GeoRepository } from '../domain/geo.repository';

/**
 * Geo use-cases. Serves static reference data (regions & districts).
 * Depends on the repository interface only.
 */
@Injectable()
export class GeoService {
  constructor(@Inject(GEO_REPOSITORY) private readonly geoRepository: GeoRepository) {}

  /** All regions, ordered by nameUz. */
  async getRegions(): Promise<Region[]> {
    return this.geoRepository.findRegions();
  }

  /**
   * Districts, optionally filtered by region. When `regionId` is given it must exist
   * (unknown region → 404); when omitted, all districts are returned.
   */
  async getDistricts(regionId: string | null): Promise<District[]> {
    if (regionId === null) {
      return this.geoRepository.findDistricts();
    }
    const exists = await this.geoRepository.regionExists(regionId);
    if (!exists) {
      throw AppException.notFound(ERROR_CODE.NOT_FOUND, 'Viloyat topilmadi');
    }
    return this.geoRepository.findDistrictsByRegion(regionId);
  }
}
