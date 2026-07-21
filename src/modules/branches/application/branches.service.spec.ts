import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { encodeGeohash } from '../../../common/utils/geohash.util';
import { BusinessReadRepository } from '../../business/domain/business-read.repository';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { District } from '../../geo/domain/entities/district.entity';
import { GeoRepository } from '../../geo/domain/geo.repository';
import { TradeCenterWithFields } from '../../trade-centers/domain/entities/trade-center.entity';
import { TradeCenterFieldType } from '../../trade-centers/domain/enums/trade-center-field-type.enum';
import { TradeCenterRepository } from '../../trade-centers/domain/trade-center.repository';
import { BranchRepository } from '../domain/branches.repository';
import { Branch } from '../domain/entities/branch.entity';
import { DayOfWeek } from '../domain/enums/day-of-week.enum';
import { BranchInput } from './branches.io';
import { BranchesService } from './branches.service';

const owner: AuthenticatedUser = { id: 'owner-1', type: AccountType.BUSINESS };

function branch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'br-1',
    businessId: 'biz-1',
    name: 'Chilonzor filiali',
    phone: null,
    location: {
      regionId: 'TOSHKENT_SHAHRI',
      districtId: 'CHILONZOR',
      address: 'Chilonzor 9-kvartal, 42-uy',
      landmark: null,
      entranceNote: null,
      lat: 41.2856,
      lng: 69.2034,
      geohash: null,
      mapUrl: null,
      metroStation: null,
    },
    workingHours: [{ day: DayOfWeek.MON, open: '09:00', close: '23:00', isClosed: false }],
    deliveryZone: null,
    isActive: true,
    tradeCenter: null,
    tradeCenterFields: [],
    ...overrides,
  };
}

function createInput(overrides: Partial<BranchInput> = {}): BranchInput {
  return {
    name: 'Chilonzor filiali',
    phone: null,
    location: branch().location,
    workingHours: branch().workingHours,
    deliveryZone: null,
    isActive: true,
    tradeCenterId: null,
    tradeCenterFields: [],
    ...overrides,
  };
}

