import { Prisma } from '@prisma/client';
import { TradeCenterFieldType } from '../../trade-centers/domain/enums/trade-center-field-type.enum';
import { CreateBranchData, UpdateBranchData } from '../domain/branches.repository';
import {
  Branch,
  BranchLocation,
  DeliveryZone,
  WorkingHours,
} from '../domain/entities/branch.entity';
import { DayOfWeek } from '../domain/enums/day-of-week.enum';

/**
 * The relations a branch is read with: its trade center and its field values (each with the field
 * definition, for label/type). Reused by every read query so the mapper always has what it needs.
 */
export const BRANCH_INCLUDE = {
  tradeCenter: true,
  tradeCenterFieldValues: { include: { field: true } },
} satisfies Prisma.BranchInclude;

type BranchRowWithRelations = Prisma.BranchGetPayload<{ include: typeof BRANCH_INCLUDE }>;

/**
 * Maps between the Branch Prisma row and the domain entity. The flattened location columns are
 * gathered into {@link BranchLocation}, and the `working_hours` / `delivery_zone` JSONB columns are
 * normalised to typed values both ways. The `geo_point` PostGIS column is kept in sync with lat/lng
 * by the DB trigger `branches_set_geo_point` — Prisma neither reads nor writes its Unsupported type.
 */
export class BranchMapper {
  static toDomain(row: BranchRowWithRelations): Branch {
    return {
      id: row.id,
      businessId: row.businessId,
      name: row.name,
      phone: row.phone,
      location: {
        regionId: row.regionId,
        districtId: row.districtId,
        address: row.address,
        landmark: row.landmark,
        entranceNote: row.entranceNote,
        lat: row.lat,
        lng: row.lng,
        geohash: row.geohash,
        mapUrl: row.mapUrl,
        metroStation: row.metroStation,
      },
      workingHours: toWorkingHours(row.workingHours),
      deliveryZone: toDeliveryZone(row.deliveryZone),
      isActive: row.isActive,
      tradeCenter:
        row.tradeCenter === null ? null : { id: row.tradeCenter.id, name: row.tradeCenter.name },
      tradeCenterFields: [...row.tradeCenterFieldValues]
        .sort((a, b) => a.field.sortOrder - b.field.sortOrder)
        .map((value) => ({
          label: value.field.label,
          type: TradeCenterFieldType[value.field.type],
          value: value.value,
        })),
    };
  }

  static toCreateData(data: CreateBranchData): Prisma.BranchUncheckedCreateInput {
    return {
      businessId: data.businessId,
      name: data.name,
      phone: data.phone,
      ...locationColumns(data.location),
      workingHours: workingHoursToJson(data.workingHours),
      deliveryZone: deliveryZoneToJson(data.deliveryZone),
      isActive: data.isActive,
      tradeCenterId: data.tradeCenterId,
    };
  }

  static toUpdateData(data: UpdateBranchData): Prisma.BranchUncheckedUpdateInput {
    return {
      name: data.name,
      phone: data.phone,
      ...locationColumns(data.location),
      workingHours: workingHoursToJson(data.workingHours),
      deliveryZone: deliveryZoneToJson(data.deliveryZone),
      isActive: data.isActive,
      tradeCenterId: data.tradeCenterId,
    };
  }
}

/** Flattens a domain location into its branch columns. `geohash` is server-computed in the service. */
function locationColumns(location: BranchLocation): {
  regionId: string;
  districtId: string;
  address: string;
  landmark: string | null;
  entranceNote: string | null;
  lat: number;
  lng: number;
  geohash: string | null;
  mapUrl: string | null;
  metroStation: string | null;
} {
  return {
    regionId: location.regionId,
    districtId: location.districtId,
    address: location.address,
    landmark: location.landmark,
    entranceNote: location.entranceNote,
    lat: location.lat,
    lng: location.lng,
    geohash: location.geohash,
    mapUrl: location.mapUrl,
    metroStation: location.metroStation,
  };
}

/** Reads the JSONB `working_hours` column into typed values; malformed entries are dropped. */
function toWorkingHours(value: Prisma.JsonValue | null): WorkingHours[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const days = Object.values(DayOfWeek) as string[];
  return value.flatMap((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.day !== 'string' || !days.includes(obj.day)) {
      return [];
    }
    return [
      {
        day: obj.day as DayOfWeek,
        open: typeof obj.open === 'string' ? obj.open : null,
        close: typeof obj.close === 'string' ? obj.close : null,
        isClosed: obj.isClosed === true,
      },
    ];
  });
}

/** Serialises typed working hours to the JSONB column. */
function workingHoursToJson(hours: WorkingHours[]): Prisma.InputJsonValue {
  return hours.map((hour) => ({
    day: hour.day,
    open: hour.open,
    close: hour.close,
    isClosed: hour.isClosed,
  }));
}

/** Reads the JSONB `delivery_zone` column into a typed value; unknown/absent shapes become null. */
function toDeliveryZone(value: Prisma.JsonValue | null): DeliveryZone | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  return {
    enabled: obj.enabled === true,
    radiusMeters: typeof obj.radiusMeters === 'number' ? obj.radiusMeters : null,
    minOrderAmount: typeof obj.minOrderAmount === 'number' ? obj.minOrderAmount : null,
    deliveryFee: typeof obj.deliveryFee === 'number' ? obj.deliveryFee : null,
    freeDeliveryFrom: typeof obj.freeDeliveryFrom === 'number' ? obj.freeDeliveryFrom : null,
  };
}

/** Serialises the delivery zone to the JSONB column; `null` clears it (SQL NULL). */
function deliveryZoneToJson(
  zone: DeliveryZone | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (zone === null) {
    return Prisma.DbNull;
  }
  return {
    enabled: zone.enabled,
    radiusMeters: zone.radiusMeters,
    minOrderAmount: zone.minOrderAmount,
    deliveryFee: zone.deliveryFee,
    freeDeliveryFrom: zone.freeDeliveryFrom,
  };
}
