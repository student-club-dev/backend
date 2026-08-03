# Student Listings — Phase 1a: Foundation & Accept a Listing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student can create, edit, publish, pause, archive and delete their own listing of four kinds (`TASK`/`RENTAL`/`SERVICE`/`JOB`), and read it back — with the full §5 publish-time validation enforced server-side.

**Architecture:** New module `src/modules/student-listings/` in the standard four DDD layers, sharing nothing with the existing business-discount `listings` module. Kind-specific data lives in a JSONB `details` column (source of truth); the mapper additionally writes flat, indexable columns for the fields search will filter on. Publish validation is a pure domain function returning `field → Uzbek message`, which the service turns into a `422 LISTING_VALIDATION_FAILED` envelope.

**Tech Stack:** NestJS · TypeScript strict (no `any`) · Prisma + PostgreSQL 16 + PostGIS · Jest (`*.spec.ts`, `npm test`) · class-validator · Swagger.

**Source spec:** `docs/superpowers/specs/2026-08-03-student-listings-design.md`
**Original request:** `docs/api/mobile_questions/STUDENT_LISTINGS_BACKEND.md`

## Global Constraints

- **Never touch** `src/modules/listings/`, `src/modules/discounts/`, `src/modules/business/`, or the `listings`/`listing_branches`/`option_groups`/`options` tables. They belong to the business-discount feature. This module is independent.
- **No `any`.** TypeScript strict mode. No untyped `body`.
- **Prisma only inside `infrastructure/`.** Never imported in `application/` or `domain/`.
- **Never `throw new Error()`** — throw `AppException` (`src/common/exceptions/app.exception.ts`).
- **Never `console.log`** — use the injected Pino logger.
- Dependency direction: `presentation → application → domain ← infrastructure`.
- All user-facing `message` text is **Uzbek**. Use the repo's typographic apostrophes (`‘` and `’`), e.g. `E’lonni tekshiring`, matching existing strings like `Ma’lumotlar noto‘g‘ri`.
- Money is `BigInt` in Prisma, serialized to `Number` in JSON. `currency: "UZS"`.
- Dates are ISO-8601 UTC on the wire, `DateTime`/`timestamptz` in the DB.
- Every response goes through the existing global `BaseResponse` interceptor — **never wrap manually** in a controller.
- Route prefix is `/v1/student-listings` — **not** `/v1/listings` (taken).
- Run `npm test -- <path>` for unit tests; `npm run lint` before each commit.
- Commit after each task with a Conventional Commit message.

## Not in this plan

Search (`POST /search`, `GET ?query`) is **Phase 1b**. The EXPIRED/SCHEDULED cron is **Phase 1c**. Universities (§7.2.4), the catalog endpoint (§7.3), chat integration (§7.5) and favorites are **Phase 2**. Do not build them here.

Two spec items are knowingly partial in this phase — deferred, not forgotten:

| Item | Here | Full version |
|---|---|---|
| §6 "`viewsCount` counts once per viewer per 24h" | `viewsCount` increments on every non-owner read | Needs a `student_listing_views (listing_id, viewer_id, viewed_at)` table — Phase 1b, alongside the read paths that use it |
| §6 block/ban filtering | Enforced on `GET /{id}` | Also needs to be in the search `WHERE` clause — Phase 1b |

---

## File Structure

```
prisma/schema.prisma                                    MODIFY  enums + 2 models + Student back-relation
prisma/migrations/<ts>_student_listings/migration.sql   CREATE  generated + hand-added triggers

src/common/errors/error-code.ts                         MODIFY  10 new codes

src/modules/student-listings/
  domain/
    enums/student-listing-kind.enum.ts                  4 kinds
    enums/student-price-unit.enum.ts                    11 units
    enums/listing-audience.enum.ts                      3 values
    enums/detail.enums.ts                               the 12 §2.3 detail enums
    entities/student-listing.entity.ts                  entity + StudentListingDetails union
    entities/student-listing-branch.entity.ts
    catalogs/task.catalog.ts                            category → typeKey
    catalogs/job.catalog.ts                             categoryKey set
    catalogs/rental.catalog.ts                          amenity set
    validation/listing-field.ts                         the 22 ListingField keys
    validation/messages.ts                              every Uzbek message, one const each
    validation/rules/common.rules.ts                    §5.1
    validation/rules/location.rules.ts                  §5.2
    validation/rules/task.rules.ts                      §5.3
    validation/rules/rental.rules.ts                    §5.4
    validation/rules/service.rules.ts                   §5.5 (partial — see spec §11)
    validation/rules/job.rules.ts                       §5.6
    validation/validate-for-publish.ts                  assembler
    student-listing.repository.ts                       port + data interfaces
  application/
    student-listings.service.ts                         create/patch/submit/status/delete/get/mine
    student-listing.io.ts                               service input/output types
    anti-spam.ts                                        the §6 limits
  infrastructure/
    student-listing.mapper.ts                           details ⇄ flat columns, row ⇄ entity
    student-listing.prisma.repository.ts
  presentation/
    student-listings.controller.ts
    dto/create-student-listing.dto.ts
    dto/update-student-listing.dto.ts
    dto/listing-details.dto.ts                          the 4 detail DTOs
    dto/listing-branch.dto.ts
    dto/option-group.dto.ts
    dto/set-status.dto.ts
    dto/student-listing.dto.ts                          response
    dto/student-listing-page.dto.ts
  student-listings.module.ts

src/app.module.ts                                       MODIFY  register StudentListingsModule
test/student-listings.e2e-spec.ts                       CREATE
```

---

## Task 1: Migration — enums, tables, triggers

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_student_listings/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma client models `StudentListing`, `StudentListingBranch`; enums `StudentListingKind`, `StudentPriceUnit`, `ListingAudience`. Every later task depends on these names.

- [ ] **Step 1: Add the enums to `prisma/schema.prisma`**

Place them next to the existing enum block (after `SelectionType`, around line 116).

```prisma
/// Student-posted listing kinds. DISCOUNT (business) is deliberately absent — that is the separate
/// `Listing` model. Wire values match ListingKindDto on the client.
enum StudentListingKind {
  RENTAL
  SERVICE
  JOB
  TASK
}

/// Price units for student listings. Intentionally NOT the shared `PriceUnit`: adding PER_DAY and
/// PER_PAGE there would silently widen the business listing contract. Wire strings are identical.
enum StudentPriceUnit {
  PER_ITEM
  PER_HOUR
  PER_KG
  PER_DAY
  PER_MONTH
  PER_COURSE
  PER_LESSON
  PER_TICKET
  PER_PERSON
  PER_SESSION
  PER_PAGE
}

/// Visibility scope of a student listing. Phase 1 stores it but always behaves as ALL; enforcement
/// arrives with the universities work (spec §7.2.4).
enum ListingAudience {
  ALL
  NEARBY_UNIVERSITIES
  MY_UNIVERSITY
}
```

- [ ] **Step 2: Add the two models to `prisma/schema.prisma`**

Append at the end of the file. Copy verbatim from the spec §2 — the full `StudentListing` and `StudentListingBranch` blocks including every `@@index`.

Key points not to lose:
- `priceUnit`, `validFrom`, `validTo`, `contactPhone` are **nullable** (drafts).
- `title String @default("")`.
- `@@unique([ownerId, idempotencyKey])`.
- `searchVector Unsupported("tsvector")?` and `geoPoint Unsupported("geography(Point, 4326)")?`.
- `@@index([geoPoint], type: Gist, map: "student_listing_branches_geo_point_gist")`.
- `@@index([details(ops: JsonbPathOps)], type: Gin, map: "student_listings_details_gin")`.

- [ ] **Step 3: Add the back-relation on `Student`**

In `model Student` (around line 245, next to `favorites StudentFavorite[]`), add:

```prisma
  studentListings StudentListing[]
```

This emits no SQL — Prisma relation fields are virtual.

- [ ] **Step 4: Generate the migration without applying it**

```bash
npx prisma migrate dev --name student_listings --create-only
```

Expected: a new folder under `prisma/migrations/` containing `migration.sql` with `CREATE TYPE` × 3 and `CREATE TABLE` × 2. Confirm it contains **no `ALTER TABLE`/`DROP` against `listings`, `branches`, `students`, or any other existing table.** If it does, stop — the schema edit went wrong.

- [ ] **Step 5: Hand-add the two triggers to the generated `migration.sql`**

Append to the end of the generated file. `uz_normalize` already exists from the `add_feed_foundation` migration.

```sql
-- Populate the PostGIS geography point from lat/lng, exactly as branches_set_geo_point does.
CREATE OR REPLACE FUNCTION student_listing_branches_set_geo_point() RETURNS trigger AS $$
BEGIN
  NEW.geo_point := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS student_listing_branches_geo_point_biu ON "student_listing_branches";
CREATE TRIGGER student_listing_branches_geo_point_biu
  BEFORE INSERT OR UPDATE OF lat, lng ON "student_listing_branches"
  FOR EACH ROW EXECUTE FUNCTION student_listing_branches_set_geo_point();

-- Derive the search vector from the haystack the service writes. 'simple', not 'english' — the
-- corpus is Uzbek and an English stemmer would mangle it.
CREATE OR REPLACE FUNCTION student_listings_search_vector_refresh() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', uz_normalize(COALESCE(NEW.search_text, '')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS student_listings_search_vector_trigger ON "student_listings";
CREATE TRIGGER student_listings_search_vector_trigger
  BEFORE INSERT OR UPDATE OF search_text ON "student_listings"
  FOR EACH ROW EXECUTE FUNCTION student_listings_search_vector_refresh();
```

- [ ] **Step 6: Apply the migration and regenerate the client**

```bash
npx prisma migrate dev
npx prisma generate
```

Expected: migration applies cleanly, client regenerates with `StudentListing` available.

- [ ] **Step 7: Verify the schema landed**

```bash
npx prisma migrate status
```

Expected: "Database schema is up to date!"

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(student-listings): add student_listings schema and migration"
```

---

## Task 2: Domain enums, details union, entity

**Files:**
- Create: `src/modules/student-listings/domain/enums/student-listing-kind.enum.ts`
- Create: `src/modules/student-listings/domain/enums/student-price-unit.enum.ts`
- Create: `src/modules/student-listings/domain/enums/listing-audience.enum.ts`
- Create: `src/modules/student-listings/domain/enums/detail.enums.ts`
- Create: `src/modules/student-listings/domain/entities/student-listing-branch.entity.ts`
- Create: `src/modules/student-listings/domain/entities/student-listing.entity.ts`

**Interfaces:**
- Consumes: `ListingStatus` from `src/modules/listings/domain/enums/listing-status.enum.ts` (read-only import of an enum — allowed, it is a shared contract value, not business logic).
- Produces: `StudentListingKind`, `StudentPriceUnit`, `ListingAudience`, the 12 detail enums, `StudentListingDetails` (discriminated union), `TaskDetails`, `RentalDetails`, `ServiceDetails`, `JobDetails`, `StudentListingBranch`, `StudentListing`, `ListingOptionGroup`.

- [ ] **Step 1: Write the three simple enum files**

`student-listing-kind.enum.ts`:

```ts
/**
 * Kind of a student-posted listing. The client's `ListingKind` also carries DISCOUNT (a business
 * listing); this module never accepts it — see spec §1.
 */
export enum StudentListingKind {
  RENTAL = 'RENTAL',
  SERVICE = 'SERVICE',
  JOB = 'JOB',
  TASK = 'TASK',
}
```

`student-price-unit.enum.ts` — the 11 values from Task 1's Prisma enum, same names, string-valued.

`listing-audience.enum.ts`:

```ts
/** Visibility scope. Phase 1 stores it but always behaves as ALL (spec §6). */
export enum ListingAudience {
  ALL = 'ALL',
  NEARBY_UNIVERSITIES = 'NEARBY_UNIVERSITIES',
  MY_UNIVERSITY = 'MY_UNIVERSITY',
}
```

- [ ] **Step 2: Write `detail.enums.ts`**

All twelve, string-valued, exactly the names from the request doc §2.3:

```ts
export enum TenantGender { MALE = 'MALE', FEMALE = 'FEMALE', ANY = 'ANY' }

export enum PropertyType {
  APARTMENT = 'APARTMENT', ROOM = 'ROOM', HOUSE = 'HOUSE',
  DORMITORY = 'DORMITORY', BED_SPACE = 'BED_SPACE',
}

export enum RentPeriod { MONTHLY = 'MONTHLY', DAILY = 'DAILY' }

export enum ServiceType {
  TUTOR = 'TUTOR', PRINTING = 'PRINTING', IT_DEV = 'IT_DEV', DESIGN = 'DESIGN',
  PHOTO_VIDEO = 'PHOTO_VIDEO', TRANSLATION = 'TRANSLATION', REPAIR = 'REPAIR',
  BEAUTY = 'BEAUTY', TRANSPORT = 'TRANSPORT', EVENT = 'EVENT',
  CLEANING = 'CLEANING', OTHER = 'OTHER',
}

export enum ServiceFormat { OFFLINE = 'OFFLINE', ONLINE = 'ONLINE', HYBRID = 'HYBRID' }

export enum EmploymentType { DAILY = 'DAILY', PERMANENT = 'PERMANENT' }

export enum WorkShift {
  MORNING = 'MORNING', DAY = 'DAY', EVENING = 'EVENING', NIGHT = 'NIGHT',
  SHIFT_2_2 = 'SHIFT_2_2', SHIFT_1_2 = 'SHIFT_1_2', FLEXIBLE = 'FLEXIBLE',
}

export enum PayPeriod {
  HOURLY = 'HOURLY', DAILY = 'DAILY', WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY', PER_TASK = 'PER_TASK',
}

export enum ExperienceLevel {
  NONE = 'NONE', LESS_THAN_YEAR = 'LESS_THAN_YEAR',
  ONE_TO_THREE = 'ONE_TO_THREE', MORE_THAN_THREE = 'MORE_THAN_THREE',
}

export enum WeekDay {
  MONDAY = 'MONDAY', TUESDAY = 'TUESDAY', WEDNESDAY = 'WEDNESDAY', THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY', SATURDAY = 'SATURDAY', SUNDAY = 'SUNDAY',
}

export enum TaskCategory {
  WRITTEN = 'WRITTEN', PRESENTATION = 'PRESENTATION', EXACT = 'EXACT', IT = 'IT',
  DRAWING = 'DRAWING', HANDWRITING = 'HANDWRITING', TRANSLATION = 'TRANSLATION', CALC = 'CALC',
}

export enum TaskFormat { ONLINE = 'ONLINE', IN_PERSON = 'IN_PERSON', ANY = 'ANY' }
```

- [ ] **Step 3: Write `student-listing-branch.entity.ts`**

```ts
/** One map pin on a student listing. Unlike the business `Branch`, it exists only for its listing. */
export interface StudentListingBranch {
  id: string;
  lat: number;
  lng: number;
  address: string;
  name: string | null;
  landmark: string | null;
  regionId: string | null;
  districtId: string | null;
}
```

- [ ] **Step 4: Write `student-listing.entity.ts`**

Every kind-specific field is nullable: a DRAFT is saved without validation (spec §4), so the entity must be able to represent a half-filled form.

```ts
import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';
import { ListingAudience } from '../enums/listing-audience.enum';
import { StudentListingKind } from '../enums/student-listing-kind.enum';
import { StudentPriceUnit } from '../enums/student-price-unit.enum';
import {
  EmploymentType, ExperienceLevel, PayPeriod, PropertyType, RentPeriod, ServiceFormat,
  ServiceType, TaskCategory, TaskFormat, TenantGender, WeekDay, WorkShift,
} from '../enums/detail.enums';
import { StudentListingBranch } from './student-listing-branch.entity';

export interface TaskDetails {
  kind: StudentListingKind.TASK;
  category: TaskCategory | null;
  typeKey: string | null;
  customTypeName: string | null;
  deadline: Date | null;
  format: TaskFormat | null;
  volume: string | null;
}

export interface RentalDetails {
  kind: StudentListingKind.RENTAL;
  propertyType: PropertyType | null;
  roomCount: number | null;
  currentTenants: number | null;
  neededTenants: number | null;
  gender: TenantGender | null;
  period: RentPeriod | null;
  utilitiesIncluded: boolean;
  depositMonths: number | null;
  floor: number | null;
  totalFloors: number | null;
  amenities: string[];
  availableFrom: Date | null;
}

export interface ServiceDetails {
  kind: StudentListingKind.SERVICE;
  serviceType: ServiceType | null;
  /** Free-form soha-specific values. Validated against ServiceCatalog.kt in Phase 2 (spec §11). */
  fields: Record<string, string>;
  format: ServiceFormat | null;
  experienceYears: number | null;
  workingHours: string | null;
  hasHomeVisit: boolean;
  hasFreeTrial: boolean;
}

export interface JobSchedule {
  days: WeekDay[];
  startTime: string | null;
  endTime: string | null;
  hoursPerDay: number | null;
}