function makeBranches(overrides: Partial<BranchRepository> = {}): BranchRepository {
  return {
    create: jest.fn(async (data) => branch({ businessId: data.businessId, name: data.name })),
    findById: jest.fn().mockResolvedValue(null),
    findManyByBusiness: jest.fn().mockResolvedValue([]),
    update: jest.fn(async (id, data) => branch({ id, name: data.name })),
    delete: jest.fn().mockResolvedValue(undefined),
    existsWithinRadius: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
}

function makeBusinesses(ownerId: string | null): BusinessReadRepository {
  return {
    findSummaryById: jest.fn().mockResolvedValue(
      ownerId === null
        ? null
        : {
            id: 'biz-1',
            ownerId,
            type: 'CLOTHING',
            status: BusinessStatus.APPROVED,
            isOnlineOnly: false,
          },
    ),
  };
}

/** District matching the default branch location, centred on its point (passes §6.6 rules 2-3). */
function district(overrides: Partial<District> = {}): District {
  return {
    id: 'CHILONZOR',
    regionId: 'TOSHKENT_SHAHRI',
    nameUz: 'Chilonzor',
    nameRu: null,
    centerLat: 41.2856,
    centerLng: 69.2034,
    ...overrides,
  };
}

function makeGeo(districts: District[] = [district()]): GeoRepository {
  return {
    findRegions: jest.fn().mockResolvedValue([]),
    findDistricts: jest.fn().mockResolvedValue([]),
    findDistrictsByRegion: jest.fn().mockResolvedValue(districts),
    regionExists: jest.fn().mockResolvedValue(true),
  };
}

/** Abu Saxiy: one required TEXT field (Qator) and one optional NUMBER field (Qavat). */
function tradeCenter(overrides: Partial<TradeCenterWithFields> = {}): TradeCenterWithFields {
  return {
    id: 'tc_abusaxiy',
    name: 'Abu Saxiy',
    slug: 'abu-saxiy',
    fields: [
      {
        id: 'f_qator',
        label: 'Qator',
        type: TradeCenterFieldType.TEXT,
        required: true,
        sortOrder: 0,
      },
      {
        id: 'f_qavat',
        label: 'Qavat',
        type: TradeCenterFieldType.NUMBER,
        required: false,
        sortOrder: 1,
      },
    ],
    ...overrides,
  };
}

function makeTradeCenters(
  center: TradeCenterWithFields | null = tradeCenter(),
): TradeCenterRepository {
  return {
    findActive: jest.fn().mockResolvedValue([]),
    findActiveByIdWithFields: jest.fn().mockResolvedValue(center),
  };
}

function makeService(
  branches: BranchRepository,
  businesses: BusinessReadRepository,
  geo: GeoRepository = makeGeo(),
  tradeCenters: TradeCenterRepository = makeTradeCenters(),
): BranchesService {
  return new BranchesService(branches, businesses, geo, tradeCenters);
}

describe('BranchesService', () => {
  describe('list', () => {
    it('returns the branches of a business the caller owns', async () => {
      const branches = makeBranches({
        findManyByBusiness: jest.fn().mockResolvedValue([branch()]),
      });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await expect(service.list(owner, 'biz-1')).resolves.toHaveLength(1);
      expect(branches.findManyByBusiness).toHaveBeenCalledWith('biz-1');
    });

    it('throws 404 BUSINESS_NOT_FOUND when the business does not exist', async () => {
      const service = makeService(makeBranches(), makeBusinesses(null));

      await expect(service.list(owner, 'missing')).rejects.toMatchObject({
        code: ERROR_CODE.BUSINESS_NOT_FOUND,
        status: 404,
      });
    });

    it('throws 403 FORBIDDEN for another owner’s business', async () => {
      const service = makeService(makeBranches(), makeBusinesses('someone-else'));

      await expect(service.list(owner, 'biz-1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
    });
  });

  describe('create', () => {
    it('creates a branch under a business the caller owns', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('owner-1'));

      const result = await service.create(owner, 'biz-1', createInput());

      expect(result.businessId).toBe('biz-1');
      expect(branches.create).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 'biz-1', name: 'Chilonzor filiali' }),
      );
    });

    it('does not create for another owner’s business (403)', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('someone-else'));

      await expect(service.create(owner, 'biz-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(branches.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('applies the update for the owner', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await service.update(owner, 'biz-1', 'br-1', createInput({ name: 'Yunusobod filiali' }));

      expect(branches.update).toHaveBeenCalledWith(
        'br-1',
        expect.objectContaining({ name: 'Yunusobod filiali' }),
      );
    });

    it('throws 404 BRANCH_NOT_FOUND when the branch does not exist', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(null) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await expect(service.update(owner, 'biz-1', 'missing', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.BRANCH_NOT_FOUND,
        status: 404,
      });
      expect(branches.update).not.toHaveBeenCalled();
    });

    it('treats a branch of another business as not found (404)', async () => {
      const branches = makeBranches({
        findById: jest.fn().mockResolvedValue(branch({ businessId: 'other-biz' })),
      });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await expect(service.update(owner, 'biz-1', 'br-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.BRANCH_NOT_FOUND,
        status: 404,
      });
      expect(branches.update).not.toHaveBeenCalled();
    });

    it('does not update a branch under another owner’s business (403)', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const service = makeService(branches, makeBusinesses('someone-else'));

      await expect(service.update(owner, 'biz-1', 'br-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(branches.update).not.toHaveBeenCalled();
    });
  });

  describe('location rules (§6.6)', () => {
    it('rejects a coordinate outside Uzbekistan with 422 LOCATION_OUT_OF_BOUNDS', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('owner-1'));
      const input = createInput({ location: { ...branch().location, lat: 50, lng: 30 } });

      await expect(service.create(owner, 'biz-1', input)).rejects.toMatchObject({
        code: ERROR_CODE.LOCATION_OUT_OF_BOUNDS,
        status: 422,
      });
      expect(branches.create).not.toHaveBeenCalled();
    });

    it('rejects a district not in the region with 422 DISTRICT_REGION_MISMATCH', async () => {
      const branches = makeBranches();
      const geo = makeGeo([district({ id: 'YUNUSOBOD' })]);
      const service = makeService(branches, makeBusinesses('owner-1'), geo);

      await expect(service.create(owner, 'biz-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.DISTRICT_REGION_MISMATCH,
        status: 422,
      });
      expect(branches.create).not.toHaveBeenCalled();
    });

    it('rejects a point >10 km from the district centre with 422 LOCATION_DISTRICT_MISMATCH', async () => {
      const branches = makeBranches();
      // District centre in Samarqand while the point stays in Tashkent (~280 km).
      const geo = makeGeo([district({ centerLat: 39.627, centerLng: 66.975 })]);
      const service = makeService(branches, makeBusinesses('owner-1'), geo);

      await expect(service.create(owner, 'biz-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.LOCATION_DISTRICT_MISMATCH,
        status: 422,
      });
      expect(branches.create).not.toHaveBeenCalled();
    });

    it('accepts a point when the district centre is unknown (null)', async () => {
      const branches = makeBranches();
      const geo = makeGeo([district({ centerLat: null, centerLng: null })]);
      const service = makeService(branches, makeBusinesses('owner-1'), geo);

      await expect(service.create(owner, 'biz-1', createInput())).resolves.toBeDefined();
      expect(branches.create).toHaveBeenCalled();
    });

    it('rejects a duplicate location within 100 m with 409 DUPLICATE_BRANCH_LOCATION', async () => {
      const branches = makeBranches({ existsWithinRadius: jest.fn().mockResolvedValue(true) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await expect(service.create(owner, 'biz-1', createInput())).rejects.toMatchObject({
        code: ERROR_CODE.DUPLICATE_BRANCH_LOCATION,
        status: 409,
      });
      expect(branches.create).not.toHaveBeenCalled();
    });

    it('checks duplicates within 100 m of the point on create (no exclusion)', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('owner-1'));

      await service.create(owner, 'biz-1', createInput());

      expect(branches.existsWithinRadius).toHaveBeenCalledWith(
        'biz-1',
        41.2856,
        69.2034,
        100,
        undefined,
      );
    });

    it('excludes the branch itself from the duplicate check on update', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await service.update(owner, 'biz-1', 'br-1', createInput());

      expect(branches.existsWithinRadius).toHaveBeenCalledWith(
        'biz-1',
        41.2856,
        69.2034,
        100,
        'br-1',
      );
    });

    it('computes the geohash server-side and passes it to create', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('owner-1'));
      // Client-sent geohash must be ignored.
      const input = createInput({ location: { ...branch().location, geohash: 'hacked!' } });

      await service.create(owner, 'biz-1', input);

      expect(branches.create).toHaveBeenCalledWith(
        expect.objectContaining({
          location: expect.objectContaining({ geohash: encodeGeohash(41.2856, 69.2034, 7) }),
        }),
      );
    });

    it('recomputes the geohash server-side and passes it to update', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await service.update(owner, 'biz-1', 'br-1', createInput());

      expect(branches.update).toHaveBeenCalledWith(
        'br-1',
        expect.objectContaining({
          location: expect.objectContaining({ geohash: encodeGeohash(41.2856, 69.2034, 7) }),
        }),
      );
    });
  });

  describe('trade-center rules (§5)', () => {
    it('persists a valid center and its fields on create', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('owner-1'));
      const input = createInput({
        tradeCenterId: 'tc_abusaxiy',
        tradeCenterFields: [
          { fieldId: 'f_qator', value: 'A' },
          { fieldId: 'f_qavat', value: '3' },
        ],
      });

      await service.create(owner, 'biz-1', input);

      expect(branches.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tradeCenterId: 'tc_abusaxiy',
          tradeCenterFields: [
            { fieldId: 'f_qator', value: 'A' },
            { fieldId: 'f_qavat', value: '3' },
          ],
        }),
      );
    });

    it('rejects an unknown/inactive center with 422 TRADE_CENTER_NOT_FOUND', async () => {
      const branches = makeBranches();
      const service = makeService(
        branches,
        makeBusinesses('owner-1'),
        makeGeo(),
        makeTradeCenters(null),
      );
      const input = createInput({
        tradeCenterId: 'tc_missing',
        tradeCenterFields: [{ fieldId: 'f_qator', value: 'A' }],
      });

      await expect(service.create(owner, 'biz-1', input)).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_NOT_FOUND,
        status: 422,
      });
      expect(branches.create).not.toHaveBeenCalled();
    });

    it('rejects a field that does not belong to the center with 422 TRADE_CENTER_FIELD_INVALID', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('owner-1'));
      const input = createInput({
        tradeCenterId: 'tc_abusaxiy',
        tradeCenterFields: [
          { fieldId: 'f_qator', value: 'A' },
          { fieldId: 'f_foreign', value: 'X' },
        ],
      });

      await expect(service.create(owner, 'biz-1', input)).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_FIELD_INVALID,
        status: 422,
      });
      expect(branches.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate fieldId with 422 TRADE_CENTER_FIELD_INVALID', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('owner-1'));
      const input = createInput({
        tradeCenterId: 'tc_abusaxiy',
        tradeCenterFields: [
          { fieldId: 'f_qator', value: 'A' },
          { fieldId: 'f_qator', value: 'B' },
        ],
      });

      await expect(service.create(owner, 'biz-1', input)).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_FIELD_INVALID,
        status: 422,
      });
      expect(branches.create).not.toHaveBeenCalled();
    });

    it('rejects a missing required field with 422 TRADE_CENTER_FIELD_INVALID (field-level)', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('owner-1'));
      const input = createInput({
        tradeCenterId: 'tc_abusaxiy',
        tradeCenterFields: [{ fieldId: 'f_qavat', value: '3' }],
      });

      await expect(service.create(owner, 'biz-1', input)).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_FIELD_INVALID,
        status: 422,
        fields: { f_qator: expect.any(String) },
      });
      expect(branches.create).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric NUMBER value with 422 TRADE_CENTER_FIELD_INVALID', async () => {
      const branches = makeBranches();
      const service = makeService(branches, makeBusinesses('owner-1'));
      const input = createInput({
        tradeCenterId: 'tc_abusaxiy',
        tradeCenterFields: [
          { fieldId: 'f_qator', value: 'A' },
          { fieldId: 'f_qavat', value: 'abc' },
        ],
      });

      await expect(service.create(owner, 'biz-1', input)).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_FIELD_INVALID,
        status: 422,
      });
      expect(branches.create).not.toHaveBeenCalled();
    });

    it('ignores submitted fields and clears values when tradeCenterId is null on update', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const tradeCenters = makeTradeCenters();
      const service = makeService(branches, makeBusinesses('owner-1'), makeGeo(), tradeCenters);
      const input = createInput({
        tradeCenterId: null,
        tradeCenterFields: [{ fieldId: 'f_qator', value: 'A' }],
      });

      await service.update(owner, 'biz-1', 'br-1', input);

      expect(tradeCenters.findActiveByIdWithFields).not.toHaveBeenCalled();
      expect(branches.update).toHaveBeenCalledWith(
        'br-1',
        expect.objectContaining({ tradeCenterId: null, tradeCenterFields: [] }),
      );
    });
  });

  describe('delete', () => {
    it('hard-deletes the owner’s branch', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await service.delete(owner, 'biz-1', 'br-1');

      expect(branches.delete).toHaveBeenCalledWith('br-1');
    });

    it('throws 404 BRANCH_NOT_FOUND when the branch does not exist', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(null) });
      const service = makeService(branches, makeBusinesses('owner-1'));

      await expect(service.delete(owner, 'biz-1', 'missing')).rejects.toMatchObject({
        code: ERROR_CODE.BRANCH_NOT_FOUND,
        status: 404,
      });
      expect(branches.delete).not.toHaveBeenCalled();
    });

    it('does not delete a branch under another owner’s business (403)', async () => {
      const branches = makeBranches({ findById: jest.fn().mockResolvedValue(branch()) });
      const service = makeService(branches, makeBusinesses('someone-else'));

      await expect(service.delete(owner, 'biz-1', 'br-1')).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
      expect(branches.delete).not.toHaveBeenCalled();
    });
  });
});
