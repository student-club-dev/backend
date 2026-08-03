# Student listings (TASK / RENTAL / SERVICE / JOB) — Phase 1 design

Source request: `docs/api/mobile_questions/STUDENT_LISTINGS_BACKEND.md` (mobile team).
Status: approved 2026-08-03. Supersedes the request document wherever the two disagree;
every departure is listed with its reason in §10.

A student posts an advertisement of one of four kinds and other students find it by kind,
filter, and proximity. The owner is a **student**, never a business.

---

## 1. Boundary — what this module does and does not touch

The request document asserts "backendda bu modul bo'yicha hech narsa yo'q". That is wrong,
and the correction drives most of this design: `listings` and `listing_branches` **already
exist** and hold business discount listings (`business_id NOT NULL`, `discount_type NOT NULL`),
served under `/v1/listings/*` behind `BusinessAccountGuard`.

The two features share an owner table, a lifecycle, a search shape and a name — and nothing
else. They stay completely separate.

| | |
|---|---|
| Module | `src/modules/student-listings/` |
| Tables | `student_listings`, `student_listing_branches` |
| Route prefix | `/v1/student-listings/*` |
| Owner FK | `students(id)` — the request doc's `users(id)` does not exist |
| Prisma models | `StudentListing`, `StudentListingBranch` |

### Reused unchanged

- `ListingStatus` — already carries exactly the nine values §2.3 requires. Reusing the
  Postgres enum type across two tables adds no value to it and cannot affect the business side.
- `SelectionType` (`SINGLE`/`MULTIPLE`) for option groups.
- `BaseResponse` envelope, global validation pipe, exception filter.
- `JwtAuthGuard` + `CurrentUser` (student token).
- `Region` / `District` — ids are already the ASCII slugs the client expects.
- `POST /v1/media/upload` — `purpose=LISTING` is **already** an allowed value
  (`src/modules/media/application/media.service.ts`). No change needed.

### New, deliberately not shared

- `StudentListingKind { RENTAL SERVICE JOB TASK }`
- `StudentPriceUnit` — 11 values, the existing 9 plus `PER_DAY` and `PER_PAGE`
- `ListingAudience { ALL NEARBY_UNIVERSITIES MY_UNIVERSITY }`

**Why a second price-unit enum.** The obvious move is adding `PER_DAY`/`PER_PAGE` to the
existing `PriceUnit`. It is rejected: that enum is validated by the business listing DTOs,
so widening it silently widens the *business* API contract, and the provider app's generated
client would be out of sync with what the server now accepts. A separate enum serializes to
byte-identical wire strings, so the mobile contract is met at zero cost to the business side.
The duplication is 9 repeated identifiers — cheaper than an unintended contract change.

### Explicitly out of Phase 1

| Deferred | Where it goes |
|---|---|
| §7.2.4 universities: `universities` table, `university_neighbors`, `GET /v1/universities`, `audience` enforcement, `RELEVANCE` ranking, `universityRelation` | Phase 2 spec. Blocked on a UZ university dataset with coordinates. |
| §7.3 `GET /v1/listings/catalog` | Phase 2. Client has its own copy today. |
| §7.5 chat: `listingId` on `POST /v1/conversations`, `Connections` bypass | Phase 2. |
| Favorites, `POST /search/map` clusters, `POST /suggest` | Phase 2. |
| SERVICE `fields.subject` + per-subject required-field validation (§5.5 rows 2–4) | Blocked on `ServiceCatalog.kt` — see §11. |
| Any moderation: admin queue, stop-words, image review | Product decision — not built. See §5. |

---

## 2. Data model

`details` is JSONB and is the source of truth. The mapper *additionally* writes plain,
indexable columns for the fields §7.2.1 actually filters on.

This is the pattern the codebase already uses: `Listing.isDiscount` / `Listing.discountPercent`
are denormalised out of `attributes` with the comment *"kept as a column so faceting and
sorting are indexable instead of probing jsonb on every row"*. The request doc's
`GENERATED ALWAYS AS` variant was rejected because Prisma cannot express generated columns —
it would force `Unsupported`/`@ignore` on fifteen columns and a hand-maintained migration
Prisma no longer understands. One mapper owning both writes is simpler and equally safe.

