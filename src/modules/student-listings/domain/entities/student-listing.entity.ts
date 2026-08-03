import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';
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
} from '../enums/detail.enums';
import { ListingAudience } from '../enums/listing-audience.enum';
import { StudentListingKind } from '../enums/student-listing-kind.enum';
import { StudentPriceUnit } from '../enums/student-price-unit.enum';
import { StudentListingBranch } from './student-listing-branch.entity';

/**
 * Every kind-specific field below is nullable, which looks lax but is the point: a DRAFT saves
 * without validation (§6.1), so the entity has to be able to hold a half-filled form. Presence is
 * enforced at publish time by `validateForPublish`, not by the type.
 */

/** §4.1 — a piece of coursework the student needs done. A request, not an offer. */
export interface TaskDetails {
  kind: StudentListingKind.TASK;
  category: TaskCategory | null;
  /** Key within the category, e.g. REFERAT. `OTHER` pairs with `customTypeName`. */
  typeKey: string | null;
  customTypeName: string | null;
  deadline: Date | null;
  format: TaskFormat | null;
  /** Free text, e.g. "20 bet" — optional but the single most useful hint for a bidder. */
  volume: string | null;
}

/** §4.2 — a room, bed or flat, usually looking for a flatmate. */
export interface RentalDetails {
  kind: StudentListingKind.RENTAL;
  propertyType: PropertyType | null;
  roomCount: number | null;
  /** 0 means the place is empty. */
  currentTenants: number | null;
  neededTenants: number | null;
  gender: TenantGender | null;
  period: RentPeriod | null;
  utilitiesIncluded: boolean;
  /** Null means no deposit. */
  depositMonths: number | null;
  floor: number | null;
  totalFloors: number | null;
  /** Keys from RENTAL_AMENITY_KEYS. */
  amenities: string[];
  /** Null means available now. */
  availableFrom: Date | null;
}

/** §4.3 — an ongoing offer: tutoring, printing, repairs. */
export interface ServiceDetails {
  kind: StudentListingKind.SERVICE;
  serviceType: ServiceType | null;
  /**
   * Domain-specific answers, keyed by the catalog's field keys (`subject`, `level`, `targetBand`…).
   * Free-form string→string because the catalog is data, not code: a new domain must not need a
   * schema change. Validated against ServiceCatalog.kt once the mobile team sends it.
   */
  fields: Record<string, string>;
  format: ServiceFormat | null;
  experienceYears: number | null;
  workingHours: string | null;
  hasHomeVisit: boolean;
  hasFreeTrial: boolean;
}

/** The weekly pattern of a job (§4.4). Times are "HH:mm" strings, as the client sends them. */
export interface JobSchedule {
  days: WeekDay[];
  startTime: string | null;
  endTime: string | null;
  hoursPerDay: number | null;
}

/** §4.4 — a vacancy, daily or permanent. */
export interface JobDetails {
  kind: StudentListingKind.JOB;
  employment: EmploymentType | null;
  /** Key from JOB_CATEGORY_KEYS. */
  categoryKey: string | null;
  companyName: string | null;
  shift: WorkShift | null;
  schedule: JobSchedule;
  payPeriod: PayPeriod | null;
  vacancies: number | null;
  /** Null means it does not matter who applies. */
  gender: TenantGender | null;
  experience: ExperienceLevel | null;
  ageFrom: number | null;
  ageTo: number | null;
  requirements: string[];
  benefits: string[];
  /** Required for DAILY, null for PERMANENT. */
  workDate: Date | null;
  payoutNote: string | null;
}

/**
 * Discriminated on `kind`, matching the client's `classDiscriminator = "kind"`. `details.kind`
 * always equals the listing's own `kind`; a mismatch is rejected as LISTING_KIND_MISMATCH.
 */
export type StudentListingDetails = TaskDetails | RentalDetails | ServiceDetails | JobDetails;

/** One choice inside an option group. `priceDelta` may be negative (§2.5). */
export interface ListingOption {
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

/** §2.5 — an add-on chooser, mostly for SERVICE ("60 daqiqa +0 / 90 daqiqa +30 000"). */
export interface ListingOptionGroup {
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  isRequired: boolean;
  options: ListingOption[];
}

/** A student-posted advertisement (§2.2). Money is integer so'm; there are no decimals. */
export interface StudentListing {
  id: string;
  ownerId: string;
  /** Fixed at creation — a PATCH that changes it is rejected with LISTING_KIND_IMMUTABLE. */
  kind: StudentListingKind;
  title: string;
  description: string | null;
  /** First image is the cover. At most 5. */
  images: string[];
  priceUnit: StudentPriceUnit | null;
  price: number;
  /** Upper bound of a range ("3–5 mln"); must exceed `price` when present. */
  priceMax: number | null;
  currency: string;
  isNegotiable: boolean;
  contactPhone: string | null;
  universityId: string | null;
  audience: ListingAudience;
  branches: StudentListingBranch[];
  validFrom: Date | null;
  validTo: Date | null;
  attributes: Record<string, string>;
  optionGroups: ListingOptionGroup[];
  details: StudentListingDetails;
  status: ListingStatus;
  /** Contract parity only — Phase 1 has no moderation, so nothing ever writes this. */
  rejectionReason: string | null;
  viewsCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
