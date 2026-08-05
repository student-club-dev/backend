import { StudentPriceUnit } from '../domain/enums/student-price-unit.enum';
import { ListingAudience } from '../domain/enums/listing-audience.enum';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { Prisma } from '@prisma/client';
import type { StudentListingBranch } from '../domain/entities/student-listing-branch.entity';
import type {
  JobDetails,
  JobSchedule,
  ListingOptionGroup,
  RentalDetails,
  ServiceDetails,
  StudentListing,
  StudentListingDetails,
  TaskDetails,
} from '../domain/entities/student-listing.entity';
import {
  EmploymentType,
  ExperienceLevel,
  PayPeriod,
  PropertyType,
  RentPeriod,
  ServiceFormat,
  ServiceType,
  TaskCategory,
  TaskFormat,
  TenantGender,
  WeekDay,
  WorkShift,
} from '../domain/enums/detail.enums';
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';

/**
 * The flat columns denormalised out of `details` (spec §2). `details` stays the source of truth;
 * these exist only so search can filter and sort on an index instead of probing jsonb per row.
 */
export interface DetailColumns {
  rentalGender: string | null;
  rentalPropertyType: string | null;
  rentalRoomCount: number | null;
  rentalNeededTenants: number | null;
  serviceType: string | null;
  serviceFormat: string | null;
  serviceHasFreeTrial: boolean | null;
  jobEmployment: string | null;
  jobCategoryKey: string | null;
  jobShift: string | null;
  jobExperience: string | null;
  taskCategory: string | null;
  taskTypeKey: string | null;
  taskFormat: string | null;
  taskDeadline: Date | null;
}

/**
 * Every column null. Each kind spreads this and overrides only its own, so adding a column to the
 * interface forces it to appear here — it can never be silently left unwritten for three kinds.
 */
const NO_DETAIL_COLUMNS: DetailColumns = {
  rentalGender: null,
  rentalPropertyType: null,
  rentalRoomCount: null,
  rentalNeededTenants: null,
  serviceType: null,
  serviceFormat: null,
  serviceHasFreeTrial: null,
  jobEmployment: null,
  jobCategoryKey: null,
  jobShift: null,
  jobExperience: null,
  taskCategory: null,
  taskTypeKey: null,
  taskFormat: null,
  taskDeadline: null,
};

/** Promotes the filterable fields of `details` into flat columns. */
export function toDetailColumns(details: StudentListingDetails): DetailColumns {
  switch (details.kind) {
    case StudentListingKind.RENTAL:
      return {
        ...NO_DETAIL_COLUMNS,
        rentalGender: details.gender,
        rentalPropertyType: details.propertyType,
        rentalRoomCount: details.roomCount,
        rentalNeededTenants: details.neededTenants,
      };
    case StudentListingKind.SERVICE:
      return {
        ...NO_DETAIL_COLUMNS,
        serviceType: details.serviceType,
        serviceFormat: details.format,
        serviceHasFreeTrial: details.hasFreeTrial,
      };
    case StudentListingKind.JOB:
      return {
        ...NO_DETAIL_COLUMNS,
        jobEmployment: details.employment,
        jobCategoryKey: details.categoryKey,
        jobShift: details.shift,
        jobExperience: details.experience,
      };
    case StudentListingKind.TASK:
      return {
        ...NO_DETAIL_COLUMNS,
        taskCategory: details.category,
        taskTypeKey: details.typeKey,
        taskFormat: details.format,
        taskDeadline: details.deadline,
      };
  }
}

/**
 * Reads `details` back out of JSONB into the typed union.
 *
 * Every field is read defensively and defaults to null. That is not paranoia about the database:
 * a DRAFT is stored as `{ kind }` with nothing else (§6.1), so a missing field is the normal case,
 * and throwing would make half-filled drafts unreadable.
 */
