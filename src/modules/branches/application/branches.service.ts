import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { haversineMeters } from '../../../common/utils/geo-distance.util';
import { encodeGeohash } from '../../../common/utils/geohash.util';
import { GEO_REPOSITORY, GeoRepository } from '../../geo/domain/geo.repository';
import { TradeCenterFieldType } from '../../trade-centers/domain/enums/trade-center-field-type.enum';
import {
  TRADE_CENTER_REPOSITORY,
  TradeCenterRepository,
} from '../../trade-centers/domain/trade-center.repository';
import { BRANCH_REPOSITORY, BranchRepository } from '../domain/branches.repository';
import {
  Branch,
  BranchLocation,
  BranchTradeCenterFieldInput,
} from '../domain/entities/branch.entity';
import {
  OWNING_BUSINESS_REPOSITORY,
  OwningBusinessRepository,
} from '../domain/owning-business.repository';
import { BranchInput } from './branches.io';

/** Uzbekistan bounding box for branch coordinates (DISCOUNTS_BUSINESS_API §6.6, §3.9). */
const LAT_MIN = 37;
const LAT_MAX = 46;
const LNG_MIN = 55;
const LNG_MAX = 74;
/** A branch point may sit at most this far from its district centre. */
const DISTRICT_MAX_DISTANCE_METERS = 10_000;
/** Two branches of the same business may not be closer than this. */
const DUPLICATE_RADIUS_METERS = 100;
/** Geohash precision persisted for branches (~150 m). */
const GEOHASH_PRECISION = 7;

/**
 * Branch use-cases, nested under a business. The BUSINESS-account gate lives in
 * BusinessAccountGuard; here we enforce ownership: the owning business must exist (404) and belong
 * to the caller (403). Branches are hard-deleted. Depends on repository interfaces only.
 */
@Injectable()
export class BranchesService {
  constructor(
    @Inject(BRANCH_REPOSITORY) private readonly branches: BranchRepository,
    @Inject(OWNING_BUSINESS_REPOSITORY) private readonly businesses: OwningBusinessRepository,
    @Inject(GEO_REPOSITORY) private readonly geo: GeoRepository,
    @Inject(TRADE_CENTER_REPOSITORY) private readonly tradeCenters: TradeCenterRepository,
  ) {}

  /** All branches of a business the caller owns. */
  async list(user: AuthenticatedUser, businessId: string): Promise<Branch[]> {
    await this.assertBusinessOwned(user, businessId);
    return this.branches.findManyByBusiness(businessId);
  }

  /** Creates a branch under a business the caller owns. */
  async create(user: AuthenticatedUser, businessId: string, input: BranchInput): Promise<Branch> {
    await this.assertBusinessOwned(user, businessId);
    const location = await this.validateLocation(businessId, input.location);
    const tradeCenter = await this.validateTradeCenter(input);
    return this.branches.create({
      businessId,
      name: input.name,
      phone: input.phone,
      location,
      workingHours: input.workingHours,
      deliveryZone: input.deliveryZone,
      isActive: input.isActive,
      tradeCenterId: tradeCenter.tradeCenterId,
      tradeCenterFields: tradeCenter.tradeCenterFields,
    });
  }

  /** Full-replace update of a branch the caller owns. */
  async update(
    user: AuthenticatedUser,
    businessId: string,
    branchId: string,
    input: BranchInput,
  ): Promise<Branch> {
    await this.loadOwnedBranch(user, businessId, branchId);
    const location = await this.validateLocation(businessId, input.location, branchId);
    const tradeCenter = await this.validateTradeCenter(input);
    return this.branches.update(branchId, {
      name: input.name,
      phone: input.phone,
      location,
      workingHours: input.workingHours,
      deliveryZone: input.deliveryZone,
      isActive: input.isActive,
      tradeCenterId: tradeCenter.tradeCenterId,
      tradeCenterFields: tradeCenter.tradeCenterFields,
    });
  }

  /** Hard-deletes a branch the caller owns. */
  async delete(user: AuthenticatedUser, businessId: string, branchId: string): Promise<void> {
    await this.loadOwnedBranch(user, businessId, branchId);
    await this.branches.delete(branchId);
  }

  /** Enforces that the business exists (404) and the caller owns it (403). */
  private async assertBusinessOwned(user: AuthenticatedUser, businessId: string): Promise<void> {
    const ownerId = await this.businesses.findOwnerId(businessId);
    if (ownerId === null) {
      throw AppException.notFound(ERROR_CODE.BUSINESS_NOT_FOUND, 'Biznes topilmadi');
    }
    if (ownerId !== user.id) {
      throw AppException.forbidden();
    }
  }

  /**
   * Enforces the branch-location rules (DISCOUNTS_BUSINESS_API §6.6) and returns the location with a
   * server-computed geohash. Runs after ownership is checked. `excludeBranchId` skips the branch
   * itself on update so its own coordinates don't count as a duplicate.
   */
  private async validateLocation(
    businessId: string,
    location: BranchLocation,
    excludeBranchId?: string,
  ): Promise<BranchLocation> {
    const { lat, lng, regionId, districtId } = location;

    // 1. Coordinate within Uzbekistan's bounds.
    if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) {
      throw new AppException(
        ERROR_CODE.LOCATION_OUT_OF_BOUNDS,
        422,
        'Koordinata O‘zbekiston chegarasidan tashqarida',
      );
    }