export interface JobDetails {
  kind: StudentListingKind.JOB;
  employment: EmploymentType | null;
  categoryKey: string | null;
  companyName: string | null;
  shift: WorkShift | null;
  schedule: JobSchedule;
  payPeriod: PayPeriod | null;
  vacancies: number | null;
  gender: TenantGender | null;
  experience: ExperienceLevel | null;
  ageFrom: number | null;
  ageTo: number | null;
  requirements: string[];
  benefits: string[];
  workDate: Date | null;
  payoutNote: string | null;
}

/** Discriminated on `kind`, matching the client's `classDiscriminator = "kind"`. */
export type StudentListingDetails = TaskDetails | RentalDetails | ServiceDetails | JobDetails;

export interface ListingOption {
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

export interface ListingOptionGroup {
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  isRequired: boolean;
  options: ListingOption[];
}

export interface StudentListing {
  id: string;
  ownerId: string;
  kind: StudentListingKind;
  title: string;
  description: string | null;
  images: string[];
  priceUnit: StudentPriceUnit | null;
  price: number;
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
  rejectionReason: string | null;
  viewsCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/student-listings/domain
git commit -m "feat(student-listings): add domain enums, details union and entity"
```

---

## Task 3: Catalogs

**Files:**
- Create: `src/modules/student-listings/domain/catalogs/task.catalog.ts`
- Create: `src/modules/student-listings/domain/catalogs/job.catalog.ts`
- Create: `src/modules/student-listings/domain/catalogs/rental.catalog.ts`
- Test: `src/modules/student-listings/domain/catalogs/catalogs.spec.ts`

**Interfaces:**
- Consumes: `TaskCategory` from Task 2.
- Produces: `TASK_TYPE_KEYS: Readonly<Record<TaskCategory, readonly string[]>>`, `isKnownTaskTypeKey(category, key): boolean`, `JOB_CATEGORY_KEYS: readonly string[]`, `isKnownJobCategoryKey(key): boolean`, `RENTAL_AMENITY_KEYS: readonly string[]`, `isKnownAmenity(key): boolean`.

These keys are a contract with stored data — a key that changes orphans every listing that used it. That is what the test in Step 1 protects.

- [ ] **Step 1: Write the failing test**

`catalogs.spec.ts`:

```ts
import { TaskCategory } from '../enums/detail.enums';
import { JOB_CATEGORY_KEYS, isKnownJobCategoryKey } from './job.catalog';
import { RENTAL_AMENITY_KEYS, isKnownAmenity } from './rental.catalog';
import { TASK_TYPE_KEYS, isKnownTaskTypeKey } from './task.catalog';

describe('catalogs', () => {
  // These lists are a contract with rows already in the database. A changed key orphans every
  // listing that used it, so the exact sets are asserted rather than merely spot-checked.
  it('TASK exposes the documented type keys per category', () => {
    expect(TASK_TYPE_KEYS[TaskCategory.WRITTEN]).toEqual([
      'REFERAT', 'MUSTAQIL', 'KURS', 'DIPLOM', 'MAGISTR', 'TAQRIZ',
    ]);
    expect(TASK_TYPE_KEYS[TaskCategory.PRESENTATION]).toEqual(['SLIDES', 'POSTER']);
    expect(TASK_TYPE_KEYS[TaskCategory.EXACT]).toEqual(['MATH', 'PHYSICS', 'CHEMISTRY', 'STATS']);
    expect(TASK_TYPE_KEYS[TaskCategory.IT]).toEqual(['WEB', 'CODE', 'SQL', 'CODE_REPORT']);
    expect(TASK_TYPE_KEYS[TaskCategory.DRAWING]).toEqual(['CAD', 'MAP', 'DIAGRAM']);
    expect(TASK_TYPE_KEYS[TaskCategory.HANDWRITING]).toEqual(['HW_TEXT', 'HW_DIARY']);
    expect(TASK_TYPE_KEYS[TaskCategory.TRANSLATION]).toEqual(['ARTICLE', 'ANNOTATION']);
    expect(TASK_TYPE_KEYS[TaskCategory.CALC]).toEqual(['GPA', 'DOCX', 'BIBLIO']);
  });

  it('accepts OTHER in every TASK category', () => {
    for (const category of Object.values(TaskCategory)) {
      expect(isKnownTaskTypeKey(category, 'OTHER')).toBe(true);
    }
  });

  it('rejects a type key from the wrong TASK category', () => {
    expect(isKnownTaskTypeKey(TaskCategory.WRITTEN, 'MATH')).toBe(false);
    expect(isKnownTaskTypeKey(TaskCategory.EXACT, 'MATH')).toBe(true);
  });

  it('JOB exposes the 21 documented category keys', () => {
    expect(JOB_CATEGORY_KEYS).toHaveLength(21);
    expect(isKnownJobCategoryKey('COURIER')).toBe(true);
    expect(isKnownJobCategoryKey('OTHER')).toBe(true);
    expect(isKnownJobCategoryKey('ASTRONAUT')).toBe(false);
  });

  it('RENTAL exposes the 14 documented amenity keys', () => {
    expect(RENTAL_AMENITY_KEYS).toHaveLength(14);
    expect(isKnownAmenity('NEAR_METRO')).toBe(true);
    expect(isKnownAmenity('JACUZZI')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/domain/catalogs`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `task.catalog.ts`**

```ts
import { TaskCategory } from '../enums/detail.enums';

/** Every category also accepts OTHER ("Boshqa"), which pairs with `details.customTypeName`. */
export const TASK_OTHER_TYPE_KEY = 'OTHER';

/**
 * Category → allowed `details.typeKey`. Keys are a contract with stored rows: a listing saved as
 * `REFERAT` stays `REFERAT` forever. Labels live on the client (and later in the §7.3 catalog
 * endpoint); only the keys are enforced here.
 */
export const TASK_TYPE_KEYS: Readonly<Record<TaskCategory, readonly string[]>> = {
  [TaskCategory.WRITTEN]: ['REFERAT', 'MUSTAQIL', 'KURS', 'DIPLOM', 'MAGISTR', 'TAQRIZ'],
  [TaskCategory.PRESENTATION]: ['SLIDES', 'POSTER'],
  [TaskCategory.EXACT]: ['MATH', 'PHYSICS', 'CHEMISTRY', 'STATS'],
  [TaskCategory.IT]: ['WEB', 'CODE', 'SQL', 'CODE_REPORT'],
  [TaskCategory.DRAWING]: ['CAD', 'MAP', 'DIAGRAM'],
  [TaskCategory.HANDWRITING]: ['HW_TEXT', 'HW_DIARY'],
  [TaskCategory.TRANSLATION]: ['ARTICLE', 'ANNOTATION'],
  [TaskCategory.CALC]: ['GPA', 'DOCX', 'BIBLIO'],
};

export function isKnownTaskTypeKey(category: TaskCategory, key: string): boolean {
  return key === TASK_OTHER_TYPE_KEY || TASK_TYPE_KEYS[category].includes(key);
}
```

- [ ] **Step 4: Write `job.catalog.ts`**

```ts
/** `details.categoryKey` for a JOB listing. Stable keys — labels live on the client. */
export const JOB_CATEGORY_KEYS: readonly string[] = [
  'COURIER', 'WAITER', 'BARISTA', 'COOK_HELPER', 'CASHIER', 'SALES', 'PROMOTER',
  'CALL_CENTER', 'LOADER', 'WAREHOUSE', 'CLEANER', 'ANIMATOR', 'TUTOR_JOB', 'ADMIN',
  'SMM', 'IT', 'DESIGNER', 'DRIVER', 'SECURITY', 'BUILDER', 'OTHER',
];

export function isKnownJobCategoryKey(key: string): boolean {
  return JOB_CATEGORY_KEYS.includes(key);
}
```

- [ ] **Step 5: Write `rental.catalog.ts`**

```ts
/** `details.amenities[]` for a RENTAL listing. Stable keys — labels live on the client. */
export const RENTAL_AMENITY_KEYS: readonly string[] = [
  'WIFI', 'FURNITURE', 'CONDITIONER', 'WASHER', 'FRIDGE', 'KITCHEN', 'HOT_WATER',
  'HEATING', 'SEPARATE_ROOM', 'BALCONY', 'PARKING', 'ELEVATOR', 'NEAR_METRO',
  'NEAR_UNIVERSITY',
];

export function isKnownAmenity(key: string): boolean {
  return RENTAL_AMENITY_KEYS.includes(key);
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- src/modules/student-listings/domain/catalogs`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add src/modules/student-listings/domain/catalogs
git commit -m "feat(student-listings): add TASK/JOB/RENTAL catalog key sets"
```

---

## Task 4: ListingField keys, messages, and the common + location rules

**Files:**
- Create: `src/modules/student-listings/domain/validation/listing-field.ts`
- Create: `src/modules/student-listings/domain/validation/messages.ts`
- Create: `src/modules/student-listings/domain/validation/rules/common.rules.ts`
- Create: `src/modules/student-listings/domain/validation/rules/location.rules.ts`
- Test: `src/modules/student-listings/domain/validation/rules/common.rules.spec.ts`
- Test: `src/modules/student-listings/domain/validation/rules/location.rules.spec.ts`

**Interfaces:**
- Consumes: `StudentListing`, `StudentListingKind`, `TaskFormat` from Task 2.
- Produces:
  - `ListingField` (enum, 22 values) and `type FieldErrors = Partial<Record<ListingField, string>>`
  - `MSG` (const object of every Uzbek message)
  - `commonRules(listing: StudentListing): FieldErrors`
  - `locationRules(listing: StudentListing): FieldErrors`
  - `UZ_LAT_MIN/UZ_LAT_MAX/UZ_LNG_MIN/UZ_LNG_MAX`, `distanceMeters(a, b): number`

Each rule module returns a partial map. The assembler in Task 6 merges them. **First writer wins per field** — the merge must not overwrite an already-set key, so the most specific message survives.

- [ ] **Step 1: Write `listing-field.ts`**

```ts
/**
 * Error keys returned in `error.fields`. Identical to the client's `ListingField` enum — the app
 * shows each message under the matching form field, so a renamed key silently hides the error.
 */
export enum ListingField {
  TITLE = 'TITLE',
  IMAGES = 'IMAGES',
  PRICE = 'PRICE',
  LOCATION = 'LOCATION',
  VALIDITY = 'VALIDITY',
  CONTACT = 'CONTACT',
  ATTRIBUTES = 'ATTRIBUTES',
  OPTIONS = 'OPTIONS',
  CATEGORY = 'CATEGORY',
  PROPERTY_TYPE = 'PROPERTY_TYPE',
  ROOMS = 'ROOMS',
  TENANTS = 'TENANTS',
  GENDER = 'GENDER',
  SERVICE_TYPE = 'SERVICE_TYPE',
  SERVICE_SUBJECT = 'SERVICE_SUBJECT',
  TASK_SUBJECT = 'TASK_SUBJECT',
  TASK_BRIEF = 'TASK_BRIEF',
  TASK_DEADLINE = 'TASK_DEADLINE',
  JOB_CATEGORY = 'JOB_CATEGORY',
  JOB_SHIFT = 'JOB_SHIFT',
  JOB_SCHEDULE = 'JOB_SCHEDULE',
  JOB_PAY = 'JOB_PAY',
  BUSINESS_NAME = 'BUSINESS_NAME',
}

/** A field → Uzbek message map. Empty means the listing is publishable. */
export type FieldErrors = Partial<Record<ListingField, string>>;
```

- [ ] **Step 2: Write `messages.ts`**

Every message the validator can emit, in one place so the wording is reviewable against the request doc §5.

```ts
/**
 * User-facing Uzbek validation copy, taken from STUDENT_LISTINGS_BACKEND.md §5.1–§5.6. The client
 * renders these verbatim under the matching form field — rewording one is a user-visible change.
 */
export const MSG = {
  // §5.1 common
  TITLE_REQUIRED: 'Sarlavhani kiriting',
  TITLE_TOO_SHORT: 'Sarlavha juda qisqa',
  TITLE_TOO_LONG: 'Sarlavha 120 belgidan oshmasin',
  IMAGES_REQUIRED: 'Kamida 1 ta rasm qo‘shing',
  IMAGES_TOO_MANY: 'Maksimal 5 ta rasm',
  PRICE_REQUIRED: 'Narxni kiriting yoki "kelishilgan" ni belgilang',
  PRICE_MAX_TOO_LOW: 'Yuqori chegara quyi chegaradan katta bo‘lsin',
  CONTACT_REQUIRED: 'Telefon raqamini kiriting',
  VALIDITY_ORDER: 'Tugash sanasi boshlanishdan keyin bo‘lsin',
  VALIDITY_TOO_LONG: 'E’lon muddati 90 kundan oshmasin',

  // §5.2 location
  LOCATION_REQUIRED_RENTAL: 'Uy joyini xaritadan belgilang',
  LOCATION_REQUIRED_SERVICE: 'Xizmat ko‘rsatiladigan joyni xaritadan belgilang',
  LOCATION_REQUIRED_JOB: 'Ish joyini xaritadan belgilang',
  LOCATION_REQUIRED_TASK: 'Ish topshiriladigan joyni xaritadan belgilang',
  LOCATION_OUT_OF_BOUNDS: 'Nuqta O‘zbekiston hududidan tashqarida',
  LOCATION_DUPLICATE: 'Ikkita manzil bir joyda belgilangan',

  // §5.3 TASK
  TASK_CATEGORY_REQUIRED: 'Ish yo‘nalishini tanlang',
  TASK_TYPE_REQUIRED: 'Ish turini tanlang',
  TASK_CUSTOM_TYPE_REQUIRED: 'Ish turini yozing',
  TASK_BRIEF_REQUIRED: 'Topshiriq shartini yozing',
  TASK_DEADLINE_REQUIRED: 'Topshirish muddatini belgilang',
  TASK_DEADLINE_PAST: 'Muddat hozirgi vaqtdan keyin bo‘lsin',

  // §5.4 RENTAL
  PROPERTY_TYPE_REQUIRED: 'Turarjoy turini tanlang',
  ROOMS_REQUIRED: 'Nechi xonaligini kiriting',
  ROOMS_OUT_OF_RANGE: 'Xonalar soni 1 dan 20 gacha bo‘lsin',
  CURRENT_TENANTS_REQUIRED: 'Hozir nechi kishi yashashini kiriting',
  NEEDED_TENANTS_REQUIRED: 'Nechi kishi kerakligini kiriting',
  GENDER_REQUIRED: 'Kim uchun ekanini tanlang — qiz yoki o‘g‘il',
  FLOOR_ABOVE_TOTAL: 'Qavat binoning qavatlar sonidan katta',

  // §5.5 SERVICE
  SERVICE_TYPE_REQUIRED: 'Xizmat sohasini tanlang',
  EXPERIENCE_YEARS_INVALID: 'Tajriba yillari noto‘g‘ri',

  // §5.6 JOB
  JOB_CATEGORY_REQUIRED: 'Ish turini tanlang',
  COMPANY_NAME_REQUIRED: 'Tashkilot yoki ish beruvchi nomini kiriting',
  JOB_SHIFT_REQUIRED: 'Ish smenasini tanlang',
  JOB_TIME_RANGE_REQUIRED: 'Ish vaqti oralig‘ini kiriting',
  JOB_WORK_DATE_REQUIRED: 'Ish qaysi kuni ekanini belgilang',
  JOB_DAYS_REQUIRED: 'Ish kunlarini tanlang',
  JOB_HOURS_OUT_OF_RANGE: 'Kunlik soat 1 dan 24 gacha bo‘lsin',
  JOB_VACANCIES_REQUIRED: 'Nechta odam kerakligini kiriting',
  AGE_RANGE_INVALID: 'Yosh oralig‘i noto‘g‘ri',

  // catalog
  CATALOG_KEY_UNKNOWN: 'Noma’lum katalog kaliti',
} as const;

/** §5.4: "{rooms} xonaga {total} kishi ko‘p — sonlarni tekshiring". */
export function tenantsExceedRooms(rooms: number, total: number): string {
  return `${rooms} xonaga ${total} kishi ko‘p — sonlarni tekshiring`;
}
```

- [ ] **Step 3: Write the failing test for `common.rules.ts`**

`common.rules.spec.ts`. Build a helper that produces a valid RENTAL listing and mutate one field per test.

```ts
import { ListingStatus } from '../../../../listings/domain/enums/listing-status.enum';
import { ListingAudience } from '../../enums/listing-audience.enum';
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { StudentPriceUnit } from '../../enums/student-price-unit.enum';
import { PropertyType, RentPeriod, TenantGender } from '../../enums/detail.enums';
import type { StudentListing } from '../../entities/student-listing.entity';
import { ListingField } from '../listing-field';
import { MSG } from '../messages';
import { commonRules } from './common.rules';

function validRental(overrides: Partial<StudentListing> = {}): StudentListing {
  return {
    id: 'lst_1', ownerId: 'usr_1', kind: StudentListingKind.RENTAL,
    title: 'Chilonzorda sherik kerak', description: null, images: ['https://cdn/1.jpg'],
    priceUnit: StudentPriceUnit.PER_MONTH, price: 1_500_000, priceMax: null, currency: 'UZS',
    isNegotiable: false, contactPhone: '+998901234567', universityId: null,
    audience: ListingAudience.ALL, branches: [],
    validFrom: new Date('2026-08-01T00:00:00Z'), validTo: new Date('2026-09-01T00:00:00Z'),
    attributes: {}, optionGroups: [],
    details: {
      kind: StudentListingKind.RENTAL, propertyType: PropertyType.APARTMENT, roomCount: 3,
      currentTenants: 2, neededTenants: 1, gender: TenantGender.MALE, period: RentPeriod.MONTHLY,
      utilitiesIncluded: false, depositMonths: null, floor: null, totalFloors: null,
      amenities: [], availableFrom: null,
    },
    status: ListingStatus.DRAFT, rejectionReason: null, viewsCount: 0, publishedAt: null,
    createdAt: new Date('2026-07-30T09:12:00Z'), updatedAt: new Date('2026-07-30T09:12:00Z'),
    ...overrides,
  };
}

describe('commonRules', () => {
  it('passes a well-formed listing', () => {
    expect(commonRules(validRental())).toEqual({});
  });

  it.each([
    ['', MSG.TITLE_REQUIRED],
    ['   ', MSG.TITLE_REQUIRED],
    ['ab', MSG.TITLE_TOO_SHORT],
    ['x'.repeat(121), MSG.TITLE_TOO_LONG],
  ])('rejects title %p', (title, message) => {
    expect(commonRules(validRental({ title }))[ListingField.TITLE]).toBe(message);
  });

  it('requires at least one image for RENTAL and SERVICE', () => {
    expect(commonRules(validRental({ images: [] }))[ListingField.IMAGES])
      .toBe(MSG.IMAGES_REQUIRED);
  });

  it('does not require images for JOB or TASK', () => {
    const job = validRental({ kind: StudentListingKind.JOB, images: [] });
    expect(commonRules(job)[ListingField.IMAGES]).toBeUndefined();
  });

  it('rejects more than 5 images', () => {
    const images = Array.from({ length: 6 }, (_, i) => `https://cdn/${i}.jpg`);
    expect(commonRules(validRental({ images }))[ListingField.IMAGES]).toBe(MSG.IMAGES_TOO_MANY);
  });

  it('requires a price unless negotiable', () => {
    expect(commonRules(validRental({ price: 0 }))[ListingField.PRICE]).toBe(MSG.PRICE_REQUIRED);
    expect(commonRules(validRental({ price: 0, isNegotiable: true }))[ListingField.PRICE])
      .toBeUndefined();
  });

  it('requires priceMax above price when given', () => {
    expect(commonRules(validRental({ price: 100, priceMax: 100 }))[ListingField.PRICE])
      .toBe(MSG.PRICE_MAX_TOO_LOW);
    expect(commonRules(validRental({ price: 100, priceMax: 200 }))[ListingField.PRICE])
      .toBeUndefined();
  });

  it('requires a contact phone', () => {
    expect(commonRules(validRental({ contactPhone: null }))[ListingField.CONTACT])
      .toBe(MSG.CONTACT_REQUIRED);
  });

  it('requires validTo after validFrom', () => {
    const listing = validRental({
      validFrom: new Date('2026-09-01T00:00:00Z'), validTo: new Date('2026-08-01T00:00:00Z'),
    });
    expect(commonRules(listing)[ListingField.VALIDITY]).toBe(MSG.VALIDITY_ORDER);
  });

  it('caps the validity window at 90 days', () => {
    const listing = validRental({
      validFrom: new Date('2026-08-01T00:00:00Z'), validTo: new Date('2026-12-01T00:00:00Z'),
    });
    expect(commonRules(listing)[ListingField.VALIDITY]).toBe(MSG.VALIDITY_TOO_LONG);
  });

  it('rejects more than 10 option groups', () => {
    const optionGroups = Array.from({ length: 11 }, (_, i) => ({
      name: `g${i}`, selectionType: 'SINGLE' as const, isRequired: false,
      options: [{ name: 'a', priceDelta: 0, isAvailable: true }],
    }));
    expect(commonRules(validRental({ optionGroups }))[ListingField.OPTIONS]).toBeDefined();
  });

  it('rejects an option group with no options or a blank name', () => {
    const empty = [{ name: 'g', selectionType: 'SINGLE' as const, isRequired: false, options: [] }];
    expect(commonRules(validRental({ optionGroups: empty }))[ListingField.OPTIONS]).toBeDefined();

    const blank = [{
      name: '  ', selectionType: 'SINGLE' as const, isRequired: false,
      options: [{ name: 'a', priceDelta: 0, isAvailable: true }],
    }];
    expect(commonRules(validRental({ optionGroups: blank }))[ListingField.OPTIONS]).toBeDefined();
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/domain/validation/rules/common.rules.spec.ts`
Expected: FAIL — `common.rules` not found.

- [ ] **Step 5: Implement `common.rules.ts`**

```ts
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import type { StudentListing } from '../../entities/student-listing.entity';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG } from '../messages';

const TITLE_MIN = 3;
const TITLE_MAX = 120;
const IMAGES_MAX = 5;
const OPTION_GROUPS_MAX = 10;
const OPTIONS_PER_GROUP_MAX = 30;
const VALIDITY_MAX_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Kinds where a photo is the point of the listing. A job vacancy or a homework brief has none. */
const IMAGE_REQUIRED_KINDS: readonly StudentListingKind[] = [
  StudentListingKind.RENTAL,
  StudentListingKind.SERVICE,
];

/** §5.1 — the checks every kind shares. */
export function commonRules(listing: StudentListing): FieldErrors {
  const errors: FieldErrors = {};

  const title = listing.title.trim();
  if (title.length === 0) {
    errors[ListingField.TITLE] = MSG.TITLE_REQUIRED;
  } else if (title.length < TITLE_MIN) {
    errors[ListingField.TITLE] = MSG.TITLE_TOO_SHORT;
  } else if (title.length > TITLE_MAX) {
    errors[ListingField.TITLE] = MSG.TITLE_TOO_LONG;
  }

  if (listing.images.length > IMAGES_MAX) {
    errors[ListingField.IMAGES] = MSG.IMAGES_TOO_MANY;
  } else if (IMAGE_REQUIRED_KINDS.includes(listing.kind) && listing.images.length === 0) {
    errors[ListingField.IMAGES] = MSG.IMAGES_REQUIRED;
  }

  if (listing.price <= 0 && !listing.isNegotiable) {
    errors[ListingField.PRICE] = MSG.PRICE_REQUIRED;
  } else if (listing.priceMax !== null && listing.priceMax <= listing.price) {
    errors[ListingField.PRICE] = MSG.PRICE_MAX_TOO_LOW;
  }

  if (listing.contactPhone === null || listing.contactPhone.trim().length === 0) {
    errors[ListingField.CONTACT] = MSG.CONTACT_REQUIRED;
  }

  const { validFrom, validTo } = listing;
  if (validFrom === null || validTo === null || validTo.getTime() <= validFrom.getTime()) {
    errors[ListingField.VALIDITY] = MSG.VALIDITY_ORDER;
  } else if (validTo.getTime() - validFrom.getTime() > VALIDITY_MAX_DAYS * DAY_MS) {
    errors[ListingField.VALIDITY] = MSG.VALIDITY_TOO_LONG;
  }

  const optionsError = optionGroupsError(listing);
  if (optionsError !== null) {
    errors[ListingField.OPTIONS] = optionsError;
  }

  return errors;
}

function optionGroupsError(listing: StudentListing): string | null {
  const groups = listing.optionGroups;
  if (groups.length > OPTION_GROUPS_MAX) {
    return `Qo‘shimchalar ${OPTION_GROUPS_MAX} guruhdan oshmasin`;
  }
  for (const group of groups) {
    if (group.name.trim().length === 0) {
      return 'Qo‘shimcha guruhining nomini kiriting';
    }
    if (group.options.length === 0) {
      return `"${group.name}" guruhida kamida 1 ta variant bo‘lsin`;
    }
    if (group.options.length > OPTIONS_PER_GROUP_MAX) {
      return `"${group.name}" guruhida ${OPTIONS_PER_GROUP_MAX} tadan ko‘p variant bo‘lmasin`;
    }
  }
  return null;
}
```

- [ ] **Step 6: Run the common tests**

Run: `npm test -- src/modules/student-listings/domain/validation/rules/common.rules.spec.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing test for `location.rules.ts`**

`location.rules.spec.ts` — reuse the same `validRental` helper (copy it into this file; the two specs are independent).

```ts
describe('locationRules', () => {
  const pin = (lat: number, lng: number) => ({
    id: 'br_1', lat, lng, address: 'Chilonzor 9', name: null, landmark: null,
    regionId: null, districtId: null,
  });

  it('requires at least one pin for RENTAL', () => {
    expect(locationRules(validRental({ branches: [] }))[ListingField.LOCATION])
      .toBe(MSG.LOCATION_REQUIRED_RENTAL);
  });

  it('uses a kind-specific message', () => {
    expect(locationRules(validRental({ kind: StudentListingKind.JOB, branches: [] }))
      [ListingField.LOCATION]).toBe(MSG.LOCATION_REQUIRED_JOB);
    expect(locationRules(validRental({ kind: StudentListingKind.SERVICE, branches: [] }))
      [ListingField.LOCATION]).toBe(MSG.LOCATION_REQUIRED_SERVICE);
  });

  it('does not require a pin for an ONLINE or ANY TASK', () => {
    for (const format of [TaskFormat.ONLINE, TaskFormat.ANY]) {
      const listing = validRental({
        kind: StudentListingKind.TASK, branches: [],
        details: {
          kind: StudentListingKind.TASK, category: TaskCategory.EXACT, typeKey: 'MATH',
          customTypeName: null, deadline: new Date('2026-08-14T18:00:00Z'), format, volume: null,
        },
      });
      expect(locationRules(listing)[ListingField.LOCATION]).toBeUndefined();
    }
  });

  it('requires a pin for an IN_PERSON TASK', () => {
    const listing = validRental({
      kind: StudentListingKind.TASK, branches: [],
      details: {
        kind: StudentListingKind.TASK, category: TaskCategory.EXACT, typeKey: 'MATH',
        customTypeName: null, deadline: new Date('2026-08-14T18:00:00Z'),
        format: TaskFormat.IN_PERSON, volume: null,
      },
    });
    expect(locationRules(listing)[ListingField.LOCATION]).toBe(MSG.LOCATION_REQUIRED_TASK);
  });

  it('rejects a pin outside Uzbekistan', () => {
    expect(locationRules(validRental({ branches: [pin(55.75, 37.62)] }))[ListingField.LOCATION])
      .toBe(MSG.LOCATION_OUT_OF_BOUNDS);
  });

  it('accepts a pin inside Uzbekistan', () => {
    expect(locationRules(validRental({ branches: [pin(41.2856, 69.2034)] }))).toEqual({});
  });

  it('rejects two pins closer than 100 m', () => {
    const branches = [pin(41.2856, 69.2034), { ...pin(41.2857, 69.2035), id: 'br_2' }];
    expect(locationRules(validRental({ branches }))[ListingField.LOCATION])
      .toBe(MSG.LOCATION_DUPLICATE);
  });

  it('accepts two pins further than 100 m apart', () => {
    const branches = [pin(41.2856, 69.2034), { ...pin(41.2956, 69.2134), id: 'br_2' }];
    expect(locationRules(validRental({ branches }))).toEqual({});
  });

  it('rejects more than 20 pins', () => {
    const branches = Array.from({ length: 21 }, (_, i) => ({
      ...pin(41.2 + i * 0.01, 69.2 + i * 0.01), id: `br_${i}`,
    }));
    expect(locationRules(validRental({ branches }))[ListingField.LOCATION]).toBeDefined();
  });
});
```

- [ ] **Step 8: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/domain/validation/rules/location.rules.spec.ts`
Expected: FAIL — `location.rules` not found.

- [ ] **Step 9: Implement `location.rules.ts`**

```ts
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { TaskFormat } from '../../enums/detail.enums';
import type { StudentListing, StudentListingBranch } from '../../entities/student-listing.entity';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG } from '../messages';

/** Uzbekistan's bounding box (request doc §2.4). A pin outside it is a client bug, not a place. */
export const UZ_LAT_MIN = 37.0;
export const UZ_LAT_MAX = 46.0;
export const UZ_LNG_MIN = 55.0;
export const UZ_LNG_MAX = 74.0;

export const BRANCHES_MAX = 20;
export const DUPLICATE_PIN_METERS = 100;

const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Great-circle distance in metres. The client's `ListingValidator` uses the same haversine, and the
 * DB uses ST_DistanceSphere — all three agree closely enough for a 100 m threshold.
 */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const MISSING_LOCATION_MESSAGE: Readonly<Record<StudentListingKind, string>> = {
  [StudentListingKind.RENTAL]: MSG.LOCATION_REQUIRED_RENTAL,
  [StudentListingKind.SERVICE]: MSG.LOCATION_REQUIRED_SERVICE,
  [StudentListingKind.JOB]: MSG.LOCATION_REQUIRED_JOB,
  [StudentListingKind.TASK]: MSG.LOCATION_REQUIRED_TASK,
};

/**
 * §5.2. A pin is mandatory everywhere except an online TASK — an online homework brief has no
 * place, and demanding one would block a legitimate listing.
 */
export function locationRules(listing: StudentListing): FieldErrors {
  const errors: FieldErrors = {};
  const { branches } = listing;

  if (branches.length === 0) {
    if (requiresLocation(listing)) {
      errors[ListingField.LOCATION] = MISSING_LOCATION_MESSAGE[listing.kind];
    }
    return errors;
  }

  if (branches.length > BRANCHES_MAX) {
    errors[ListingField.LOCATION] = `Bitta e’londa ${BRANCHES_MAX} tadan ko‘p manzil bo‘lmasin`;
    return errors;
  }

  if (branches.some((branch) => !isInsideUzbekistan(branch))) {
    errors[ListingField.LOCATION] = MSG.LOCATION_OUT_OF_BOUNDS;
    return errors;
  }

  if (hasDuplicatePin(branches)) {
    errors[ListingField.LOCATION] = MSG.LOCATION_DUPLICATE;
  }

  return errors;
}

function requiresLocation(listing: StudentListing): boolean {
  if (listing.details.kind !== StudentListingKind.TASK) {
    return true;
  }
  return listing.details.format === TaskFormat.IN_PERSON;
}

function isInsideUzbekistan(branch: StudentListingBranch): boolean {
  return (
    branch.lat >= UZ_LAT_MIN && branch.lat <= UZ_LAT_MAX &&
    branch.lng >= UZ_LNG_MIN && branch.lng <= UZ_LNG_MAX
  );
}

function hasDuplicatePin(branches: StudentListingBranch[]): boolean {
  for (let i = 0; i < branches.length; i += 1) {
    for (let j = i + 1; j < branches.length; j += 1) {
      if (distanceMeters(branches[i], branches[j]) < DUPLICATE_PIN_METERS) {
        return true;
      }
    }
  }
  return false;
}
```

- [ ] **Step 10: Run both specs**

Run: `npm test -- src/modules/student-listings/domain/validation`
Expected: PASS, both files.

- [ ] **Step 11: Lint and commit**

```bash
npm run lint
git add src/modules/student-listings/domain/validation
git commit -m "feat(student-listings): add publish validation fields, messages, common and location rules"
```

---

## Task 5: TASK and RENTAL rules

**Files:**
- Create: `src/modules/student-listings/domain/validation/rules/task.rules.ts`
- Create: `src/modules/student-listings/domain/validation/rules/rental.rules.ts`
- Test: `src/modules/student-listings/domain/validation/rules/task.rules.spec.ts`
- Test: `src/modules/student-listings/domain/validation/rules/rental.rules.spec.ts`

**Interfaces:**
- Consumes: `TaskDetails`, `RentalDetails` (Task 2); `isKnownTaskTypeKey`, `isKnownAmenity` (Task 3); `ListingField`, `FieldErrors`, `MSG`, `tenantsExceedRooms` (Task 4).
- Produces:
  - `taskRules(details: TaskDetails, description: string | null, now: Date): FieldErrors`
  - `rentalRules(details: RentalDetails): FieldErrors`

`now` is a parameter, not `new Date()` inside the rule — a deadline check that reads the clock cannot be tested deterministically.

- [ ] **Step 1: Write the failing test for `task.rules.ts`**

```ts
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { TaskCategory, TaskFormat } from '../../enums/detail.enums';
import type { TaskDetails } from '../../entities/student-listing.entity';
import { ListingField } from '../listing-field';
import { MSG } from '../messages';
import { taskRules } from './task.rules';

const NOW = new Date('2026-08-03T00:00:00Z');
const FUTURE = new Date('2026-08-14T18:00:00Z');
const PAST = new Date('2026-08-01T18:00:00Z');

function details(overrides: Partial<TaskDetails> = {}): TaskDetails {
  return {
    kind: StudentListingKind.TASK, category: TaskCategory.EXACT, typeKey: 'MATH',
    customTypeName: null, deadline: FUTURE, format: TaskFormat.ONLINE, volume: null,
    ...overrides,
  };
}

describe('taskRules', () => {
  it('passes a well-formed TASK', () => {
    expect(taskRules(details(), 'Analiz, aniqmas integrallar', NOW)).toEqual({});
  });

  it('requires a category', () => {
    expect(taskRules(details({ category: null }), 'brief', NOW)[ListingField.TASK_SUBJECT])
      .toBe(MSG.TASK_CATEGORY_REQUIRED);
  });

  it('requires a type key', () => {
    expect(taskRules(details({ typeKey: null }), 'brief', NOW)[ListingField.TASK_SUBJECT])
      .toBe(MSG.TASK_TYPE_REQUIRED);
  });

  it('requires customTypeName when typeKey is OTHER', () => {
    expect(taskRules(details({ typeKey: 'OTHER' }), 'brief', NOW)[ListingField.TASK_SUBJECT])
      .toBe(MSG.TASK_CUSTOM_TYPE_REQUIRED);
    expect(taskRules(details({ typeKey: 'OTHER', customTypeName: 'Insho' }), 'brief', NOW))
      .toEqual({});
  });

  it('rejects a type key from another category', () => {
    expect(taskRules(details({ category: TaskCategory.WRITTEN, typeKey: 'MATH' }), 'b', NOW)
      [ListingField.TASK_SUBJECT]).toBe(MSG.CATALOG_KEY_UNKNOWN);
  });

  it('requires a description', () => {
    expect(taskRules(details(), null, NOW)[ListingField.TASK_BRIEF]).toBe(MSG.TASK_BRIEF_REQUIRED);
    expect(taskRules(details(), '   ', NOW)[ListingField.TASK_BRIEF]).toBe(MSG.TASK_BRIEF_REQUIRED);
  });

  it('requires a deadline', () => {
    expect(taskRules(details({ deadline: null }), 'brief', NOW)[ListingField.TASK_DEADLINE])
      .toBe(MSG.TASK_DEADLINE_REQUIRED);
  });

  it('requires the deadline to be in the future', () => {
    expect(taskRules(details({ deadline: PAST }), 'brief', NOW)[ListingField.TASK_DEADLINE])
      .toBe(MSG.TASK_DEADLINE_PAST);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/domain/validation/rules/task.rules.spec.ts`
Expected: FAIL — `task.rules` not found.

- [ ] **Step 3: Implement `task.rules.ts`**

```ts
import { isKnownTaskTypeKey, TASK_OTHER_TYPE_KEY } from '../../catalogs/task.catalog';
import type { TaskDetails } from '../../entities/student-listing.entity';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG } from '../messages';

/**
 * §5.3. `description` is the topshiriq brief and lives on the listing, not in `details` — hence the
 * separate parameter. `now` is injected so the deadline check is deterministic under test.
 */
export function taskRules(
  details: TaskDetails,
  description: string | null,
  now: Date,
): FieldErrors {
  const errors: FieldErrors = {};

  if (details.category === null) {
    errors[ListingField.TASK_SUBJECT] = MSG.TASK_CATEGORY_REQUIRED;
  } else if (details.typeKey === null || details.typeKey.trim().length === 0) {
    errors[ListingField.TASK_SUBJECT] = MSG.TASK_TYPE_REQUIRED;
  } else if (!isKnownTaskTypeKey(details.category, details.typeKey)) {
    errors[ListingField.TASK_SUBJECT] = MSG.CATALOG_KEY_UNKNOWN;
  } else if (
    details.typeKey === TASK_OTHER_TYPE_KEY &&
    (details.customTypeName === null || details.customTypeName.trim().length === 0)
  ) {
    errors[ListingField.TASK_SUBJECT] = MSG.TASK_CUSTOM_TYPE_REQUIRED;
  }

  if (description === null || description.trim().length === 0) {
    errors[ListingField.TASK_BRIEF] = MSG.TASK_BRIEF_REQUIRED;
  }

  if (details.deadline === null) {
    errors[ListingField.TASK_DEADLINE] = MSG.TASK_DEADLINE_REQUIRED;
  } else if (details.deadline.getTime() <= now.getTime()) {
    errors[ListingField.TASK_DEADLINE] = MSG.TASK_DEADLINE_PAST;
  }

  return errors;
}
```

- [ ] **Step 4: Run the TASK tests**

Run: `npm test -- src/modules/student-listings/domain/validation/rules/task.rules.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `rental.rules.ts`**

```ts
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { PropertyType, RentPeriod, TenantGender } from '../../enums/detail.enums';
import type { RentalDetails } from '../../entities/student-listing.entity';
import { ListingField } from '../listing-field';
import { MSG, tenantsExceedRooms } from '../messages';
import { rentalRules } from './rental.rules';

function details(overrides: Partial<RentalDetails> = {}): RentalDetails {
  return {
    kind: StudentListingKind.RENTAL, propertyType: PropertyType.APARTMENT, roomCount: 3,
    currentTenants: 2, neededTenants: 2, gender: TenantGender.MALE, period: RentPeriod.MONTHLY,
    utilitiesIncluded: false, depositMonths: 1, floor: 4, totalFloors: 9, amenities: ['WIFI'],
    availableFrom: null, ...overrides,
  };
}

describe('rentalRules', () => {
  it('passes a well-formed RENTAL', () => {
    expect(rentalRules(details())).toEqual({});
  });

  it('requires a property type', () => {
    expect(rentalRules(details({ propertyType: null }))[ListingField.PROPERTY_TYPE])
      .toBe(MSG.PROPERTY_TYPE_REQUIRED);
  });

  it('requires a room count in 1..20', () => {
    expect(rentalRules(details({ roomCount: null }))[ListingField.ROOMS])
      .toBe(MSG.ROOMS_REQUIRED);
    expect(rentalRules(details({ roomCount: 0 }))[ListingField.ROOMS])
      .toBe(MSG.ROOMS_OUT_OF_RANGE);
    expect(rentalRules(details({ roomCount: 21 }))[ListingField.ROOMS])
      .toBe(MSG.ROOMS_OUT_OF_RANGE);
  });

  it('requires currentTenants in 0..30 and neededTenants in 1..30', () => {
    expect(rentalRules(details({ currentTenants: null }))[ListingField.TENANTS])
      .toBe(MSG.CURRENT_TENANTS_REQUIRED);
    expect(rentalRules(details({ currentTenants: 31 }))[ListingField.TENANTS])
      .toBe(MSG.CURRENT_TENANTS_REQUIRED);
    expect(rentalRules(details({ neededTenants: 0 }))[ListingField.TENANTS])
      .toBe(MSG.NEEDED_TENANTS_REQUIRED);
    expect(rentalRules(details({ neededTenants: null }))[ListingField.TENANTS])
      .toBe(MSG.NEEDED_TENANTS_REQUIRED);
  });

  it('rejects more tenants than the rooms can hold', () => {
    // 2 rooms x 4 = 8 capacity; 5 + 4 = 9 people.
    expect(rentalRules(details({ roomCount: 2, currentTenants: 5, neededTenants: 4 }))
      [ListingField.TENANTS]).toBe(tenantsExceedRooms(2, 9));
  });

  it('requires a gender', () => {
    expect(rentalRules(details({ gender: null }))[ListingField.GENDER])
      .toBe(MSG.GENDER_REQUIRED);
  });

  it('rejects a floor above the building height', () => {
    expect(rentalRules(details({ floor: 10, totalFloors: 9 }))[ListingField.ATTRIBUTES])
      .toBe(MSG.FLOOR_ABOVE_TOTAL);
  });

  it('rejects an unknown amenity key', () => {
    expect(rentalRules(details({ amenities: ['WIFI', 'JACUZZI'] }))[ListingField.ATTRIBUTES])
      .toBe(MSG.CATALOG_KEY_UNKNOWN);
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/domain/validation/rules/rental.rules.spec.ts`
Expected: FAIL — `rental.rules` not found.

- [ ] **Step 7: Implement `rental.rules.ts`**

```ts
import { isKnownAmenity } from '../../catalogs/rental.catalog';
import type { RentalDetails } from '../../entities/student-listing.entity';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG, tenantsExceedRooms } from '../messages';

const ROOMS_MIN = 1;
const ROOMS_MAX = 20;
const CURRENT_TENANTS_MIN = 0;
const TENANTS_MAX = 30;
const NEEDED_TENANTS_MIN = 1;
/** §5.4: four people to a room is the point past which the listing is not honest. */
const PEOPLE_PER_ROOM = 4;

/** §5.4. */
export function rentalRules(details: RentalDetails): FieldErrors {
  const errors: FieldErrors = {};

  if (details.propertyType === null) {
    errors[ListingField.PROPERTY_TYPE] = MSG.PROPERTY_TYPE_REQUIRED;
  }

  const { roomCount, currentTenants, neededTenants } = details;

  if (roomCount === null) {
    errors[ListingField.ROOMS] = MSG.ROOMS_REQUIRED;
  } else if (roomCount < ROOMS_MIN || roomCount > ROOMS_MAX) {
    errors[ListingField.ROOMS] = MSG.ROOMS_OUT_OF_RANGE;
  }

  if (currentTenants === null || currentTenants < CURRENT_TENANTS_MIN || currentTenants > TENANTS_MAX) {
    errors[ListingField.TENANTS] = MSG.CURRENT_TENANTS_REQUIRED;
  } else if (neededTenants === null || neededTenants < NEEDED_TENANTS_MIN || neededTenants > TENANTS_MAX) {
    errors[ListingField.TENANTS] = MSG.NEEDED_TENANTS_REQUIRED;
  } else if (roomCount !== null && currentTenants + neededTenants > roomCount * PEOPLE_PER_ROOM) {
    errors[ListingField.TENANTS] = tenantsExceedRooms(roomCount, currentTenants + neededTenants);
  }

  if (details.gender === null) {
    errors[ListingField.GENDER] = MSG.GENDER_REQUIRED;
  }

  if (details.floor !== null && details.totalFloors !== null && details.floor > details.totalFloors) {
    errors[ListingField.ATTRIBUTES] = MSG.FLOOR_ABOVE_TOTAL;
  } else if (!details.amenities.every(isKnownAmenity)) {
    errors[ListingField.ATTRIBUTES] = MSG.CATALOG_KEY_UNKNOWN;
  }

  return errors;
}
```

- [ ] **Step 8: Run both specs**

Run: `npm test -- src/modules/student-listings/domain/validation`
Expected: PASS, four files.

- [ ] **Step 9: Lint and commit**

```bash
npm run lint
git add src/modules/student-listings/domain/validation
git commit -m "feat(student-listings): add TASK and RENTAL publish rules"
```

---

## Task 6: SERVICE and JOB rules, plus the assembler

**Files:**
- Create: `src/modules/student-listings/domain/validation/rules/service.rules.ts`
- Create: `src/modules/student-listings/domain/validation/rules/job.rules.ts`
- Create: `src/modules/student-listings/domain/validation/validate-for-publish.ts`
- Test: `src/modules/student-listings/domain/validation/rules/service.rules.spec.ts`
- Test: `src/modules/student-listings/domain/validation/rules/job.rules.spec.ts`
- Test: `src/modules/student-listings/domain/validation/validate-for-publish.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces:
  - `serviceRules(details: ServiceDetails): FieldErrors`
  - `jobRules(details: JobDetails, priceUnit: StudentPriceUnit | null): FieldErrors`
  - `validateForPublish(listing: StudentListing, now: Date): FieldErrors`

- [ ] **Step 1: Write the failing test for `service.rules.ts`**

Only §5.5 rows 1 and 5 are enforceable without `ServiceCatalog.kt` (spec §11). The test states that limitation explicitly so nobody later mistakes the gap for a bug.

```ts
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { ServiceFormat, ServiceType } from '../../enums/detail.enums';
import type { ServiceDetails } from '../../entities/student-listing.entity';
import { ListingField } from '../listing-field';
import { MSG } from '../messages';
import { serviceRules } from './service.rules';

function details(overrides: Partial<ServiceDetails> = {}): ServiceDetails {
  return {
    kind: StudentListingKind.SERVICE, serviceType: ServiceType.TUTOR,
    fields: { subject: 'IELTS' }, format: ServiceFormat.OFFLINE, experienceYears: 3,
    workingHours: '09:00 — 21:00', hasHomeVisit: false, hasFreeTrial: true, ...overrides,
  };
}

describe('serviceRules', () => {
  it('passes a well-formed SERVICE', () => {
    expect(serviceRules(details())).toEqual({});
  });

  it('requires a service type', () => {
    expect(serviceRules(details({ serviceType: null }))[ListingField.SERVICE_TYPE])
      .toBe(MSG.SERVICE_TYPE_REQUIRED);
  });

  it('skips the remaining checks when the service type is missing', () => {
    // §5.5: "tanlanmagan bo‘lsa qolgan tekshiruvlar o‘tkazilmaydi".
    const errors = serviceRules(details({ serviceType: null, experienceYears: 999 }));
    expect(errors[ListingField.ATTRIBUTES]).toBeUndefined();
  });

  it('requires serviceName for the OTHER domain', () => {
    expect(serviceRules(details({ serviceType: ServiceType.OTHER, fields: {} }))
      [ListingField.SERVICE_SUBJECT]).toBeDefined();
    expect(serviceRules(details({
      serviceType: ServiceType.OTHER, fields: { serviceName: 'Qandolatchilik' },
    }))).toEqual({});
  });

  it('rejects experienceYears outside 0..60', () => {
    expect(serviceRules(details({ experienceYears: -1 }))[ListingField.ATTRIBUTES])
      .toBe(MSG.EXPERIENCE_YEARS_INVALID);
    expect(serviceRules(details({ experienceYears: 61 }))[ListingField.ATTRIBUTES])
      .toBe(MSG.EXPERIENCE_YEARS_INVALID);
    expect(serviceRules(details({ experienceYears: null }))).toEqual({});
  });

  // Deferred until ServiceCatalog.kt arrives — see spec §11. Documented as a test so the gap is
  // visible rather than silently absent.
  it('does not yet validate fields.subject against the catalog', () => {
    expect(serviceRules(details({ fields: { subject: 'NOT_A_REAL_SUBJECT' } }))).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/domain/validation/rules/service.rules.spec.ts`
Expected: FAIL — `service.rules` not found.

- [ ] **Step 3: Implement `service.rules.ts`**

```ts
import { ServiceType } from '../../enums/detail.enums';
import type { ServiceDetails } from '../../entities/student-listing.entity';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG } from '../messages';

const EXPERIENCE_YEARS_MIN = 0;
const EXPERIENCE_YEARS_MAX = 60;

/**
 * §5.5, partially. `fields.subject` validity and the per-domain `required` field list need
 * ServiceCatalog.kt, which the mobile team has not sent (spec §11) — until then a subject is stored
 * as given. `serviceType` and `experienceYears` are enforced today.
 */
export function serviceRules(details: ServiceDetails): FieldErrors {
  // §5.5: with no domain chosen there is nothing to check the rest against, so stop here.
  if (details.serviceType === null) {
    return { [ListingField.SERVICE_TYPE]: MSG.SERVICE_TYPE_REQUIRED };
  }

  const errors: FieldErrors = {};

  if (details.serviceType === ServiceType.OTHER) {
    const serviceName = details.fields.serviceName;
    if (serviceName === undefined || serviceName.trim().length === 0) {
      errors[ListingField.SERVICE_SUBJECT] = 'Xizmat nomini yozing';
    }
  }

  const years = details.experienceYears;
  if (years !== null && (years < EXPERIENCE_YEARS_MIN || years > EXPERIENCE_YEARS_MAX)) {
    errors[ListingField.ATTRIBUTES] = MSG.EXPERIENCE_YEARS_INVALID;
  }

  return errors;
}
```

- [ ] **Step 4: Run the SERVICE tests**

Run: `npm test -- src/modules/student-listings/domain/validation/rules/service.rules.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `job.rules.ts`**

```ts
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { StudentPriceUnit } from '../../enums/student-price-unit.enum';
import {
  EmploymentType, ExperienceLevel, PayPeriod, WeekDay, WorkShift,
} from '../../enums/detail.enums';
import type { JobDetails } from '../../entities/student-listing.entity';
import { ListingField } from '../listing-field';
import { MSG } from '../messages';
import { jobRules } from './job.rules';

function details(overrides: Partial<JobDetails> = {}): JobDetails {
  return {
    kind: StudentListingKind.JOB, employment: EmploymentType.DAILY, categoryKey: 'COURIER',
    companyName: 'Express Delivery', shift: WorkShift.MORNING,
    schedule: { days: [], startTime: '08:00', endTime: '17:00', hoursPerDay: 8 },
    payPeriod: PayPeriod.DAILY, vacancies: 3, gender: null, experience: ExperienceLevel.NONE,
    ageFrom: 18, ageTo: 30, requirements: [], benefits: [],
    workDate: new Date('2026-08-05T00:00:00Z'), payoutNote: null, ...overrides,
  };
}

describe('jobRules', () => {
  it('passes a well-formed DAILY job', () => {
    expect(jobRules(details(), StudentPriceUnit.PER_DAY)).toEqual({});
  });

  it('requires a category key and rejects an unknown one', () => {
    expect(jobRules(details({ categoryKey: null }), StudentPriceUnit.PER_DAY)
      [ListingField.JOB_CATEGORY]).toBe(MSG.JOB_CATEGORY_REQUIRED);
    expect(jobRules(details({ categoryKey: 'ASTRONAUT' }), StudentPriceUnit.PER_DAY)
      [ListingField.JOB_CATEGORY]).toBe(MSG.CATALOG_KEY_UNKNOWN);
  });

  it('requires a company name', () => {
    expect(jobRules(details({ companyName: '  ' }), StudentPriceUnit.PER_DAY)
      [ListingField.BUSINESS_NAME]).toBe(MSG.COMPANY_NAME_REQUIRED);
  });

  it('requires a shift', () => {
    expect(jobRules(details({ shift: null }), StudentPriceUnit.PER_DAY)[ListingField.JOB_SHIFT])
      .toBe(MSG.JOB_SHIFT_REQUIRED);
  });

  it('requires a time range unless the shift is FLEXIBLE', () => {
    const noTimes = { days: [], startTime: null, endTime: null, hoursPerDay: 8 };
    expect(jobRules(details({ schedule: noTimes }), StudentPriceUnit.PER_DAY)
      [ListingField.JOB_SCHEDULE]).toBe(MSG.JOB_TIME_RANGE_REQUIRED);
    expect(jobRules(details({ shift: WorkShift.FLEXIBLE, schedule: noTimes }),
      StudentPriceUnit.PER_DAY)[ListingField.JOB_SCHEDULE]).toBeUndefined();
  });

  it('requires workDate for a DAILY job', () => {
    expect(jobRules(details({ workDate: null }), StudentPriceUnit.PER_DAY)
      [ListingField.JOB_SCHEDULE]).toBe(MSG.JOB_WORK_DATE_REQUIRED);
  });

  it('requires schedule.days for a PERMANENT job', () => {
    const permanent = details({
      employment: EmploymentType.PERMANENT, payPeriod: PayPeriod.MONTHLY, workDate: null,
    });
    expect(jobRules(permanent, StudentPriceUnit.PER_MONTH)[ListingField.JOB_SCHEDULE])
      .toBe(MSG.JOB_DAYS_REQUIRED);

    const withDays = details({
      employment: EmploymentType.PERMANENT, payPeriod: PayPeriod.MONTHLY, workDate: null,
      schedule: { days: [WeekDay.MONDAY], startTime: '08:00', endTime: '17:00', hoursPerDay: 8 },
    });
    expect(jobRules(withDays, StudentPriceUnit.PER_MONTH)).toEqual({});
  });

  it.each([WorkShift.SHIFT_2_2, WorkShift.SHIFT_1_2, WorkShift.FLEXIBLE])(
    'does not require days for a PERMANENT %s shift', (shift) => {
      const permanent = details({
        employment: EmploymentType.PERMANENT, payPeriod: PayPeriod.MONTHLY, workDate: null, shift,
        schedule: { days: [], startTime: '08:00', endTime: '17:00', hoursPerDay: 8 },
      });
      expect(jobRules(permanent, StudentPriceUnit.PER_MONTH)[ListingField.JOB_SCHEDULE])
        .toBeUndefined();
    });

  it('rejects a 2/2 or 1/2 shift on a DAILY job', () => {
    expect(jobRules(details({ shift: WorkShift.SHIFT_2_2 }), StudentPriceUnit.PER_DAY)
      [ListingField.JOB_SHIFT]).toBeDefined();
  });

  it('rejects a payPeriod the employment type does not allow', () => {
    expect(jobRules(details({ payPeriod: PayPeriod.MONTHLY }), StudentPriceUnit.PER_MONTH)
      [ListingField.JOB_PAY]).toBeDefined();
  });

  it('rejects a priceUnit that contradicts payPeriod', () => {
    expect(jobRules(details({ payPeriod: PayPeriod.HOURLY }), StudentPriceUnit.PER_MONTH)
      [ListingField.JOB_PAY]).toBeDefined();
    expect(jobRules(details({ payPeriod: PayPeriod.HOURLY }), StudentPriceUnit.PER_HOUR)
      [ListingField.JOB_PAY]).toBeUndefined();
  });

  it('rejects hoursPerDay outside 1..24', () => {
    const schedule = { days: [], startTime: '08:00', endTime: '17:00', hoursPerDay: 25 };
    expect(jobRules(details({ schedule }), StudentPriceUnit.PER_DAY)[ListingField.JOB_SCHEDULE])
      .toBe(MSG.JOB_HOURS_OUT_OF_RANGE);
  });

  it('rejects vacancies outside 1..100', () => {
    expect(jobRules(details({ vacancies: 0 }), StudentPriceUnit.PER_DAY)[ListingField.JOB_PAY])
      .toBe(MSG.JOB_VACANCIES_REQUIRED);
    expect(jobRules(details({ vacancies: 101 }), StudentPriceUnit.PER_DAY)[ListingField.JOB_PAY])
      .toBe(MSG.JOB_VACANCIES_REQUIRED);
  });

  it('rejects an inverted age range', () => {
    expect(jobRules(details({ ageFrom: 30, ageTo: 18 }), StudentPriceUnit.PER_DAY)
      [ListingField.ATTRIBUTES]).toBe(MSG.AGE_RANGE_INVALID);
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/domain/validation/rules/job.rules.spec.ts`
Expected: FAIL — `job.rules` not found.

- [ ] **Step 7: Implement `job.rules.ts`**

```ts
import { isKnownJobCategoryKey } from '../../catalogs/job.catalog';
import { EmploymentType, PayPeriod, WorkShift } from '../../enums/detail.enums';
import { StudentPriceUnit } from '../../enums/student-price-unit.enum';
import type { JobDetails } from '../../entities/student-listing.entity';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG } from '../messages';

const VACANCIES_MIN = 1;
const VACANCIES_MAX = 100;
const HOURS_MIN = 1;
const HOURS_MAX = 24;

/** §4.4: a rotating shift only makes sense on a permanent job. */
const DAILY_SHIFTS: readonly WorkShift[] = [
  WorkShift.MORNING, WorkShift.DAY, WorkShift.EVENING, WorkShift.NIGHT, WorkShift.FLEXIBLE,
];

/** §4.4: which pay periods each employment type accepts. */
const ALLOWED_PAY_PERIODS: Readonly<Record<EmploymentType, readonly PayPeriod[]>> = {
  [EmploymentType.DAILY]: [PayPeriod.DAILY, PayPeriod.HOURLY, PayPeriod.PER_TASK],
  [EmploymentType.PERMANENT]: [
    PayPeriod.MONTHLY, PayPeriod.DAILY, PayPeriod.HOURLY, PayPeriod.WEEKLY,
  ],
};

/** §4.4: the price unit a pay period implies. */
const PAY_PERIOD_PRICE_UNIT: Readonly<Record<PayPeriod, StudentPriceUnit>> = {
  [PayPeriod.HOURLY]: StudentPriceUnit.PER_HOUR,
  [PayPeriod.DAILY]: StudentPriceUnit.PER_DAY,
  [PayPeriod.WEEKLY]: StudentPriceUnit.PER_DAY,
  [PayPeriod.MONTHLY]: StudentPriceUnit.PER_MONTH,
  [PayPeriod.PER_TASK]: StudentPriceUnit.PER_ITEM,
};

/** §4.4: these shifts have no fixed weekday pattern, so days are not demanded. */
const SHIFTS_WITHOUT_DAYS: readonly WorkShift[] = [
  WorkShift.SHIFT_2_2, WorkShift.SHIFT_1_2, WorkShift.FLEXIBLE,
];

/** §5.6 plus the §4.4 employment-type constraints. */
export function jobRules(details: JobDetails, priceUnit: StudentPriceUnit | null): FieldErrors {
  const errors: FieldErrors = {};

  if (details.categoryKey === null || details.categoryKey.trim().length === 0) {
    errors[ListingField.JOB_CATEGORY] = MSG.JOB_CATEGORY_REQUIRED;
  } else if (!isKnownJobCategoryKey(details.categoryKey)) {
    errors[ListingField.JOB_CATEGORY] = MSG.CATALOG_KEY_UNKNOWN;
  }

  if (details.companyName === null || details.companyName.trim().length === 0) {
    errors[ListingField.BUSINESS_NAME] = MSG.COMPANY_NAME_REQUIRED;
  }

  const { shift, employment } = details;

  if (shift === null) {
    errors[ListingField.JOB_SHIFT] = MSG.JOB_SHIFT_REQUIRED;
  } else if (employment === EmploymentType.DAILY && !DAILY_SHIFTS.includes(shift)) {
    errors[ListingField.JOB_SHIFT] = 'Bu smena faqat doimiy ish uchun';
  }

  const scheduleError = scheduleErrorOf(details);
  if (scheduleError !== null) {
    errors[ListingField.JOB_SCHEDULE] = scheduleError;
  }

  const payError = payErrorOf(details, priceUnit);
  if (payError !== null) {
    errors[ListingField.JOB_PAY] = payError;
  }

  if (details.ageFrom !== null && details.ageTo !== null && details.ageFrom > details.ageTo) {
    errors[ListingField.ATTRIBUTES] = MSG.AGE_RANGE_INVALID;
  }

  return errors;
}

function scheduleErrorOf(details: JobDetails): string | null {
  const { shift, employment, schedule } = details;

  if (shift !== WorkShift.FLEXIBLE && (schedule.startTime === null || schedule.endTime === null)) {
    return MSG.JOB_TIME_RANGE_REQUIRED;
  }
  if (employment === EmploymentType.DAILY && details.workDate === null) {
    return MSG.JOB_WORK_DATE_REQUIRED;
  }
  if (
    employment === EmploymentType.PERMANENT &&
    schedule.days.length === 0 &&
    (shift === null || !SHIFTS_WITHOUT_DAYS.includes(shift))
  ) {
    return MSG.JOB_DAYS_REQUIRED;
  }
  if (
    schedule.hoursPerDay !== null &&
    (schedule.hoursPerDay < HOURS_MIN || schedule.hoursPerDay > HOURS_MAX)
  ) {
    return MSG.JOB_HOURS_OUT_OF_RANGE;
  }
  return null;
}

function payErrorOf(details: JobDetails, priceUnit: StudentPriceUnit | null): string | null {
  const { vacancies, payPeriod, employment } = details;

  if (vacancies === null || vacancies < VACANCIES_MIN || vacancies > VACANCIES_MAX) {
    return MSG.JOB_VACANCIES_REQUIRED;
  }
  if (payPeriod !== null && employment !== null && !ALLOWED_PAY_PERIODS[employment].includes(payPeriod)) {
    return 'To‘lov davri ish turiga to‘g‘ri kelmaydi';
  }
  if (payPeriod !== null && priceUnit !== null && PAY_PERIOD_PRICE_UNIT[payPeriod] !== priceUnit) {
    return 'Narx birligi to‘lov davriga to‘g‘ri kelmaydi';
  }
  return null;
}
```

- [ ] **Step 8: Run the JOB tests**

Run: `npm test -- src/modules/student-listings/domain/validation/rules/job.rules.spec.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing test for the assembler**

```ts
import { StudentListingKind } from '../enums/student-listing-kind.enum';
import { ListingField } from './listing-field';
import { MSG } from './messages';
import { validateForPublish } from './validate-for-publish';
// Reuse the validRental helper from common.rules.spec.ts — copy it into this file.

const NOW = new Date('2026-08-03T00:00:00Z');

describe('validateForPublish', () => {
  it('returns {} for a publishable listing', () => {
    expect(validateForPublish(validRental({ branches: [pin(41.2856, 69.2034)] }), NOW)).toEqual({});
  });

  it('collects errors from every rule group at once', () => {
    const broken = validRental({
      title: '', images: [], branches: [],
      details: {
        kind: StudentListingKind.RENTAL, propertyType: null, roomCount: null, currentTenants: null,
        neededTenants: null, gender: null, period: null, utilitiesIncluded: false,
        depositMonths: null, floor: null, totalFloors: null, amenities: [], availableFrom: null,
      },
    });
    const errors = validateForPublish(broken, NOW);
    expect(errors[ListingField.TITLE]).toBe(MSG.TITLE_REQUIRED);
    expect(errors[ListingField.IMAGES]).toBe(MSG.IMAGES_REQUIRED);
    expect(errors[ListingField.LOCATION]).toBe(MSG.LOCATION_REQUIRED_RENTAL);
    expect(errors[ListingField.GENDER]).toBe(MSG.GENDER_REQUIRED);
  });

  it('keeps the first message when two rule groups target one field', () => {
    // Common rules run first, so their ATTRIBUTES message must not be replaced by a later one.
    const listing = validRental({
      details: {
        kind: StudentListingKind.RENTAL, propertyType: null, roomCount: 3, currentTenants: 1,
        neededTenants: 1, gender: null, period: null, utilitiesIncluded: false,
        depositMonths: null, floor: 10, totalFloors: 9, amenities: ['JACUZZI'],
        availableFrom: null,
      },
      branches: [pin(41.2856, 69.2034)],
    });
    expect(validateForPublish(listing, NOW)[ListingField.ATTRIBUTES]).toBe(MSG.FLOOR_ABOVE_TOTAL);
  });
});
```

- [ ] **Step 10: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/domain/validation/validate-for-publish.spec.ts`
Expected: FAIL — `validate-for-publish` not found.

- [ ] **Step 11: Implement `validate-for-publish.ts`**

```ts
import { StudentListingKind } from '../enums/student-listing-kind.enum';
import type { StudentListing } from '../entities/student-listing.entity';
import type { FieldErrors } from './listing-field';
import { commonRules } from './rules/common.rules';
import { jobRules } from './rules/job.rules';
import { locationRules } from './rules/location.rules';
import { rentalRules } from './rules/rental.rules';
import { serviceRules } from './rules/service.rules';
import { taskRules } from './rules/task.rules';

/**
 * Every §5 publish rule, in one pure pass. `{}` means the listing may go live.
 *
 * The client runs the same rules in ListingValidator.kt, but a client cannot be trusted — this is
 * the authoritative check. `now` is a parameter so deadline rules are deterministic under test.
 *
 * DRAFTs never reach this function: a half-filled form must be saveable (spec §4).
 */
export function validateForPublish(listing: StudentListing, now: Date): FieldErrors {
  const groups: FieldErrors[] = [commonRules(listing), locationRules(listing)];

  switch (listing.details.kind) {
    case StudentListingKind.TASK:
      groups.push(taskRules(listing.details, listing.description, now));
      break;
    case StudentListingKind.RENTAL:
      groups.push(rentalRules(listing.details));
      break;
    case StudentListingKind.SERVICE:
      groups.push(serviceRules(listing.details));
      break;
    case StudentListingKind.JOB:
      groups.push(jobRules(listing.details, listing.priceUnit));
      break;
  }

  return mergeFirstWins(groups);
}

/**
 * Merges rule groups without overwriting: when two groups flag the same field, the earlier (more
 * general) message wins, so the reported error stays stable as kind-specific rules are added.
 */
function mergeFirstWins(groups: FieldErrors[]): FieldErrors {
  const merged: FieldErrors = {};
  for (const group of groups) {
    for (const [field, message] of Object.entries(group) as [keyof FieldErrors, string][]) {
      if (merged[field] === undefined) {
        merged[field] = message;
      }
    }
  }
  return merged;
}
```

- [ ] **Step 12: Run the whole validation suite**

Run: `npm test -- src/modules/student-listings/domain`
Expected: PASS, all seven spec files.

- [ ] **Step 13: Lint and commit**

```bash
npm run lint
git add src/modules/student-listings/domain
git commit -m "feat(student-listings): add SERVICE and JOB rules and the publish validator"
```

---

## Task 7: Repository port

**Files:**
- Create: `src/modules/student-listings/domain/student-listing.repository.ts`

**Interfaces:**
- Consumes: entity types from Task 2.
- Produces: `STUDENT_LISTING_REPOSITORY` (Symbol), `CreateStudentListingData`, `UpdateStudentListingData`, `StudentListingBranchData`, `StudentListingPage`, `OwnListingsQuery`, `DuplicateProbe`, `StudentListingRepository`.

- [ ] **Step 1: Write the port**

```ts
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { ListingAudience } from './enums/listing-audience.enum';
import { StudentListingKind } from './enums/student-listing-kind.enum';
import { StudentPriceUnit } from './enums/student-price-unit.enum';
import type {
  ListingOptionGroup, StudentListing, StudentListingDetails,
} from './entities/student-listing.entity';

/** Injection token for the student-listing repository port (bound to Prisma in the module). */
export const STUDENT_LISTING_REPOSITORY = Symbol('STUDENT_LISTING_REPOSITORY');

/** A map pin to persist; the DB assigns the id and derives `geo_point` from lat/lng. */
export interface StudentListingBranchData {
  lat: number;
  lng: number;
  address: string;
  name: string | null;
  landmark: string | null;
  regionId: string | null;
  districtId: string | null;
}

/**
 * The whole aggregate to persist. `ownerId`, `status` and `searchText` are decided by the service;
 * `idempotencyKey` is the client's `Idempotency-Key` header, or null when absent.
 */
export interface CreateStudentListingData {
  ownerId: string;
  kind: StudentListingKind;
  title: string;
  description: string | null;
  images: string[];
  priceUnit: StudentPriceUnit | null;
  price: number;
  priceMax: number | null;
  isNegotiable: boolean;
  contactPhone: string | null;
  universityId: string | null;
  audience: ListingAudience;
  branches: StudentListingBranchData[];
  validFrom: Date | null;
  validTo: Date | null;
  attributes: Record<string, string>;
  optionGroups: ListingOptionGroup[];
  details: StudentListingDetails;
  status: ListingStatus;
  publishedAt: Date | null;
  searchText: string;
  idempotencyKey: string | null;
}

/** Editable columns. `kind`, `ownerId`, `status` and `viewsCount` are never changed by an edit. */
export type UpdateStudentListingData = Omit<
  CreateStudentListingData,
  'ownerId' | 'kind' | 'status' | 'publishedAt' | 'idempotencyKey'
>;

/** `GET /mine` — 1-based page over every status and kind the student owns. */
export interface OwnListingsQuery {
  page: number;
  size: number;
}

export interface StudentListingPage {
  items: StudentListing[];
  total: number;
}

/** The §6 duplicate probe: same kind + title + price by the same student inside the window. */
export interface DuplicateProbe {
  ownerId: string;
  kind: StudentListingKind;
  title: string;
  price: number;
  since: Date;
}

/**
 * Data-access port. The application layer depends only on this; Prisma lives in infrastructure.
 */
export interface StudentListingRepository {
  /** Persists listing + pins atomically. Returns the stored aggregate. */
  create(data: CreateStudentListingData): Promise<StudentListing>;

  /**
   * The row a previous request with this `Idempotency-Key` created, or null. Scoped to the owner so
   * one student's key cannot surface another's listing.
   */
  findByIdempotencyKey(ownerId: string, key: string): Promise<StudentListing | null>;

  /** Loads by id including pins. Returns null when missing or soft-deleted. */
  findById(id: string): Promise<StudentListing | null>;

  /** Replaces the editable columns and the pin set wholesale, in one transaction. */
  update(id: string, data: UpdateStudentListingData): Promise<StudentListing>;

  /** Sets status (and `publishedAt` when moving to a published state). */
  setStatus(id: string, status: ListingStatus, publishedAt: Date | null): Promise<StudentListing>;

  /** Soft delete — stamps `deletedAt`; every read filters it out. */
  softDelete(id: string): Promise<void>;

  /** A page of the student's own listings, `updatedAt DESC, id DESC`. */
  findPageByOwner(ownerId: string, query: OwnListingsQuery): Promise<StudentListingPage>;

  /** Increments `viewsCount` by one. Fire-and-forget from the caller's perspective. */
  incrementViews(id: string): Promise<void>;

  /** How many listings the student currently has in ACTIVE (§6 cap of 20). */
  countActiveByOwner(ownerId: string): Promise<number>;

  /** How many times the student published since `since` (§6 cap of 10 per day). */
  countPublishedSince(ownerId: string, since: Date): Promise<number>;

  /** True when a non-deleted twin already exists inside the window (§6 LISTING_DUPLICATE). */
  existsDuplicate(probe: DuplicateProbe): Promise<boolean>;

  /**
   * True when either student has blocked the other. Reads the existing `blocks` table in both
   * directions — a blocked pair must not see each other's listings (spec §6).
   */
  isBlockedBetween(studentA: string, studentB: string): Promise<boolean>;

  /** True when the student's account is ACTIVE. A banned owner's listings disappear (spec §6). */
  isOwnerActive(ownerId: string): Promise<boolean>;
}
```

Both new methods read tables this module does not own (`blocks`, `students`), which is fine — a
repository may read across aggregates; it just must not write them.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/student-listings/domain/student-listing.repository.ts
git commit -m "feat(student-listings): add repository port"
```

---

## Task 8: Mapper

**Files:**
- Create: `src/modules/student-listings/infrastructure/student-listing.mapper.ts`
- Test: `src/modules/student-listings/infrastructure/student-listing.mapper.spec.ts`

**Interfaces:**
- Consumes: entity types (Task 2), Prisma model types.
- Produces:
  - `toDetailColumns(details: StudentListingDetails): DetailColumns` — the flat filter columns
  - `parseDetails(kind, raw: Prisma.JsonValue): StudentListingDetails` — JSONB → typed union
  - `toEntity(row: StudentListingRow): StudentListing`
  - `buildSearchText(listing): string`

The round-trip is what this task protects: a field that the mapper writes to JSONB but forgets to promote silently makes a filter return nothing.

- [ ] **Step 1: Write the failing test**

```ts
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';
import {
  EmploymentType, ExperienceLevel, PayPeriod, PropertyType, RentPeriod, ServiceFormat,
  ServiceType, TaskCategory, TaskFormat, TenantGender, WorkShift,
} from '../domain/enums/detail.enums';
import { parseDetails, toDetailColumns } from './student-listing.mapper';

describe('student-listing mapper', () => {
  it('promotes RENTAL filter fields to flat columns', () => {
    const columns = toDetailColumns({
      kind: StudentListingKind.RENTAL, propertyType: PropertyType.APARTMENT, roomCount: 3,
      currentTenants: 2, neededTenants: 1, gender: TenantGender.MALE, period: RentPeriod.MONTHLY,
      utilitiesIncluded: false, depositMonths: 1, floor: 4, totalFloors: 9, amenities: ['WIFI'],
      availableFrom: null,
    });
    expect(columns.rentalGender).toBe('MALE');
    expect(columns.rentalPropertyType).toBe('APARTMENT');
    expect(columns.rentalRoomCount).toBe(3);
    expect(columns.rentalNeededTenants).toBe(1);
    expect(columns.taskDeadline).toBeNull();
    expect(columns.jobCategoryKey).toBeNull();
  });

  it('promotes TASK deadline as a Date', () => {
    const deadline = new Date('2026-08-14T18:00:00Z');
    const columns = toDetailColumns({
      kind: StudentListingKind.TASK, category: TaskCategory.EXACT, typeKey: 'MATH',
      customTypeName: null, deadline, format: TaskFormat.ONLINE, volume: null,
    });
    expect(columns.taskCategory).toBe('EXACT');
    expect(columns.taskTypeKey).toBe('MATH');
    expect(columns.taskFormat).toBe('ONLINE');
    expect(columns.taskDeadline).toEqual(deadline);
  });

  it('promotes SERVICE and JOB filter fields', () => {
    const service = toDetailColumns({
      kind: StudentListingKind.SERVICE, serviceType: ServiceType.TUTOR, fields: {},
      format: ServiceFormat.HYBRID, experienceYears: 3, workingHours: null,
      hasHomeVisit: false, hasFreeTrial: true,
    });
    expect(service.serviceType).toBe('TUTOR');
    expect(service.serviceFormat).toBe('HYBRID');
    expect(service.serviceHasFreeTrial).toBe(true);

    const job = toDetailColumns({
      kind: StudentListingKind.JOB, employment: EmploymentType.DAILY, categoryKey: 'COURIER',
      companyName: 'X', shift: WorkShift.MORNING,
      schedule: { days: [], startTime: null, endTime: null, hoursPerDay: null },
      payPeriod: PayPeriod.DAILY, vacancies: 1, gender: null,
      experience: ExperienceLevel.NONE, ageFrom: null, ageTo: null,
      requirements: [], benefits: [], workDate: null, payoutNote: null,
    });
    expect(job.jobEmployment).toBe('DAILY');
    expect(job.jobCategoryKey).toBe('COURIER');
    expect(job.jobShift).toBe('MORNING');
    expect(job.jobExperience).toBe('NONE');
  });

  it('round-trips details through JSONB, restoring Date fields', () => {
    const original = {
      kind: StudentListingKind.TASK, category: TaskCategory.EXACT, typeKey: 'MATH',
      customTypeName: null, deadline: new Date('2026-08-14T18:00:00Z'),
      format: TaskFormat.ONLINE, volume: '12 ta masala',
    } as const;
    const stored = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
    const restored = parseDetails(StudentListingKind.TASK, stored);
    expect(restored).toEqual(original);
  });

  it('fills a missing draft field with null rather than throwing', () => {
    const restored = parseDetails(StudentListingKind.RENTAL, { kind: 'RENTAL' });
    expect(restored).toEqual({
      kind: StudentListingKind.RENTAL, propertyType: null, roomCount: null, currentTenants: null,
      neededTenants: null, gender: null, period: null, utilitiesIncluded: false,
      depositMonths: null, floor: null, totalFloors: null, amenities: [], availableFrom: null,
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/infrastructure/student-listing.mapper.spec.ts`
Expected: FAIL — mapper not found.

- [ ] **Step 3: Implement `student-listing.mapper.ts`**

Write it with three exported pieces:

1. `DetailColumns` — an interface with the 15 flat fields (`rentalGender: string | null`, …, `taskDeadline: Date | null`).
2. `toDetailColumns(details)` — a `switch` on `details.kind` filling only that kind's columns; every other column is `null`. Start from `const empty: DetailColumns = { rentalGender: null, …all 15 null }` and spread per kind, so a new column can never be silently forgotten.
3. `parseDetails(kind, raw)` — a `switch` on `kind` reading each field off the JSON object with a null default, and `new Date(value)` for `deadline`, `availableFrom` and `workDate`. Guard with small typed readers so no `any` appears:

```ts
function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' ? value : null;
}

function readBoolean(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true;
}

function readDate(source: Record<string, unknown>, key: string): Date | null {
  const value = source[key];
  return typeof value === 'string' ? new Date(value) : null;
}

function readStringArray(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readEnum<T extends string>(
  source: Record<string, unknown>, key: string, allowed: readonly T[],
): T | null {
  const value = source[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}
```

4. `buildSearchText(listing)` — joins `title`, `description`, every branch `address`, `details.typeKey`/`categoryKey`/`serviceType` and the amenity keys with `' '`, dropping nulls. The DB trigger turns it into the tsvector.

5. `toEntity(row)` — maps the Prisma row plus its `branches` relation to `StudentListing`, converting `BigInt` price columns with `Number(...)` and calling `parseDetails(row.kind, row.details)`.

- [ ] **Step 4: Run the mapper tests**

Run: `npm test -- src/modules/student-listings/infrastructure/student-listing.mapper.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/modules/student-listings/infrastructure
git commit -m "feat(student-listings): add details/column mapper"
```

---

## Task 9: Prisma repository

**Files:**
- Create: `src/modules/student-listings/infrastructure/student-listing.prisma.repository.ts`

**Interfaces:**
- Consumes: `StudentListingRepository` and its data types (Task 7), the mapper (Task 8), `PrismaService`.
- Produces: `StudentListingPrismaRepository implements StudentListingRepository`.

Find the existing `PrismaService` import path with `grep -rn "PrismaService" src/modules/listings/infrastructure/listing.prisma.repository.ts` and match it exactly.

- [ ] **Step 1: Implement the repository**

Follow `src/modules/listings/infrastructure/listing.prisma.repository.ts` for structure: `@Injectable()`, constructor-injected `PrismaService`, one method per port method, all reads including `branches: true`.

Points that are easy to get wrong:

- **Every read filters `deletedAt: null`** — `findById`, `findPageByOwner`, `existsDuplicate`, both counters.
- `create` and `update` run in `this.prisma.$transaction` and write pins via nested `branches: { create: [...] }`. `update` replaces pins with `branches: { deleteMany: {}, create: [...] }`.
- `create` spreads `...toDetailColumns(data.details)` alongside the scalar columns.
- `price`/`priceMax` are written as `BigInt(value)` and read back through the mapper's `Number(...)`.
- `setStatus` writes `publishedAt` only when the argument is non-null, so re-activating does not clobber the original publish time:
  ```ts
  data: { status, ...(publishedAt !== null ? { publishedAt } : {}) },
  ```
- `existsDuplicate` uses `count` with `{ ownerId, kind, title, price: BigInt(price), createdAt: { gte: since }, deletedAt: null }` and returns `count > 0`.
- `countPublishedSince` counts `{ ownerId, publishedAt: { gte: since } }`.
- `incrementViews` uses `{ viewsCount: { increment: 1 } }`.
- `findPageByOwner` orders `[{ updatedAt: 'desc' }, { id: 'desc' }]` and returns `{ items, total }` from a `$transaction([findMany, count])`.
- `isBlockedBetween` counts the `block` table in **both** directions and returns `count > 0`:
  ```ts
  const count = await this.prisma.block.count({
    where: {
      OR: [
        { blockerId: studentA, blockedId: studentB },
        { blockerId: studentB, blockedId: studentA },
      ],
    },
  });
  return count > 0;
  ```
  (`blockerId`/`blockedId` are the real column names — verified against `model Block` in `prisma/schema.prisma`.)
- `isOwnerActive` reads `student.findUnique({ where: { id: ownerId }, select: { status: true } })` and returns `row?.status === StudentStatus.ACTIVE`.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint and commit**

```bash
npm run lint
git add src/modules/student-listings/infrastructure
git commit -m "feat(student-listings): add Prisma repository"
```

---

## Task 10: Anti-spam limits

**Files:**
- Create: `src/modules/student-listings/application/anti-spam.ts`
- Test: `src/modules/student-listings/application/anti-spam.spec.ts`

**Interfaces:**
- Consumes: `StudentListingRepository` (Task 7), `AppException`, `ERROR_CODE`.
- Produces: `assertMayPublish(repo, listing, now): Promise<void>` — throws `AppException`, returns void when clear. Constants `MAX_ACTIVE_LISTINGS = 20`, `MAX_DAILY_SUBMITS = 10`, `DUPLICATE_WINDOW_HOURS = 24`.

- [ ] **Step 1: Add the new error codes**

In `src/common/errors/error-code.ts`, add to the `ERROR_CODE` object (keep the existing style and grouping comments):

```ts
  // student listings (STUDENT_LISTINGS_BACKEND.md §8)
  LISTING_VALIDATION_FAILED: 'LISTING_VALIDATION_FAILED',
  LISTING_KIND_MISMATCH: 'LISTING_KIND_MISMATCH',
  LISTING_KIND_IMMUTABLE: 'LISTING_KIND_IMMUTABLE',
  LISTING_FORBIDDEN: 'LISTING_FORBIDDEN',
  LISTING_STATUS_INVALID: 'LISTING_STATUS_INVALID',
  LISTING_LIMIT_REACHED: 'LISTING_LIMIT_REACHED',
  LISTING_DUPLICATE: 'LISTING_DUPLICATE',
  CATALOG_KEY_UNKNOWN: 'CATALOG_KEY_UNKNOWN',
  PAGE_CURSOR_INVALID: 'PAGE_CURSOR_INVALID',
  GEO_OUT_OF_BOUNDS: 'GEO_OUT_OF_BOUNDS',
```

`LISTING_NOT_FOUND` already exists — do not add it twice.

- [ ] **Step 2: Write the failing test**

```ts
import { AppException } from '../../../common/exceptions/app.exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';
import type { StudentListingRepository } from '../domain/student-listing.repository';
import { assertMayPublish } from './anti-spam';

const NOW = new Date('2026-08-03T12:00:00Z');

function repo(overrides: Partial<StudentListingRepository> = {}): StudentListingRepository {
  return {
    countActiveByOwner: jest.fn().mockResolvedValue(0),
    countPublishedSince: jest.fn().mockResolvedValue(0),
    existsDuplicate: jest.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as StudentListingRepository;
}

const listing = {
  id: 'lst_1', ownerId: 'usr_1', kind: StudentListingKind.RENTAL,
  title: 'Sherik kerak', price: 1_500_000,
};

describe('assertMayPublish', () => {
  it('passes when every limit is clear', async () => {
    await expect(assertMayPublish(repo(), listing, NOW)).resolves.toBeUndefined();
  });

  it('rejects a 21st active listing', async () => {
    const call = assertMayPublish(
      repo({ countActiveByOwner: jest.fn().mockResolvedValue(20) }), listing, NOW,
    );
    await expect(call).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_LIMIT_REACHED, status: 429,
    });
  });

  it('rejects an 11th publish in a day', async () => {
    const call = assertMayPublish(
      repo({ countPublishedSince: jest.fn().mockResolvedValue(10) }), listing, NOW,
    );
    await expect(call).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_LIMIT_REACHED, status: 429,
    });
  });

  it('rejects a duplicate inside the 24h window', async () => {
    const call = assertMayPublish(
      repo({ existsDuplicate: jest.fn().mockResolvedValue(true) }), listing, NOW,
    );
    await expect(call).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_DUPLICATE, status: 409,
    });
  });

  it('probes the duplicate window from 24h before now', async () => {
    const existsDuplicate = jest.fn().mockResolvedValue(false);
    await assertMayPublish(repo({ existsDuplicate }), listing, NOW);
    expect(existsDuplicate).toHaveBeenCalledWith({
      ownerId: 'usr_1', kind: StudentListingKind.RENTAL, title: 'Sherik kerak',
      price: 1_500_000, since: new Date('2026-08-02T12:00:00Z'),
    });
  });

  it('throws AppException, never a bare Error', async () => {
    const call = assertMayPublish(
      repo({ existsDuplicate: jest.fn().mockResolvedValue(true) }), listing, NOW,
    );
    await expect(call).rejects.toBeInstanceOf(AppException);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/application/anti-spam.spec.ts`
Expected: FAIL — `anti-spam` not found.

- [ ] **Step 4: Implement `anti-spam.ts`**

```ts
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';
import type { StudentListingRepository } from '../domain/student-listing.repository';

/** §6 "Anti-spam limitlari". */
export const MAX_ACTIVE_LISTINGS = 20;
export const MAX_DAILY_PUBLISHES = 10;
export const DUPLICATE_WINDOW_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/** The parts of a listing the limits look at — deliberately narrow so tests need no full entity. */
export interface PublishCandidate {
  id: string;
  ownerId: string;
  kind: StudentListingKind;
  title: string;
  price: number;
}

/**
 * The only gate between a valid listing and going live: there is no moderation (spec §5). Throws on
 * the first limit breached; returns silently when the student may publish.
 */
export async function assertMayPublish(
  repository: StudentListingRepository,
  listing: PublishCandidate,
  now: Date,
): Promise<void> {
  const activeCount = await repository.countActiveByOwner(listing.ownerId);
  if (activeCount >= MAX_ACTIVE_LISTINGS) {
    throw new AppException(
      ERROR_CODE.LISTING_LIMIT_REACHED, 429,
      `Bir vaqtda ${MAX_ACTIVE_LISTINGS} tadan ko‘p faol e’lon bo‘lmaydi`,
    );
  }

  const dayAgo = new Date(now.getTime() - 24 * HOUR_MS);
  const publishedToday = await repository.countPublishedSince(listing.ownerId, dayAgo);
  if (publishedToday >= MAX_DAILY_PUBLISHES) {
    throw new AppException(
      ERROR_CODE.LISTING_LIMIT_REACHED, 429,
      `Kuniga ${MAX_DAILY_PUBLISHES} tadan ko‘p e’lon joylay olmaysiz`,
    );
  }

  const duplicate = await repository.existsDuplicate({
    ownerId: listing.ownerId,
    kind: listing.kind,
    title: listing.title,
    price: listing.price,
    since: new Date(now.getTime() - DUPLICATE_WINDOW_HOURS * HOUR_MS),
  });
  if (duplicate) {
    throw new AppException(
      ERROR_CODE.LISTING_DUPLICATE, 409, 'Bunday e’lon yaqinda joylangan',
    );
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/modules/student-listings/application/anti-spam.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/common/errors/error-code.ts src/modules/student-listings/application
git commit -m "feat(student-listings): add error codes and anti-spam limits"
```

---

## Task 11: Application service

**Files:**
- Create: `src/modules/student-listings/application/student-listing.io.ts`
- Create: `src/modules/student-listings/application/student-listings.service.ts`
- Test: `src/modules/student-listings/application/student-listings.service.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–10.
- Produces: `StudentListingsService` with
  - `create(ownerId, input: CreateListingInput, idempotencyKey: string | null): Promise<StudentListing>`
  - `patch(ownerId, id, input: PatchListingInput): Promise<StudentListing>`
  - `submit(ownerId, id): Promise<StudentListing>`
  - `setStatus(ownerId, id, status: ListingStatus): Promise<StudentListing>`
  - `remove(ownerId, id): Promise<void>`
  - `findOwn(ownerId, page, size): Promise<StudentListingPage>`
  - `findVisible(viewerId, id): Promise<StudentListing>`

`student-listing.io.ts` holds `CreateListingInput` and `PatchListingInput` — the same fields as `CreateStudentListingData` minus `ownerId`/`status`/`searchText`, with every field optional on the patch type.

- [ ] **Step 1: Write the failing test**

Cover the branches that carry real risk. Mock the repository with `jest.fn()`s.

Set up a mock repository whose methods are all `jest.fn()`, plus a `validRental()` entity helper
(copy the one from `common.rules.spec.ts` and give it `branches: [{ id: 'br_1', lat: 41.2856,
lng: 69.2034, address: 'Chilonzor 9', name: null, landmark: null, regionId: null, districtId: null }]`
so it is publishable).

```ts
import { ERROR_CODE } from '../../../common/errors/error-code';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
import { StudentListingKind } from '../domain/enums/student-listing-kind.enum';
import { ListingField } from '../domain/validation/listing-field';
import { MSG } from '../domain/validation/messages';
import { STUDENT_LISTING_REPOSITORY } from '../domain/student-listing.repository';
import { StudentListingsService } from './student-listings.service';

function makeRepository() {
  return {
    create: jest.fn((data) => Promise.resolve({ ...validRental(), ...data, id: 'lst_new' })),
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    update: jest.fn((id, data) => Promise.resolve({ ...validRental(), ...data, id })),
    setStatus: jest.fn((id, status) => Promise.resolve({ ...validRental(), id, status })),
    softDelete: jest.fn().mockResolvedValue(undefined),
    findPageByOwner: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    incrementViews: jest.fn().mockResolvedValue(undefined),
    countActiveByOwner: jest.fn().mockResolvedValue(0),
    countPublishedSince: jest.fn().mockResolvedValue(0),
    existsDuplicate: jest.fn().mockResolvedValue(false),
    isBlockedBetween: jest.fn().mockResolvedValue(false),
    isOwnerActive: jest.fn().mockResolvedValue(true),
  };
}

async function build(repository: ReturnType<typeof makeRepository>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StudentListingsService,
      { provide: STUDENT_LISTING_REPOSITORY, useValue: repository },
    ],
  }).compile();
  return moduleRef.get(StudentListingsService);
}

/** Everything a publishable RENTAL create needs, so a test can omit one field to break it. */
function createInput(overrides: Record<string, unknown> = {}) {
  const base = validRental();
  return {
    kind: StudentListingKind.RENTAL,
    title: base.title,
    description: null,
    images: base.images,
    priceUnit: base.priceUnit,
    price: base.price,
    priceMax: null,
    isNegotiable: false,
    contactPhone: base.contactPhone,
    universityId: null,
    audience: base.audience,
    branches: base.branches,
    validFrom: base.validFrom,
    validTo: base.validTo,
    attributes: {},
    optionGroups: [],
    details: base.details,
    ...overrides,
  };
}

describe('StudentListingsService', () => {
  it('saves a DRAFT without running publish validation', async () => {
    const repository = makeRepository();
    const service = await build(repository);

    await service.create('usr_1', createInput({
      submit: false, title: '', images: [], contactPhone: null,
      details: { kind: StudentListingKind.RENTAL, propertyType: null, roomCount: null,
        currentTenants: null, neededTenants: null, gender: null, period: null,
        utilitiesIncluded: false, depositMonths: null, floor: null, totalFloors: null,
        amenities: [], availableFrom: null },
    }), null);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: ListingStatus.DRAFT, publishedAt: null }),
    );
  });

  it('publishes straight to ACTIVE — never PENDING_REVIEW', async () => {
    const repository = makeRepository();
    const service = await build(repository);

    await service.create('usr_1', createInput({
      submit: true,
      validFrom: new Date('2020-01-01T00:00:00Z'),
      validTo: new Date('2099-01-01T00:00:00Z'),
    }), null);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: ListingStatus.ACTIVE }),
    );
  });

  it('publishes to SCHEDULED when validFrom is still in the future', async () => {
    const repository = makeRepository();
    const service = await build(repository);

    await service.create('usr_1', createInput({
      submit: true,
      validFrom: new Date('2099-01-01T00:00:00Z'),
      validTo: new Date('2099-02-01T00:00:00Z'),
    }), null);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: ListingStatus.SCHEDULED }),
    );
  });

  it('throws LISTING_VALIDATION_FAILED with ListingField keys when submit fails', async () => {
    const repository = makeRepository();
    const service = await build(repository);

    const call = service.create('usr_1', createInput({
      submit: true,
      details: { ...validRental().details, gender: null },
    }), null);

    await expect(call).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_VALIDATION_FAILED,
      status: 422,
      fields: { [ListingField.GENDER]: MSG.GENDER_REQUIRED },
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects details.kind that disagrees with listing.kind', async () => {
    const repository = makeRepository();
    const service = await build(repository);

    const call = service.create('usr_1', createInput({ kind: StudentListingKind.JOB }), null);

    await expect(call).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_KIND_MISMATCH, status: 422,
    });
  });

  it('returns the existing listing for a replayed Idempotency-Key', async () => {
    const repository = makeRepository();
    const existing = { ...validRental(), id: 'lst_first' };
    repository.findByIdempotencyKey.mockResolvedValue(existing);
    const service = await build(repository);

    const result = await service.create('usr_1', createInput({ submit: true }), 'key-123');

    expect(result.id).toBe('lst_first');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a PATCH that changes kind', async () => {
    const repository = makeRepository();
    repository.findById.mockResolvedValue({ ...validRental(), ownerId: 'usr_1' });
    const service = await build(repository);

    const call = service.patch('usr_1', 'lst_1', { kind: StudentListingKind.JOB });

    await expect(call).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_KIND_IMMUTABLE, status: 409,
    });
  });

  it('re-validates and stays ACTIVE when an ACTIVE listing is patched', async () => {
    const repository = makeRepository();
    repository.findById.mockResolvedValue({
      ...validRental(), ownerId: 'usr_1', status: ListingStatus.ACTIVE,
      validFrom: new Date('2020-01-01T00:00:00Z'), validTo: new Date('2099-01-01T00:00:00Z'),
    });
    const service = await build(repository);

    await service.patch('usr_1', 'lst_1', { price: 1_200_000 });

    expect(repository.setStatus).toHaveBeenCalledWith(
      'lst_1', ListingStatus.ACTIVE, expect.anything(),
    );
    expect(repository.setStatus).not.toHaveBeenCalledWith(
      'lst_1', ListingStatus.PENDING_REVIEW, expect.anything(),
    );
  });

  it('throws LISTING_FORBIDDEN when the caller is not the owner', async () => {
    const repository = makeRepository();
    repository.findById.mockResolvedValue({ ...validRental(), ownerId: 'usr_owner' });
    const service = await build(repository);

    await expect(service.patch('usr_other', 'lst_1', { price: 1 })).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_FORBIDDEN, status: 403,
    });
  });

  it('throws LISTING_NOT_FOUND — not 403 — for a non-owner reading a DRAFT', async () => {
    const repository = makeRepository();
    repository.findById.mockResolvedValue({
      ...validRental(), ownerId: 'usr_owner', status: ListingStatus.DRAFT,
    });
    const service = await build(repository);

    // A stranger must not learn the listing exists at all (spec §6).
    await expect(service.findVisible('usr_other', 'lst_1')).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_NOT_FOUND, status: 404,
    });
  });

  it('returns the owner their own DRAFT', async () => {
    const repository = makeRepository();
    repository.findById.mockResolvedValue({
      ...validRental(), id: 'lst_1', ownerId: 'usr_1', status: ListingStatus.DRAFT,
    });
    const service = await build(repository);

    await expect(service.findVisible('usr_1', 'lst_1')).resolves.toMatchObject({ id: 'lst_1' });
  });

  it('hides an ACTIVE listing from a blocked viewer', async () => {
    const repository = makeRepository();
    repository.findById.mockResolvedValue({
      ...validRental(), ownerId: 'usr_owner', status: ListingStatus.ACTIVE,
      validFrom: new Date('2020-01-01T00:00:00Z'), validTo: new Date('2099-01-01T00:00:00Z'),
    });
    repository.isBlockedBetween.mockResolvedValue(true);
    const service = await build(repository);

    await expect(service.findVisible('usr_other', 'lst_1')).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_NOT_FOUND, status: 404,
    });
  });

  it('hides an ACTIVE listing whose owner is banned', async () => {
    const repository = makeRepository();
    repository.findById.mockResolvedValue({
      ...validRental(), ownerId: 'usr_owner', status: ListingStatus.ACTIVE,
      validFrom: new Date('2020-01-01T00:00:00Z'), validTo: new Date('2099-01-01T00:00:00Z'),
    });
    repository.isOwnerActive.mockResolvedValue(false);
    const service = await build(repository);

    await expect(service.findVisible('usr_other', 'lst_1')).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_NOT_FOUND, status: 404,
    });
  });

  it('rejects EXPIRED -> ACTIVE', async () => {
    const repository = makeRepository();
    repository.findById.mockResolvedValue({
      ...validRental(), ownerId: 'usr_1', status: ListingStatus.EXPIRED,
    });
    const service = await build(repository);

    await expect(service.setStatus('usr_1', 'lst_1', ListingStatus.ACTIVE)).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_STATUS_INVALID, status: 409,
    });
  });

  it('allows ACTIVE -> PAUSED and PAUSED -> ACTIVE', async () => {
    const repository = makeRepository();
    const publishable = {
      ...validRental(), ownerId: 'usr_1',
      validFrom: new Date('2020-01-01T00:00:00Z'), validTo: new Date('2099-01-01T00:00:00Z'),
    };

    repository.findById.mockResolvedValue({ ...publishable, status: ListingStatus.ACTIVE });
    let service = await build(repository);
    await expect(service.setStatus('usr_1', 'lst_1', ListingStatus.PAUSED)).resolves.toBeDefined();

    repository.findById.mockResolvedValue({ ...publishable, status: ListingStatus.PAUSED });
    service = await build(repository);
    await expect(service.setStatus('usr_1', 'lst_1', ListingStatus.ACTIVE)).resolves.toBeDefined();
  });

  it('nulls contactPhone on a non-ACTIVE listing', async () => {
    const repository = makeRepository();
    repository.findById.mockResolvedValue({
      ...validRental(), id: 'lst_1', ownerId: 'usr_1', status: ListingStatus.ARCHIVED,
      contactPhone: '+998901234567',
    });
    const service = await build(repository);

    // An archived listing must not remain a phone-number source (spec §6).
    const result = await service.findVisible('usr_1', 'lst_1');
    expect(result.contactPhone).toBeNull();
  });

  it('increments viewsCount only for a non-owner', async () => {
    const repository = makeRepository();
    const active = {
      ...validRental(), id: 'lst_1', ownerId: 'usr_owner', status: ListingStatus.ACTIVE,
      validFrom: new Date('2020-01-01T00:00:00Z'), validTo: new Date('2099-01-01T00:00:00Z'),
    };
    repository.findById.mockResolvedValue(active);
    const service = await build(repository);

    await service.findVisible('usr_owner', 'lst_1');
    expect(repository.incrementViews).not.toHaveBeenCalled();

    await service.findVisible('usr_other', 'lst_1');
    expect(repository.incrementViews).toHaveBeenCalledWith('lst_1');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- src/modules/student-listings/application/student-listings.service.spec.ts`
Expected: FAIL — service not found.

- [ ] **Step 3: Implement the service**

Structure:

```ts
@Injectable()
export class StudentListingsService {
  constructor(
    @Inject(STUDENT_LISTING_REPOSITORY)
    private readonly repository: StudentListingRepository,
  ) {}
```

Required behaviour, in the order a reviewer should check it:

1. **`create`** — if `idempotencyKey` is non-null, `findByIdempotencyKey` first and return the hit unchanged. Assert `input.details.kind === input.kind` or throw `422 LISTING_KIND_MISMATCH`. Build the entity, `buildSearchText`. If `input.submit !== true`, persist with `status: DRAFT`, `publishedAt: null`. Otherwise run `validateForPublish(entity, new Date())`; on errors throw `new AppException(ERROR_CODE.LISTING_VALIDATION_FAILED, 422, 'E’lonni tekshiring', fields)`; then `assertMayPublish`; then persist with the published status.
2. **`publishedStatusFor(validFrom, now)`** — a small private helper returning `SCHEDULED` when `validFrom !== null && validFrom > now`, else `ACTIVE`. Used by both `create` and `submit`.
3. **`patch`** — load, `assertOwner`, reject a differing `kind` with `409 LISTING_KIND_IMMUTABLE`, merge the patch over the entity, rebuild `searchText`, `update`. If the stored status was `ACTIVE` or `SCHEDULED`, re-run `validateForPublish` and re-`setStatus` to `publishedStatusFor(...)`; a DRAFT stays a DRAFT and is not validated.
4. **`submit`** — load, `assertOwner`, `validateForPublish`, `assertMayPublish`, `setStatus(publishedStatusFor(...), now)`.
5. **`setStatus`** — load, `assertOwner`, consult a transition table and throw `409 LISTING_STATUS_INVALID` for anything absent from it:
   ```ts
   const ALLOWED_OWNER_TRANSITIONS: Readonly<Partial<Record<ListingStatus, readonly ListingStatus[]>>> = {
     [ListingStatus.ACTIVE]: [ListingStatus.PAUSED, ListingStatus.ARCHIVED],
     [ListingStatus.PAUSED]: [ListingStatus.ACTIVE, ListingStatus.ARCHIVED],
     [ListingStatus.SCHEDULED]: [ListingStatus.PAUSED, ListingStatus.ARCHIVED],
     [ListingStatus.EXPIRED]: [ListingStatus.ARCHIVED],
     [ListingStatus.DRAFT]: [ListingStatus.ARCHIVED],
   };
   ```
   Moving back to `ACTIVE` re-runs `validateForPublish` — a listing must not return to the feed invalid.
6. **`remove`** — load, `assertOwner`, `softDelete`.
7. **`findOwn`** — `findPageByOwner`; no visibility filtering, the owner sees everything.
8. **`findVisible(viewerId, id)`** — load; if missing → `404 LISTING_NOT_FOUND`. If `row.ownerId === viewerId` return it as-is. Otherwise apply every §6 visibility condition, and on **any** failure throw `404 LISTING_NOT_FOUND` — never 403, and never a different message per reason, or the 404 leaks which condition failed:
   ```ts
   const visible =
     listing.status === ListingStatus.ACTIVE &&
     listing.validFrom !== null && listing.validFrom <= now &&
     listing.validTo !== null && now < listing.validTo &&
     !isExpiredTask(listing, now) &&
     (await this.repository.isOwnerActive(listing.ownerId)) &&
     !(await this.repository.isBlockedBetween(viewerId, listing.ownerId));
   ```
   `isExpiredTask` is a private helper: true when `details.kind === TASK` and `details.deadline !== null && details.deadline <= now`. When visible, `incrementViews` and return.
9. **`assertOwner(listing, callerId)`** — private; throws `new AppException(ERROR_CODE.LISTING_FORBIDDEN, 403, 'Bu e’lon sizniki emas')`.
10. **`redactForViewer(listing, viewerId)`** — private; returns the listing with `contactPhone: null` unless `status === ACTIVE` or the viewer is the owner (spec §6).

Block and ban filtering in **search results** is not in this task — it belongs to the search WHERE
clause in Phase 1b. Here it only guards the single-listing read.

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/modules/student-listings/application`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/modules/student-listings/application
git commit -m "feat(student-listings): add application service"
```

---

## Task 12: Request and response DTOs

**Files:**
- Create: `src/modules/student-listings/presentation/dto/listing-branch.dto.ts`
- Create: `src/modules/student-listings/presentation/dto/option-group.dto.ts`
- Create: `src/modules/student-listings/presentation/dto/listing-details.dto.ts`
- Create: `src/modules/student-listings/presentation/dto/create-student-listing.dto.ts`
- Create: `src/modules/student-listings/presentation/dto/update-student-listing.dto.ts`
- Create: `src/modules/student-listings/presentation/dto/set-status.dto.ts`
- Create: `src/modules/student-listings/presentation/dto/student-listing.dto.ts`
- Create: `src/modules/student-listings/presentation/dto/student-listing-page.dto.ts`
- Test: `src/modules/student-listings/presentation/dto/create-student-listing.dto.spec.ts`

**Interfaces:**
- Consumes: domain enums (Task 2), entity (Task 2).
- Produces: the DTO classes above; `StudentListingDto.fromEntity(listing): StudentListingDto`.

Follow `src/modules/listings/presentation/dto/create-listing-request.dto.ts` for decorator style. The global pipe runs `whitelist: true, forbidNonWhitelisted: true, transform: true`.

- [ ] **Step 1: Write the branch, option-group and details DTOs**

`ListingBranchDto`: `@IsLatitude()`-style range checks via `@Min(37)/@Max(46)` on `lat` and `@Min(55)/@Max(74)` on `lng`, `@IsString() @IsNotEmpty()` on `address`, optional `name`/`landmark`/`regionId`/`districtId`.

`OptionGroupDto` with a nested `OptionDto` array, `@ValidateNested({ each: true })` + `@Type(() => OptionDto)`, `@ArrayMaxSize(30)` on the options and `@ArrayMaxSize(10)` where the groups are declared.

`listing-details.dto.ts` exports `TaskDetailsDto`, `RentalDetailsDto`, `ServiceDetailsDto`, `JobDetailsDto` (with a nested `JobScheduleDto`). Every kind-specific field is `@IsOptional()` — a DRAFT must validate. `kind` is `@IsEnum(StudentListingKind)` and required on all four.

- [ ] **Step 2: Write `create-student-listing.dto.ts`**

```ts
export class CreateStudentListingDto {
  @ApiProperty({ enum: StudentListingKind })
  @IsEnum(StudentListingKind)
  kind!: StudentListingKind;

  @ApiPropertyOptional({ description: 'true — darrov e’lon qilinadi; aks holda DRAFT bo‘lib qoladi' })
  @IsOptional() @IsBoolean()
  submit?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ enum: StudentPriceUnit })
  @IsOptional() @IsEnum(StudentPriceUnit)
  priceUnit?: StudentPriceUnit;

  @ApiPropertyOptional({ description: 'Butun so‘m' })
  @IsOptional() @IsInt() @Min(0)
  price?: number;

  // priceMax, isNegotiable, contactPhone (@Matches(/^\+998\d{9}$/)), universityId,
  // audience (@IsEnum(ListingAudience)), validFrom/validTo (@IsISO8601),
  // attributes (Record<string,string>), branches (@ArrayMaxSize(20), @ValidateNested),
  // optionGroups (@ArrayMaxSize(10), @ValidateNested) — same pattern.

  @ApiProperty({ description: 'Turga xos qism; `details.kind` tashqi `kind` bilan bir xil bo‘lsin' })
  @ValidateNested()
  @Type(() => Object, {
    discriminator: {
      property: 'kind',
      subTypes: [
        { value: TaskDetailsDto, name: StudentListingKind.TASK },
        { value: RentalDetailsDto, name: StudentListingKind.RENTAL },
        { value: ServiceDetailsDto, name: StudentListingKind.SERVICE },
        { value: JobDetailsDto, name: StudentListingKind.JOB },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  details!: TaskDetailsDto | RentalDetailsDto | ServiceDetailsDto | JobDetailsDto;
}
```

`keepDiscriminatorProperty: true` is required — without it class-transformer strips `kind` from `details` and the `LISTING_KIND_MISMATCH` check can never fire.

- [ ] **Step 3: Write `update-student-listing.dto.ts` and `set-status.dto.ts`**

```ts
/** Partial edit. `kind` is accepted so a mismatch can be reported as 409 rather than ignored. */
export class UpdateStudentListingDto extends PartialType(
  OmitType(CreateStudentListingDto, ['submit'] as const),
) {}

export class SetListingStatusDto {
  @ApiProperty({ enum: [ListingStatus.ACTIVE, ListingStatus.PAUSED, ListingStatus.ARCHIVED] })
  @IsIn([ListingStatus.ACTIVE, ListingStatus.PAUSED, ListingStatus.ARCHIVED])
  status!: ListingStatus;
}
```

- [ ] **Step 4: Write `student-listing.dto.ts` and `student-listing-page.dto.ts`**

`StudentListingDto` mirrors request doc §2.2 exactly: every field including `isMine`, `distanceMeters` (always `null` in this phase), `isFavorite` (always `false`), `owner` (null in this phase — populated in Phase 1b), `universityName`/`universityRelation` (null until Phase 2). `price`/`priceMax` are `number`. Dates are ISO strings via `.toISOString()`.

Add `static fromEntity(listing: StudentListing, viewerId: string): StudentListingDto` doing the conversion, setting `isMine: listing.ownerId === viewerId`.

`StudentListingPageDto` is `{ items, page, size, total, hasNext }` — exactly those keys.

- [ ] **Step 5: Write the DTO validation test**

```ts
describe('CreateStudentListingDto', () => {
  it('accepts a bare draft with only kind and details', async () => {
    const dto = plainToInstance(CreateStudentListingDto, {
      kind: 'TASK', details: { kind: 'TASK' },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('keeps details.kind after transformation', async () => {
    const dto = plainToInstance(CreateStudentListingDto, {
      kind: 'RENTAL', details: { kind: 'RENTAL', roomCount: 3 },
    });
    expect(dto.details.kind).toBe('RENTAL');
  });

  it('rejects more than 5 images', async () => {
    const dto = plainToInstance(CreateStudentListingDto, {
      kind: 'TASK', details: { kind: 'TASK' },
      images: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects a phone that is not E.164 Uzbek', async () => {
    const dto = plainToInstance(CreateStudentListingDto, {
      kind: 'TASK', details: { kind: 'TASK' }, contactPhone: '901234567',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects a coordinate outside Uzbekistan', async () => {
    const dto = plainToInstance(CreateStudentListingDto, {
      kind: 'RENTAL', details: { kind: 'RENTAL' },
      branches: [{ lat: 55.75, lng: 37.62, address: 'Moskva' }],
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run the DTO tests**

Run: `npm test -- src/modules/student-listings/presentation`
Expected: PASS, 5 tests.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add src/modules/student-listings/presentation
git commit -m "feat(student-listings): add request and response DTOs"
```

---

## Task 13: Controller and module wiring

**Files:**
- Create: `src/modules/student-listings/presentation/student-listings.controller.ts`
- Create: `src/modules/student-listings/student-listings.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: service (Task 11), DTOs (Task 12).
- Produces: the eight routes; `StudentListingsModule`.

- [ ] **Step 1: Write the controller**

Thin: guard, DTO binding, Swagger, one service call, one DTO conversion. Copy the decorator stack from `src/modules/listings/presentation/listing.controller.ts` — `@ApiTags`, `@ApiBearerAuth`, `@ApiUnauthorizedEnvelope`, `@ApiOkEnvelope`, `@UseGuards(JwtAuthGuard)`.

```ts
@ApiTags('Student listings')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(JwtAuthGuard)
@Controller('student-listings')
export class StudentListingsController {
  constructor(private readonly service: StudentListingsService) {}

  @Post()
  @ApiOperation({ summary: 'E’lon yaratish (DRAFT yoki darrov e’lon qilish)' })
  @ApiCreatedEnvelope(StudentListingDto)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStudentListingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<StudentListingDto> {
    const listing = await this.service.create(user.id, dto.toInput(), idempotencyKey ?? null);
    return StudentListingDto.fromEntity(listing, user.id);
  }

  // 'mine' MUST be declared before ':id', or Nest routes /mine into the param handler.
  @Get('mine')
  @ApiOperation({ summary: 'O‘z e’lonlarim (barcha status va turlar)' })
  @ApiOkEnvelope(StudentListingPageDto)
  async mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OwnListingsQueryDto,
  ): Promise<StudentListingPageDto> {
    const page = await this.service.findOwn(user.id, query.page, query.size);
    return StudentListingPageDto.from(page, query.page, query.size, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta e’lon (ko‘rish + viewsCount++)' })
  @ApiOkEnvelope(StudentListingDto)
  @ApiNotFoundEnvelope('E’lon topilmadi yoki sizga ko‘rinmaydi (`LISTING_NOT_FOUND`).')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StudentListingDto> {
    const listing = await this.service.findVisible(user.id, id);
    return StudentListingDto.fromEntity(listing, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'E’lonni tahrirlash (`kind` o‘zgarmaydi)' })
  @ApiOkEnvelope(StudentListingDto)
  async patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStudentListingDto,
  ): Promise<StudentListingDto> {
    const listing = await this.service.patch(user.id, id, dto.toInput());
    return StudentListingDto.fromEntity(listing, user.id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'E’lon qilish — to‘liq validatsiya, so‘ng ACTIVE yoki SCHEDULED' })
  @ApiOkEnvelope(StudentListingDto)
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StudentListingDto> {
    const listing = await this.service.submit(user.id, id);
    return StudentListingDto.fromEntity(listing, user.id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statusni o‘zgartirish: ACTIVE / PAUSED / ARCHIVED' })
  @ApiOkEnvelope(StudentListingDto)
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetListingStatusDto,
  ): Promise<StudentListingDto> {
    const listing = await this.service.setStatus(user.id, id, dto.status);
    return StudentListingDto.fromEntity(listing, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'E’lonni o‘chirish (soft delete)' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.service.remove(user.id, id);
  }
}
```

Two supporting pieces this references:

- `OwnListingsQueryDto` — `page` (`@IsOptional() @IsInt() @Min(1)`, default 1) and `size`
  (`@IsOptional() @IsInt() @Min(1) @Max(50)`, default 20), both `@Type(() => Number)`.
- `dto.toInput()` on the create/update DTOs — converts ISO date strings to `Date` and fills
  defaults, so the controller hands the service domain types rather than wire types. Follow
  `UpdateProfileDto` in `src/modules/profiles/presentation/dto/update-profile.dto.ts`, which
  already uses this pattern.

Header name is lowercase (`'idempotency-key'`) — Node lowercases incoming header names, and
`@Headers('Idempotency-Key')` silently yields `undefined`.

Never construct a `BaseResponse` here — the global interceptor wraps the return value.

- [ ] **Step 2: Write the module**

```ts
@Module({
  controllers: [StudentListingsController],
  providers: [
    StudentListingsService,
    { provide: STUDENT_LISTING_REPOSITORY, useClass: StudentListingPrismaRepository },
  ],
})
export class StudentListingsModule {}
```

Check how `ListingsModule` obtains `PrismaService` (`grep -n "Prisma" src/modules/listings/listings.module.ts`) and mirror it — import the shared database module if that is the pattern.

- [ ] **Step 3: Register it in `src/app.module.ts`**

Add the import alongside the other module imports and `StudentListingsModule` to the `imports` array, keeping the existing ordering convention.

- [ ] **Step 4: Boot the app to confirm the routes register**

Run: `npm run build && npm run start:dev`
Expected: startup log lists `/v1/student-listings` routes, including `POST /v1/student-listings/:id/submit`. Confirm the existing `/v1/listings/:listingId/submit` is still mapped — the two must coexist. Stop the server.

- [ ] **Step 5: Run the whole unit suite**

Run: `npm test`
Expected: PASS — no existing test broken.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/modules/student-listings src/app.module.ts
git commit -m "feat(student-listings): add controller and register the module"
```

---

## Task 14: End-to-end test

**Files:**
- Create: `test/student-listings.e2e-spec.ts`

**Interfaces:**
- Consumes: the running app.
- Produces: nothing — this is the gate.

Follow `test/chat.e2e-spec.ts` for bootstrap, student registration and auth-header helpers.

- [ ] **Step 1: Write the e2e test**

Cover the flows unit tests cannot:

```ts
describe('Student listings (e2e)', () => {
  it('saves a DRAFT with almost nothing filled in', async () => {
    // POST /v1/student-listings { kind: 'TASK', details: { kind: 'TASK' } }
    // -> 201, result.status === 'DRAFT'
  });

  it('rejects a submit that fails validation with ListingField keys', async () => {
    // POST /v1/student-listings { kind: 'RENTAL', submit: true, ... gender missing }
    // -> 422, error.code === 'LISTING_VALIDATION_FAILED'
    // -> error.fields.GENDER === 'Kim uchun ekanini tanlang — qiz yoki o‘g‘il'
  });

  it('publishes a complete listing straight to ACTIVE', async () => {
    // -> 201, result.status === 'ACTIVE' (never PENDING_REVIEW)
  });

  it('returns the same listing for a replayed Idempotency-Key', async () => {
    // Two identical POSTs with the same header -> same result.id
  });

  it('rejects a kind change on PATCH', async () => {
    // -> 409, error.code === 'LISTING_KIND_IMMUTABLE'
  });

  it('hides another student’s DRAFT behind a 404', async () => {
    // Student B: GET /v1/student-listings/{A's draft id} -> 404 LISTING_NOT_FOUND, not 403
  });

  it('returns 403 when a non-owner tries to edit', async () => {
    // PATCH -> 403 LISTING_FORBIDDEN
  });

  it('nulls contactPhone on a non-ACTIVE listing', async () => {});

  it('wraps every response in the BaseResponse envelope', async () => {
    // success/status/code/message/result/error present on both a 201 and the 422 above
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- student-listings`
Expected: PASS.

- [ ] **Step 3: Run the full suite**

Run: `npm test && npm run test:e2e`
Expected: PASS, nothing pre-existing broken.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint
git add test/student-listings.e2e-spec.ts
git commit -m "test(student-listings): add end-to-end coverage for create, publish and visibility"
```

---

## Definition of Done for this plan

- [ ] Migration applied; `listings`, `branches`, `students` untouched at the SQL level.
- [ ] A DRAFT saves with only `kind` and `details.kind`.
- [ ] `submit` enforces every §5 rule this phase covers and returns `ListingField` keys.
- [ ] A valid submit goes straight to `ACTIVE` (or `SCHEDULED`) — never `PENDING_REVIEW`.
- [ ] `kind` is immutable after creation (409).
- [ ] A stranger gets 404 for a non-visible listing; a non-owner gets 403 on writes.
- [ ] A blocked viewer, and a banned owner's listing, both yield 404 on `GET /{id}`.
- [ ] `contactPhone` is returned only on an `ACTIVE` listing.
- [ ] `Idempotency-Key` replay returns the original listing.
- [ ] The four anti-spam limits are enforced.
- [ ] `npm test`, `npm run test:e2e` and `npm run lint` all pass.

**Next:** Phase 1b (search — `POST /search`, `GET ?query`, cursor paging, geo) and Phase 1c (EXPIRED cron). Both get their own plans.