export function parseDetails(kind: StudentListingKind, raw: unknown): StudentListingDetails {
  const source = isRecord(raw) ? raw : {};

  switch (kind) {
    case StudentListingKind.RENTAL:
      return {
        kind: StudentListingKind.RENTAL,
        propertyType: readEnum(source, 'propertyType', Object.values(PropertyType)),
        roomCount: readNumber(source, 'roomCount'),
        currentTenants: readNumber(source, 'currentTenants'),
        neededTenants: readNumber(source, 'neededTenants'),
        gender: readEnum(source, 'gender', Object.values(TenantGender)),
        period: readEnum(source, 'period', Object.values(RentPeriod)),
        utilitiesIncluded: readBoolean(source, 'utilitiesIncluded'),
        depositMonths: readNumber(source, 'depositMonths'),
        floor: readNumber(source, 'floor'),
        totalFloors: readNumber(source, 'totalFloors'),
        amenities: readStringArray(source, 'amenities'),
        availableFrom: readDate(source, 'availableFrom'),
      } satisfies RentalDetails;

    case StudentListingKind.SERVICE:
      return {
        kind: StudentListingKind.SERVICE,
        serviceType: readEnum(source, 'serviceType', Object.values(ServiceType)),
        fields: readStringMap(source, 'fields'),
        format: readEnum(source, 'format', Object.values(ServiceFormat)),
        experienceYears: readNumber(source, 'experienceYears'),
        workingHours: readString(source, 'workingHours'),
        hasHomeVisit: readBoolean(source, 'hasHomeVisit'),
        hasFreeTrial: readBoolean(source, 'hasFreeTrial'),
      } satisfies ServiceDetails;

    case StudentListingKind.JOB:
      return {
        kind: StudentListingKind.JOB,
        employment: readEnum(source, 'employment', Object.values(EmploymentType)),
        categoryKey: readString(source, 'categoryKey'),
        companyName: readString(source, 'companyName'),
        shift: readEnum(source, 'shift', Object.values(WorkShift)),
        schedule: readSchedule(source),
        payPeriod: readEnum(source, 'payPeriod', Object.values(PayPeriod)),
        vacancies: readNumber(source, 'vacancies'),
        gender: readEnum(source, 'gender', Object.values(TenantGender)),
        experience: readEnum(source, 'experience', Object.values(ExperienceLevel)),
        ageFrom: readNumber(source, 'ageFrom'),
        ageTo: readNumber(source, 'ageTo'),
        requirements: readStringArray(source, 'requirements'),
        benefits: readStringArray(source, 'benefits'),
        workDate: readDate(source, 'workDate'),
        payoutNote: readString(source, 'payoutNote'),
      } satisfies JobDetails;

    case StudentListingKind.TASK:
      return {
        kind: StudentListingKind.TASK,
        category: readEnum(source, 'category', Object.values(TaskCategory)),
        typeKey: readString(source, 'typeKey'),
        customTypeName: readString(source, 'customTypeName'),
        deadline: readDate(source, 'deadline'),
        format: readEnum(source, 'format', Object.values(TaskFormat)),
        volume: readString(source, 'volume'),
      } satisfies TaskDetails;
  }
}

/**
 * The full-text haystack. The DB trigger turns it into `search_vector`, so anything a student
 * might type when hunting for this listing belongs here — including catalog keys, which the
 * client shows as labels but which are what actually distinguishes one listing from another.
 */
export function buildSearchText(listing: StudentListing): string {
  const parts: (string | null)[] = [
    listing.title,
    listing.description,
    ...listing.branches.flatMap((branch) => [branch.address, branch.name, branch.landmark]),
    ...detailSearchParts(listing.details),
  ];

  return parts.filter((part): part is string => part !== null && part.trim().length > 0).join(' ');
}

function detailSearchParts(details: StudentListingDetails): (string | null)[] {
  switch (details.kind) {
    case StudentListingKind.RENTAL:
      return [details.propertyType, details.gender, ...details.amenities];
    case StudentListingKind.SERVICE:
      return [details.serviceType, details.format, ...Object.values(details.fields)];
    case StudentListingKind.JOB:
      return [details.categoryKey, details.companyName, details.employment, details.shift];
    case StudentListingKind.TASK:
      return [details.category, details.typeKey, details.customTypeName, details.volume];
  }
}