    // 2. District belongs to the selected region.
    const districts = await this.geo.findDistrictsByRegion(regionId);
    const district = districts.find((d) => d.id === districtId);
    if (district === undefined) {
      throw new AppException(
        ERROR_CODE.DISTRICT_REGION_MISMATCH,
        422,
        'Tuman tanlangan viloyatga tegishli emas',
      );
    }

    // 3. Point is within 10 km of the district centre (skipped when the centre is unknown).
    if (
      district.centerLat !== null &&
      district.centerLng !== null &&
      haversineMeters(lat, lng, district.centerLat, district.centerLng) >
        DISTRICT_MAX_DISTANCE_METERS
    ) {
      throw new AppException(
        ERROR_CODE.LOCATION_DISTRICT_MISMATCH,
        422,
        'Nuqta tanlangan tumandan 10 km dan uzoq',
      );
    }

    // 4. No other branch of this business within 100 m.
    const duplicate = await this.branches.existsWithinRadius(
      businessId,
      lat,
      lng,
      DUPLICATE_RADIUS_METERS,
      excludeBranchId,
    );
    if (duplicate) {
      throw AppException.conflict(
        ERROR_CODE.DUPLICATE_BRANCH_LOCATION,
        '100 m radiusda shu biznesning filiali bor',
      );
    }

    // 5. Server-computed geohash (client-sent value is ignored).
    return { ...location, geohash: encodeGeohash(lat, lng, GEOHASH_PRECISION) };
  }

  /**
   * Validates the branch's trade-center selection (docs/api/provider/TRADE_CENTERS.md §5) and
   * returns the values to persist. Runs after location validation. When no center is selected the
   * submitted fields are ignored so persistence clears any previous values.
   */
  private async validateTradeCenter(
    input: BranchInput,
  ): Promise<{ tradeCenterId: string | null; tradeCenterFields: BranchTradeCenterFieldInput[] }> {
    // 1. No trade center → ignore any submitted fields.
    if (input.tradeCenterId === null) {
      return { tradeCenterId: null, tradeCenterFields: [] };
    }

    // 2. The center must exist and be ACTIVE.
    const center = await this.tradeCenters.findActiveByIdWithFields(input.tradeCenterId);
    if (center === null) {
      throw new AppException(
        ERROR_CODE.TRADE_CENTER_NOT_FOUND,
        422,
        'Savdo markazi topilmadi yoki faol emas',
      );
    }

    const fieldsById = new Map(center.fields.map((field) => [field.id, field]));
    const submitted = input.tradeCenterFields;

    // 3. Every submitted field must belong to this center, with no duplicates
    //    (a duplicate fieldId would otherwise hit the branch/field unique constraint).
    const seen = new Set<string>();
    for (const item of submitted) {
      if (!fieldsById.has(item.fieldId)) {
        throw new AppException(
          ERROR_CODE.TRADE_CENTER_FIELD_INVALID,
          422,
          'Maydon ushbu savdo markaziga tegishli emas',
          { [item.fieldId]: 'Noma’lum maydon' },
        );
      }
      if (seen.has(item.fieldId)) {
        throw new AppException(
          ERROR_CODE.TRADE_CENTER_FIELD_INVALID,
          422,
          'Maydon ikki marta yuborilgan',
          { [item.fieldId]: 'Takroriy maydon' },
        );
      }
      seen.add(item.fieldId);
    }

    const valueByFieldId = new Map(submitted.map((item) => [item.fieldId, item.value]));

    // 4. Every required field must be present and non-empty.
    for (const field of center.fields) {
      const value = valueByFieldId.get(field.id);
      if (field.required && (value === undefined || value.trim() === '')) {
        throw new AppException(
          ERROR_CODE.TRADE_CENTER_FIELD_INVALID,
          422,
          'Majburiy maydon to‘ldirilmagan',
          { [field.id]: `${field.label} majburiy` },
        );
      }
    }

    // 5. Every NUMBER-typed value must be numeric (empty optional values are left as-is).
    for (const item of submitted) {
      const field = fieldsById.get(item.fieldId);
      if (
        field !== undefined &&
        field.type === TradeCenterFieldType.NUMBER &&
        item.value.trim() !== '' &&
        Number.isNaN(Number(item.value.trim()))
      ) {
        throw new AppException(
          ERROR_CODE.TRADE_CENTER_FIELD_INVALID,
          422,
          'Qiymat raqamli bo‘lishi kerak',
          { [item.fieldId]: `${field.label} raqamli bo‘lishi kerak` },
        );
      }
    }

    return { tradeCenterId: center.id, tradeCenterFields: submitted };
  }

  /** Loads a branch after ownership is checked, enforcing existence within the business (404). */
  private async loadOwnedBranch(
    user: AuthenticatedUser,
    businessId: string,
    branchId: string,
  ): Promise<Branch> {
    await this.assertBusinessOwned(user, businessId);
    const branch = await this.branches.findById(branchId);
    if (branch === null || branch.businessId !== businessId) {
      throw AppException.notFound(ERROR_CODE.BRANCH_NOT_FOUND, 'Filial topilmadi');
    }
    return branch;
  }
}