### `StudentListing`

```prisma
enum StudentListingKind { RENTAL SERVICE JOB TASK }

enum StudentPriceUnit {
  PER_ITEM PER_HOUR PER_KG PER_DAY PER_MONTH PER_COURSE
  PER_LESSON PER_TICKET PER_PERSON PER_SESSION PER_PAGE
}

enum ListingAudience { ALL NEARBY_UNIVERSITIES MY_UNIVERSITY }

model StudentListing {
  id      String             @id @default(cuid())
  ownerId String             @map("owner_id")
  kind    StudentListingKind

  title        String   @default("")          // DRAFT may hold ""
  description  String?
  images       String[] @default([])
  priceUnit    StudentPriceUnit? @map("price_unit")
  price        BigInt   @default(0)
  priceMax     BigInt?  @map("price_max")
  currency     String   @default("UZS")
  isNegotiable Boolean  @default(false) @map("is_negotiable")
  contactPhone String?  @map("contact_phone")

  universityId String?         @map("university_id")   // Phase 1: stored, not validated
  audience     ListingAudience @default(ALL)           // Phase 1: column only, not enforced

  validFrom DateTime? @map("valid_from")
  validTo   DateTime? @map("valid_to")

  attributes   Json @default("{}")
  optionGroups Json @default("[]") @map("option_groups")
  details      Json                                    // always at least { "kind": <kind> }

  status          ListingStatus @default(DRAFT)
  rejectionReason String?       @map("rejection_reason")   // contract only; never written
  viewsCount      Int           @default(0) @map("views_count")

  searchText   String?                  @map("search_text")
  searchVector Unsupported("tsvector")? @map("search_vector")

  idempotencyKey String?   @map("idempotency_key")
  publishedAt    DateTime? @map("published_at")
  deletedAt      DateTime? @map("deleted_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  // -- denormalised from `details` by the mapper; filter/sort keys only --
  rentalGender        String? @map("rental_gender")
  rentalPropertyType  String? @map("rental_property_type")
  rentalRoomCount     Int?    @map("rental_room_count")
  rentalNeededTenants Int?    @map("rental_needed_tenants")
  serviceType         String? @map("service_type")
  serviceFormat       String? @map("service_format")
  serviceHasFreeTrial Boolean? @map("service_has_free_trial")
  jobEmployment       String? @map("job_employment")
  jobCategoryKey      String? @map("job_category_key")
  jobShift            String? @map("job_shift")
  jobExperience       String? @map("job_experience")
  taskCategory        String? @map("task_category")
  taskTypeKey         String? @map("task_type_key")
  taskFormat          String? @map("task_format")
  taskDeadline        DateTime? @map("task_deadline")

  owner    Student                @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  branches StudentListingBranch[]

  @@unique([ownerId, idempotencyKey])
  @@index([kind, status, validTo])
  @@index([ownerId, updatedAt])
  @@index([status, validTo])
  @@index([kind, status, rentalGender])
  @@index([kind, status, serviceType])
  @@index([kind, status, jobCategoryKey])
  @@index([kind, status, taskCategory])
  @@index([kind, status, taskDeadline])
  @@index([details(ops: JsonbPathOps)], type: Gin, map: "student_listings_details_gin")
  @@index([searchVector], type: Gin, map: "student_listings_search_vector_gin")
  @@map("student_listings")
}
```

`@@unique([ownerId, idempotencyKey])` — Postgres treats NULLs as distinct, so rows without a
key do not collide. This is the whole idempotency mechanism (§7.1): on conflict, return the
existing row instead of inserting.

### `StudentListingBranch`

Not a join table. Unlike the business `ListingBranch` (which links a listing to an existing
`Branch`), a student listing's address is a map pin that exists only for that listing.

```prisma
model StudentListingBranch {
  id        String @id @default(cuid())
  listingId String @map("listing_id")

  lat Float
  lng Float
  // Populated from lat/lng by a raw-SQL trigger, exactly like Branch.geoPoint.
  geoPoint Unsupported("geography(Point, 4326)")? @map("geo_point")

  address    String
  name       String?
  landmark   String?
  regionId   String? @map("region_id")
  districtId String? @map("district_id")

  createdAt DateTime @default(now()) @map("created_at")

  listing StudentListing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@index([listingId])
  @@index([geoPoint], type: Gist, map: "student_listing_branches_geo_point_gist")
  @@map("student_listing_branches")
}
```