// --- typed readers -----------------------------------------------------------------------------
// Narrow `unknown` without ever reaching for `any`. Anything of the wrong shape reads as absent,
// which is exactly how a not-yet-filled draft field behaves.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true;
}

function readDate(source: Record<string, unknown>, key: string): Date | null {
  const value = source[key];
  if (value instanceof Date) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readStringArray(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readStringMap(source: Record<string, unknown>, key: string): Record<string, string> {
  const value = source[key];
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue === 'string') {
      result[entryKey] = entryValue;
    }
  }
  return result;
}

function readEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = source[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function readSchedule(source: Record<string, unknown>): JobSchedule {
  const raw = source.schedule;
  const schedule = isRecord(raw) ? raw : {};
  return {
    days: readStringArray(schedule, 'days').filter((day): day is WeekDay =>
      (Object.values(WeekDay) as string[]).includes(day),
    ),
    startTime: readString(schedule, 'startTime'),
    endTime: readString(schedule, 'endTime'),
    hoursPerDay: readNumber(schedule, 'hoursPerDay'),
  };
}

/** Option groups are stored as JSONB and never filtered on, so they read back structurally. */
export function parseOptionGroups(raw: unknown): ListingOptionGroup[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isRecord).map((group) => ({
    name: readString(group, 'name') ?? '',
    selectionType: group.selectionType === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE',
    isRequired: readBoolean(group, 'isRequired'),
    options: (Array.isArray(group.options) ? group.options : []).filter(isRecord).map((option) => ({
      name: readString(option, 'name') ?? '',
      priceDelta: readNumber(option, 'priceDelta') ?? 0,
      isAvailable: option.isAvailable !== false,
    })),
  }));
}

/** Free-form string→string attributes (§2.2). */
export function parseAttributes(raw: unknown): Record<string, string> {
  return readStringMap({ attributes: raw }, 'attributes');
}

/** Maps a persisted pin row to the domain type. */
export function toBranchEntity(row: {
  id: string;
  lat: number;
  lng: number;
  address: string;
  name: string | null;
  landmark: string | null;
  regionId: string | null;
  districtId: string | null;
}): StudentListingBranch {
  return {
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    name: row.name,
    landmark: row.landmark,
    regionId: row.regionId,
    districtId: row.districtId,
  };
}

/** The row shape both repositories read: the listing plus its branches. */
export const STUDENT_LISTING_INCLUDE = { branches: { orderBy: { createdAt: 'asc' } } } as const;

export type StudentListingRow = Prisma.StudentListingGetPayload<{
  include: typeof STUDENT_LISTING_INCLUDE;
}>;

/**
 * Prisma row -> domain entity.
 *
 * Exported rather than kept private on the owner-facing repository because the admin read
 * repository returns the same entity from the same table. Two copies of this would drift the first
 * time a column is added, and the drift would be invisible: both would compile.
 */
export function toListingEntity(row: StudentListingRow): StudentListing {
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind: row.kind as StudentListingKind,
    title: row.title,
    description: row.description,
    images: row.images,
    priceUnit: row.priceUnit === null ? null : (row.priceUnit as StudentPriceUnit),
    // BigInt is how Postgres stores so'm; the wire contract is a plain integer.
    price: Number(row.price),
    priceMax: row.priceMax === null ? null : Number(row.priceMax),
    currency: row.currency,
    isNegotiable: row.isNegotiable,
    contactPhone: row.contactPhone,
    universityId: row.universityId,
    audience: row.audience as ListingAudience,
    branches: row.branches.map(toBranchEntity),
    validFrom: row.validFrom,
    validTo: row.validTo,
    attributes: parseAttributes(row.attributes),
    optionGroups: parseOptionGroups(row.optionGroups),
    details: parseDetails(row.kind as StudentListingKind, row.details),
    status: row.status as ListingStatus,
    rejectionReason: row.rejectionReason,
    viewsCount: row.viewsCount,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
