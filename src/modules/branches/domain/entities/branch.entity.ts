import { DayOfWeek } from '../enums/day-of-week.enum';

/**
 * A branch's location (LocationDto — flattened onto the branch row). `geohash` is server-computed
 * (7 chars) and never accepted from the client.
 */
export interface BranchLocation {
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
}

/** One day's opening hours (stored inside the `working_hours` JSONB array). */
export interface WorkingHours {
  day: DayOfWeek;
  open: string | null;
  close: string | null;
  isClosed: boolean;
}

/** Optional delivery configuration (stored as the `delivery_zone` JSONB column). */
export interface DeliveryZone {
  enabled: boolean;
  radiusMeters: number | null;
  minOrderAmount: number | null;
  deliveryFee: number | null;
  freeDeliveryFrom: number | null;
}

/**
 * A branch of a business. Pure domain type — the presentation layer projects it to BranchDto and
 * the infrastructure layer maps it from the Prisma row.
 */
export interface Branch {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  location: BranchLocation;
  workingHours: WorkingHours[];
  deliveryZone: DeliveryZone | null;
  isActive: boolean;
}
