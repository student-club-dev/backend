import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { District } from '../../geo/domain/entities/district.entity';
import { Region } from '../../geo/domain/entities/region.entity';
import {
  ADMIN_GEO_WRITE_REPOSITORY,
  AdminGeoWriteRepository,
  DistrictWrite,
  RegionWrite,
} from '../domain/admin-geo-write.repository';

/**
 * Admin CRUD for the geo reference data (regions + districts). Enforces id-uniqueness (409),
 * existence (404) and referential-integrity (409) rules; both AdminJwtGuard + AdminRoleGuard
 * (ADMIN) authorise the caller. Depends on the geo write repository interface only.
 */
@Injectable()
export class AdminGeoService {
  constructor(
    @Inject(ADMIN_GEO_WRITE_REPOSITORY)
    private readonly geo: AdminGeoWriteRepository,
  ) {}

  // -- regions --------------------------------------------------------------

  /** Creates a region. The `id` key must be free (else 409 REGION_EXISTS). */
  async createRegion(id: string, data: RegionWrite): Promise<Region> {
    if ((await this.geo.findRegionById(id)) !== null) {
      throw AppException.conflict(ERROR_CODE.REGION_EXISTS, 'Bu viloyat allaqachon mavjud');
    }
    return this.geo.createRegion(id, data);
  }

  /** Updates an existing region (404 REGION_NOT_FOUND if it does not exist). */
  async updateRegion(id: string, data: Partial<RegionWrite>): Promise<Region> {
    await this.assertRegionExists(id);
    return this.geo.updateRegion(id, data);
  }

  /** Deletes a region — only when no district and no branch reference it (else 409 REGION_IN_USE). */
  async deleteRegion(id: string): Promise<void> {
    await this.assertRegionExists(id);
    const [districts, branches] = await Promise.all([
      this.geo.countDistrictsInRegion(id),
      this.geo.countBranchesInRegion(id),
    ]);
    if (districts > 0 || branches > 0) {
      throw AppException.conflict(
        ERROR_CODE.REGION_IN_USE,
        'Bu viloyat ishlatilmoqda, uni o‘chirib bo‘lmaydi',
      );
    }
    await this.geo.deleteRegion(id);
  }

  // -- districts ------------------------------------------------------------

  /** Creates a district. The `id` must be free (409 DISTRICT_EXISTS) and `regionId` must exist (404). */
  async createDistrict(id: string, data: DistrictWrite): Promise<District> {
    if ((await this.geo.findDistrictById(id)) !== null) {
      throw AppException.conflict(ERROR_CODE.DISTRICT_EXISTS, 'Bu tuman allaqachon mavjud');
    }
    await this.assertRegionExists(data.regionId);
    return this.geo.createDistrict(id, data);
  }

  /** Updates an existing district (404 DISTRICT_NOT_FOUND); a `regionId` change is validated (404). */
  async updateDistrict(id: string, data: Partial<DistrictWrite>): Promise<District> {
    await this.assertDistrictExists(id);
    if (data.regionId !== undefined) {
      await this.assertRegionExists(data.regionId);
    }
    return this.geo.updateDistrict(id, data);
  }

  /** Deletes a district — only when no branch references it (else 409 DISTRICT_IN_USE). */
  async deleteDistrict(id: string): Promise<void> {
    await this.assertDistrictExists(id);
    if ((await this.geo.countBranchesInDistrict(id)) > 0) {
      throw AppException.conflict(
        ERROR_CODE.DISTRICT_IN_USE,
        'Bu tuman ishlatilmoqda, uni o‘chirib bo‘lmaydi',
      );
    }
    await this.geo.deleteDistrict(id);
  }

  private async assertRegionExists(id: string): Promise<void> {
    if ((await this.geo.findRegionById(id)) === null) {
      throw AppException.notFound(ERROR_CODE.REGION_NOT_FOUND, 'Viloyat topilmadi');
    }
  }

  private async assertDistrictExists(id: string): Promise<void> {
    if ((await this.geo.findDistrictById(id)) === null) {
      throw AppException.notFound(ERROR_CODE.DISTRICT_NOT_FOUND, 'Tuman topilmadi');
    }
  }
}