`regionId`/`districtId` are plain columns, **not** FKs to `regions`/`districts`. The seeded
district set has 210 rows against the client's 193 (§11); a hard FK would reject a legitimate
pin the moment the two lists drift. They are validated against the tables at write time and
rejected with `VALIDATION_ERROR` if unknown — same guarantee, no migration coupling.

### Migration notes

Additive only — one new enum trio, two new tables. The only edit to an existing model is the
back-relation field `studentListings StudentListing[]` on `Student`, which is virtual: Prisma
relation fields emit no SQL, so the `students` table is untouched. Safe to apply online.

Two things Prisma cannot express, added as raw SQL in the same migration:

1. `geo_point` trigger on `student_listing_branches` (copy the `branches` one).
2. `search_vector` trigger deriving the tsvector from `search_text`.

---

## 3. Layering

Standard four layers (`presentation → application → domain ← infrastructure`). Prisma appears
only under `infrastructure/`.

```
domain/
  entities/student-listing.entity.ts
  entities/student-listing-branch.entity.ts
  enums/                      kind, audience, price-unit, + the 12 detail enums (§2.3)
  details/                    discriminated union on `kind`, one type per kind
  catalogs/                   TASK category→typeKey, JOB categoryKey, RENTAL amenities
  validation/
    listing-field.ts          the 22 ListingField keys
    validate-for-publish.ts   pure; returns Record<ListingField, string>
    rules/                    common.ts, location.ts, task.ts, rental.ts, service.ts, job.ts
  student-listing.repository.ts        interface
application/
  student-listings.service.ts          create / patch / submit / status / delete / get / mine
  student-listing-search.service.ts    search
  anti-spam.ts                         the four §6 limits, pure where possible
  student-listing.io.ts                service input/output types
infrastructure/
  student-listing.prisma.repository.ts
  student-listing.mapper.ts            details ⇄ denormalised columns, entity ⇄ row
  search/
    search-filter.sql.ts               WHERE builder
    listing-card.sql.ts                SELECT + nearest-branch lateral
    cursor.ts                          encode/decode/validate
presentation/
  student-listings.controller.ts       POST, PATCH, GET {id}, DELETE, mine
  student-listing-search.controller.ts POST /search, GET ?query
  dto/
```

`validate-for-publish.ts` splitting into `rules/` is not premature: §5 is ~40 rules across four
kinds, and one file would be the largest in the module by a wide margin.

---

## 4. Validation

Client-side `ListingValidator.kt` is advisory. The backend re-checks independently.

```ts
// domain/validation/validate-for-publish.ts — pure, no NestJS, no Prisma
export function validateForPublish(listing: StudentListing): Partial<Record<ListingField, string>>;
// {} means valid
```

The service turns a non-empty result into:

```ts
throw new AppException(
  ERROR_CODE.LISTING_VALIDATION_FAILED, 422, 'E‘lonni tekshiring', fields,
);
```

`AppException.validation()` is not used — it hardcodes `VALIDATION_ERROR`. The raw constructor
already carries a custom code plus fields, so no shared code changes.

Keys are the 22 `ListingField` values from §5 verbatim. Messages are the Uzbek strings from
§5.1–5.6 **copied exactly** — the client shows them unmodified, so a reworded message is a
user-visible regression.

Rules implemented: §5.1 common (8), §5.2 location (4), §5.3 TASK (6), §5.4 RENTAL (7),
§5.5 SERVICE (2 of 5 — see §11), §5.6 JOB (9).

`details.kind !== listing.kind` → `422 LISTING_KIND_MISMATCH`, checked before anything else.

Catalog keys enforced in Phase 1, all fully specified in the request doc:

| Kind | Enforced |
|---|---|
| `TASK` | `category` ∈ 8 values, `typeKey` ∈ that category's set (26 total) + `OTHER` |
| `JOB` | `categoryKey` ∈ 21 values |
| `RENTAL` | `amenities[]` ⊆ 14 values |
| `SERVICE` | `serviceType` ∈ 12 values only |

