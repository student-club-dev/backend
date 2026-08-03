import type {
  JobDetails,
  RentalDetails,
  ServiceDetails,
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
  WorkShift,
} from '../domain/enums/detail.enums';
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';
import { validRental } from '../domain/validation/listing.fixture';
import { buildSearchText, parseDetails, toDetailColumns } from './student-listing.mapper';

const rental: RentalDetails = {
  kind: StudentListingKind.RENTAL,
  propertyType: PropertyType.APARTMENT,
  roomCount: 3,
  currentTenants: 2,
  neededTenants: 1,
  gender: TenantGender.MALE,
  period: RentPeriod.MONTHLY,
  utilitiesIncluded: false,
  depositMonths: 1,
  floor: 4,
  totalFloors: 9,
  amenities: ['WIFI', 'NEAR_METRO'],
  availableFrom: new Date('2026-08-15T00:00:00Z'),
};

const task: TaskDetails = {
  kind: StudentListingKind.TASK,
  category: TaskCategory.EXACT,
  typeKey: 'MATH',
  customTypeName: null,
  deadline: new Date('2026-08-14T18:00:00Z'),
  format: TaskFormat.ONLINE,
  volume: '12 ta masala',
};

const service: ServiceDetails = {
  kind: StudentListingKind.SERVICE,
  serviceType: ServiceType.TUTOR,
  fields: { subject: 'IELTS', targetBand: '7.0' },
  format: ServiceFormat.HYBRID,
  experienceYears: 3,
  workingHours: '09:00 — 21:00',
  hasHomeVisit: false,
  hasFreeTrial: true,
};

const job: JobDetails = {
  kind: StudentListingKind.JOB,
  employment: EmploymentType.DAILY,
  categoryKey: 'COURIER',
  companyName: 'Express Delivery',
  shift: WorkShift.MORNING,
  schedule: { days: [], startTime: '08:00', endTime: '17:00', hoursPerDay: 8 },
  payPeriod: PayPeriod.DAILY,
  vacancies: 3,
  gender: null,
  experience: ExperienceLevel.NONE,
  ageFrom: 18,
  ageTo: 30,
  requirements: ['Haydovchilik guvohnomasi'],
  benefits: ['Tushlik bepul'],
  workDate: new Date('2026-08-05T00:00:00Z'),
  payoutNote: null,
};

/** Simulates the JSONB round-trip: Dates become ISO strings, everything else survives as-is. */
function throughJsonb(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe('toDetailColumns', () => {
  it('promotes RENTAL filter fields and leaves every other kind null', () => {
    const columns = toDetailColumns(rental);

    expect(columns.rentalGender).toBe('MALE');
    expect(columns.rentalPropertyType).toBe('APARTMENT');
    expect(columns.rentalRoomCount).toBe(3);
    expect(columns.rentalNeededTenants).toBe(1);

    expect(columns.taskDeadline).toBeNull();
    expect(columns.jobCategoryKey).toBeNull();
    expect(columns.serviceType).toBeNull();
  });

  it('promotes TASK filter fields, keeping the deadline a Date', () => {
    const columns = toDetailColumns(task);

    expect(columns.taskCategory).toBe('EXACT');
    expect(columns.taskTypeKey).toBe('MATH');
    expect(columns.taskFormat).toBe('ONLINE');
    // The DEADLINE sort orders on this column, so it has to stay a real timestamp.
    expect(columns.taskDeadline).toEqual(new Date('2026-08-14T18:00:00Z'));
    expect(columns.rentalGender).toBeNull();
  });

  it('promotes SERVICE filter fields', () => {
    const columns = toDetailColumns(service);

    expect(columns.serviceType).toBe('TUTOR');
    expect(columns.serviceFormat).toBe('HYBRID');
    expect(columns.serviceHasFreeTrial).toBe(true);
    expect(columns.jobShift).toBeNull();
  });

  it('promotes JOB filter fields', () => {
    const columns = toDetailColumns(job);

    expect(columns.jobEmployment).toBe('DAILY');
    expect(columns.jobCategoryKey).toBe('COURIER');
    expect(columns.jobShift).toBe('MORNING');
    expect(columns.jobExperience).toBe('NONE');
    expect(columns.taskCategory).toBeNull();
  });

  it('always returns the full column set, so a new column cannot be silently skipped', () => {
    const keys = Object.keys(toDetailColumns(task)).sort();
    expect(Object.keys(toDetailColumns(rental)).sort()).toEqual(keys);
    expect(Object.keys(toDetailColumns(service)).sort()).toEqual(keys);
    expect(Object.keys(toDetailColumns(job)).sort()).toEqual(keys);
    expect(keys).toHaveLength(15);
  });
});

describe('parseDetails', () => {
  it.each([
    ['RENTAL', StudentListingKind.RENTAL, rental],
    ['TASK', StudentListingKind.TASK, task],
    ['SERVICE', StudentListingKind.SERVICE, service],
    ['JOB', StudentListingKind.JOB, job],
  ])('round-trips %s through JSONB', (_label, kind, original) => {
    expect(parseDetails(kind, throughJsonb(original))).toEqual(original);
  });

  it('fills a bare draft with nulls rather than throwing', () => {
    // A DRAFT is saved with `{ kind }` and nothing else (§6.1), so reading one back must work.
    expect(parseDetails(StudentListingKind.RENTAL, { kind: 'RENTAL' })).toEqual({
      kind: StudentListingKind.RENTAL,
      propertyType: null,
      roomCount: null,
      currentTenants: null,
      neededTenants: null,
      gender: null,
      period: null,
      utilitiesIncluded: false,
      depositMonths: null,
      floor: null,
      totalFloors: null,
      amenities: [],
      availableFrom: null,
    });
  });

  it('drops a value that is not a member of its enum', () => {
    const parsed = parseDetails(StudentListingKind.RENTAL, {
      kind: 'RENTAL',
      gender: 'ROBOT',
      roomCount: 'three',
    }) as RentalDetails;

    expect(parsed.gender).toBeNull();
    expect(parsed.roomCount).toBeNull();
  });

  it('keeps only string members of a string array', () => {
    const parsed = parseDetails(StudentListingKind.RENTAL, {
      kind: 'RENTAL',
      amenities: ['WIFI', 42, null, 'BALCONY'],
    }) as RentalDetails;

    expect(parsed.amenities).toEqual(['WIFI', 'BALCONY']);
  });

  it('reads a JOB schedule, defaulting a missing one', () => {
    const parsed = parseDetails(StudentListingKind.JOB, { kind: 'JOB' }) as JobDetails;

    expect(parsed.schedule).toEqual({
      days: [],
      startTime: null,
      endTime: null,
      hoursPerDay: null,
    });
  });
});

describe('buildSearchText', () => {
  it('includes the title, description, addresses and catalog keys', () => {
    const listing = validRental({
      title: 'Chilonzorda sherik kerak',
      description: 'Metrodan 5 daqiqa',
      details: { ...rental },
    });

    const text = buildSearchText(listing);

    expect(text).toContain('Chilonzorda sherik kerak');
    expect(text).toContain('Metrodan 5 daqiqa');
    expect(text).toContain('Chilonzor 9-kvartal');
    expect(text).toContain('APARTMENT');
    expect(text).toContain('NEAR_METRO');
  });

  it('skips nulls instead of emitting the word "null"', () => {
    const text = buildSearchText(validRental({ description: null }));
    expect(text).not.toContain('null');
  });
});