Unknown key → `422 CATALOG_KEY_UNKNOWN`.

**DRAFT skips all of it.** A draft needs `kind` and nothing else; `title` may be `""`, every
kind-specific field may be null. This is why the columns in §2 are nullable.

---

## 5. Lifecycle — no moderation

Product decision: **no admin or moderator approval.** A validated submit goes live immediately.

```
DRAFT ──submit──▶ validate(§5) ──▶ anti-spam(§6) ──▶ ACTIVE       (validFrom ≤ now)
                                                  └▶ SCHEDULED    (validFrom > now)

SCHEDULED ──cron, validFrom reached──▶ ACTIVE
ACTIVE ⇄ PAUSED                       (owner, POST /{id}/status)
ACTIVE ──owner──▶ ARCHIVED
ACTIVE ──cron, validTo or TASK deadline passed──▶ EXPIRED
PATCH on ACTIVE ──▶ re-validate ──▶ ACTIVE        (no intermediate state)
```

`PENDING_REVIEW`, `REJECTED` and `rejectionReason` remain in the enum and the DTO because the
generated client knows them, but Phase 1 never writes them. Should moderation ever be added,
the status machine is already the right shape and the client needs no change.

Editing an `ACTIVE` listing always re-validates and stays `ACTIVE` (§10 Q2, resolved). There is
no "light fields" exception list to keep in sync with the client.

Illegal transition (e.g. `EXPIRED → ACTIVE`) → `409 LISTING_STATUS_INVALID`.
`DELETE` is a soft delete: sets `deletedAt`, and every read filters `deletedAt IS NULL`.

### Anti-spam (§6) — the only gate

| Limit | Value | Error |
|---|---|---|
| Concurrent `ACTIVE` per student | 20 | `429 LISTING_LIMIT_REACHED` |
| `submit` per student per day | 10 | `429 LISTING_LIMIT_REACHED` |
| Same `(kind, title, price)` within 24h | rejected | `409 LISTING_DUPLICATE` |
| Validity window | ≤ 90 days; for `TASK` also ≤ `deadline` | `422 LISTING_VALIDATION_FAILED` (`VALIDITY`) |

### Cron

One job, every 10 minutes, in `src/cron/`:
- `ACTIVE` + `valid_to < now()` → `EXPIRED`
- `ACTIVE` + `kind = TASK` + `task_deadline < now()` → `EXPIRED`
- `SCHEDULED` + `valid_from <= now()` → `ACTIVE`

Set-based `UPDATE`s, not row-by-row.

---

## 6. Endpoints

All require `Authorization: Bearer <student token>`.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/student-listings` | `submit:true` → validate + publish; else DRAFT. Honours `Idempotency-Key`. |
| `PATCH` | `/v1/student-listings/{id}` | Partial. `kind` differing → `409 LISTING_KIND_IMMUTABLE`. |
| `POST` | `/v1/student-listings/{id}/submit` | Full validation → `ACTIVE`/`SCHEDULED`. |
| `POST` | `/v1/student-listings/{id}/status` | `PAUSED` / `ACTIVE` / `ARCHIVED`. |
| `DELETE` | `/v1/student-listings/{id}` | Soft delete. |
| `GET` | `/v1/student-listings/mine` | All statuses and kinds, `updatedAt DESC, id DESC`. |
| `GET` | `/v1/student-listings/{id}` | Detail; increments `viewsCount`. |
| `POST` | `/v1/student-listings/search` | §7.2.1 body. |
| `GET` | `/v1/student-listings` | Same logic via query params. |

Route order matters: `mine` is declared before `:id` so it is not swallowed by the param route.

### Visibility (§7.2.0)

A listing appears to a non-owner only when **all** hold:

- `status = ACTIVE` and `deletedAt IS NULL`
- `validFrom ≤ now < validTo`
- for `TASK`, `taskDeadline > now`
- owner's `Student.status = ACTIVE` (not banned)
- no `Block` in either direction between viewer and owner

Consequences:
- `GET /{id}` on a non-visible listing owned by someone else → **`404 LISTING_NOT_FOUND`**, not
  403. A stranger must not learn the listing exists.
- The owner's own listings **do** appear in search results, flagged `isMine: true`.
- `viewsCount` increments only for non-owners, at most once per viewer per 24h.
- `contactPhone` is returned only when `status = ACTIVE`; otherwise `null`.

Ownership failure on a write → `403 LISTING_FORBIDDEN`.

Phase 1 does not enforce `audience` — every listing behaves as `ALL`. Deferring it is safe in
one direction only: a `MY_UNIVERSITY` listing would be *more* visible than intended. Since the
client cannot produce that value until Phase 2 ships the university picker, no such row exists.
The Phase 2 spec must enforce `audience` before the client can send anything but `ALL`.

---

## 7. Search

One service, one SQL builder, two controllers. `GET` maps its query params into the same
criteria object the `POST` body produces — the request doc requires identical behaviour, and
one code path is the only way to guarantee it.

`kind` is mandatory; missing → `422 VALIDATION_ERROR`. Filter params belonging to another kind
are **silently ignored**, not rejected (the client leaves stale params when switching tabs).

### Soft-match rules

These are where a subtle bug silently returns wrong results, so each gets a unit test:

| Filter | Rule |
|---|---|
| `gender` | matches the requested value **or** `ANY` |
| `serviceFormat` | `HYBRID` listings match any requested format |
| `shift` | `FLEXIBLE` listings match any requested shift |
| `taskFormat` | `ANY` listings match any requested format |
| `maxPrice` | `isNegotiable = true` listings are never filtered out |

### Geo (§7.2.3)

Radius, `regionIds[]`/`districtIds[]`, and `bbox` are independent and `AND` together. None given
→ all of Uzbekistan. Matching is `EXISTS (SELECT 1 FROM student_listing_branches …)` so a listing
with up to 20 pins is returned once. `distanceMeters` is `MIN(ST_Distance(...))` to the nearest
pin via a lateral join. `radiusMeters` is clamped to 200 000.

Branchless listings (`TASK` with `format != IN_PERSON`) survive a geo filter, sort last, and
report `distanceMeters: null`.

Coordinates outside lat `[37,46]` / lng `[55,74]` → `422 GEO_OUT_OF_BOUNDS` on write.
Two pins on one listing closer than 100 m → `LOCATION` validation error.

### Sorting and paging (§7.2.2)

Every sort ends in `id DESC` so pages cannot jump.

| `sort` | `ORDER BY` |
|---|---|
| `NEWEST` (default) | `created_at DESC, id DESC` |
| `PRICE_ASC` | `price ASC, id DESC` |
| `PRICE_DESC` | `price DESC, id DESC` |
| `NEAREST` | `distance ASC, id DESC` — falls back to `NEWEST` if no lat/lng, no error |
| `DEADLINE` | `task_deadline ASC, id DESC` — `TASK` only |
| `RELEVANCE` | Phase 1: `NEWEST` |

Both paging modes are supported. Cursor is base64 `(sortValue, id, filterHash)`; a `filterHash`
that no longer matches the request → `422 PAGE_CURSOR_INVALID`. `size` defaults to 20 and is
clamped to 50 rather than rejected. A page past the end returns empty `items` with
`hasNext: false`. `total` is omitted in cursor mode.

---

## 8. Errors

Added to `src/common/errors/error-code.ts` (`LISTING_NOT_FOUND` already exists):

| Code | HTTP |
|---|---|
| `LISTING_VALIDATION_FAILED` | 422 |
| `LISTING_KIND_MISMATCH` | 422 |
| `LISTING_KIND_IMMUTABLE` | 409 |
| `LISTING_FORBIDDEN` | 403 |
| `LISTING_STATUS_INVALID` | 409 |
| `LISTING_LIMIT_REACHED` | 429 |
| `LISTING_DUPLICATE` | 409 |
| `CATALOG_KEY_UNKNOWN` | 422 |
| `PAGE_CURSOR_INVALID` | 422 |
| `GEO_OUT_OF_BOUNDS` | 422 |

All `message` values are user-facing Uzbek.

---

## 9. Testing

| Layer | Coverage |
|---|---|
| `validate-for-publish` | One test per §5 rule, both directions. This is the largest and highest-risk surface. |
| Catalog key sets | Assert the exact key lists from §4.1/§4.4/§4.2 — a drifting catalog silently breaks stored listings. |
| `search-filter.sql` | Every soft-match rule; geo modes alone and combined; cross-kind params ignored. Mirrors `search-filter.sql.spec.ts`. |
| `cursor` | Round-trip, stale `filterHash`, tampered input. |
| `student-listings.service` | Lifecycle transitions incl. illegal ones, ownership, anti-spam limits, idempotency replay. |
| `student-listing.mapper` | `details` ⇄ denormalised columns for all four kinds. |
| e2e | create DRAFT → submit → appears in search → PATCH → PAUSE → hidden → cron EXPIRED. |
| e2e | Visibility: stranger gets 404 on another student's DRAFT; blocked users cannot see each other. |

---

## 10. Departures from the request document

| # | Doc says | This design | Why |
|---|---|---|---|
| 1 | Table `listings`, routes `/v1/listings/*` | `student_listings`, `/v1/student-listings/*` | Both names are taken by business discount listings; `POST /v1/listings/{id}/submit` and `DELETE /v1/listings/{id}` already exist under `BusinessAccountGuard`. **Mobile must update `student-club.json` and regenerate — app code is unaffected.** |
| 2 | Add `PER_DAY`/`PER_PAGE` to `PriceUnit` | Separate `StudentPriceUnit` | Widening the shared enum silently widens the business API. Wire strings identical. |
| 3 | `price_unit`, `valid_from`, `valid_to` `NOT NULL` | Nullable | §3 contradicts §6.1 ("DRAFT saves with only kind and title"). Drafts win; publish-time validation enforces presence. |
| 4 | `final_price` column | Dropped | No discount exists on a student listing, so it would always equal `price`. Price sorts use `price`. |
| 5 | Generated columns via `GENERATED ALWAYS AS` | Mapper-written plain columns | Prisma cannot express generated columns. Same index behaviour, migration stays comprehensible. |
| 6 | Option groups as a nested structure | JSONB column | Nothing filters on them, and it avoids touching the business `OptionGroup`/`Option` tables. |
| 7 | `FK users(id)` | `FK students(id)` | There is no `users` table. |
| 8 | Moderation recommended | None | Product decision: submit publishes immediately. |
| 9 | `ACTIVE` edit may skip re-review | Always re-validates, stays `ACTIVE` | One documented rule, no exception list to drift from the client. §10 Q2 resolved. |
| 10 | 193 districts | 210 seeded | Needs reconciliation — see §11. |

---

## 11. Open items for the mobile team

Non-blocking for Phase 1, but each closes a gap:

1. **`ServiceCatalog.kt`** — required for §5.5 rows 2–4 (`fields.subject` validity, per-subject
   `required` fields). Until it arrives, `SERVICE` validates only `serviceType`, and a bad
   `subject` is stored rather than rejected.
2. **`GeoCatalog.kt`** — the seed has 14 regions (matches) but **210 districts against the
   documented 193**. Need their list to confirm ours is a superset and that no slug differs;
   a mismatched slug means a saved pin cannot be filtered.
3. **Route change** — departure #1. `/v1/listings` cannot be used.
4. **`universityId` values** — Phase 1 stores the string unvalidated. Phase 2 needs the
   canonical university list with coordinates before `GET /v1/universities` can exist.
5. **§10 Q4 (`apply` / `applicationsCount`)** — not in Phase 1; confirm it is not needed yet.

---

## 12. Implementation order

1. Migration: enums, two tables, indexes, geo + search_vector triggers.
2. Domain: entities, enums, detail union, catalogs, `validate-for-publish` + rules.
3. Infrastructure: mapper, Prisma repository.
4. Application + presentation: create / patch / submit / status / delete / mine / get.
5. Search: SQL builder, cursor, service, both controllers.
6. Cron + anti-spam.
7. e2e.

Stages 2–4 deliver the request doc's first core task (accept a listing); stage 5 the second
(return listings with filters).
