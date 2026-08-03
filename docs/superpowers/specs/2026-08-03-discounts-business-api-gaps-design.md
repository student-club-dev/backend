# Discounts business API — closing the seven gaps

Source request: `docs/api/mobile_questions/DISCOUNTS_BUSINESS_API.md` (mobile team).
Status: approved 2026-08-03. Supersedes the request document wherever the two disagree;
every departure is listed with its reason in §9.

The request describes the whole business-owner listing pipeline. **Most of it already ships.**
This design closes the seven places where the codebase and the contract genuinely diverge.

---

## 1. Boundary — what already exists

The request document is largely a restatement of `docs/api/provider/DISCOUNTS_BUSINESS_API.md`,
which is tracked and was reconciled with the contract in commit `17243a1`. Auditing the
codebase against it, the following are **already built and need no work**:

| Request § | Status |
|---|---|
| §3.1–3.9 models (Business, Branch, Listing, OptionGroup, Option, Redemption, Location) | Prisma models exist, with PostGIS `geo_point` + GiST index |
| §5.3 branches CRUD | `branches.controller.ts` |
| §5.4 listings CRUD + `submit`/`withdraw`/`pause`/`activate`/`duplicate`/`stats`/`redemptions` | `listing.controller.ts`, `listing-submit.controller.ts`, `listings.controller.ts` |
| §5.5 `POST /media/upload` | `media.controller.ts` — **including the §6.4 100 uploads/hour cap** (`@Throttle({ limit: 100, ttl: 3_600_000 })`) |
| §5.6 `redeem/verify` + `redeem/confirm` | `redemptions.controller.ts` |
| §5.7 `geo/geocode` + `geo/reverse-geocode` | `geocode.controller.ts` |
| §6.1 publish gates (all 7 of the implemented ones) | `listings.service.ts` `submit()` |
| §6.5 automatic statuses (`EXPIRED`, `SOLD_OUT`, `SCHEDULED → ACTIVE`) | `listing-status.cron.ts` |
| §6.6 location rules (bounds, district mismatch at 10 km, duplicate branch at 100 m) | `branches.service.ts` |
| §6.4 per-listing limits (10 images, 10 groups × 30 options, `PERCENT ≤ 90`) | `listings.service.ts` |
| §7 error codes | `src/common/errors/error-code.ts` — all of them |

`rejectionReason` already exists on both `Business` and `Listing`. The schema is
moderation-ready; the moderation work below needs **no migration for it**.

### The seven gaps

1. `POST /business/{businessId}/submit` — missing; businesses auto-approve on create.
2. §6.2 moderation (`PENDING_REVIEW` → approve/reject) — missing; `submit` publishes straight
   to `ACTIVE` (documented `TODO(post-MVP)` at `listings.service.ts:391`).
3. §6.3 re-moderation when an `ACTIVE` listing is edited — missing, follows from #2.
4. `GET /business/types/{type}/attributes-schema` — missing.
5. `GET /geo/regions` · `/geo/regions/{id}/districts` — live at `/regions` and `/districts`.
6. `GET /geo/metro-stations` — missing.
7. §6.4 account-level limits — 5 businesses/owner, 100 active listings/business,
   50 submits/day. (The 100 uploads/hour is already done, see above.)

---

## 2. Moderation, flag-gated (gaps #1–#3)

New env key, following the `CALLS_ENABLED` precedent exactly:

```ts
MODERATION_ENABLED: z.enum(['true', 'false']).default('false'),
```

**The flag changes only where a transition lands — never which validations run.** Every
publish gate executes identically in both modes. Default `false` preserves today's behaviour
so the mobile team is not blocked waiting on an admin panel; flipping it on is a config change,
not a deploy of new logic.

### 2.1 Business

- `POST /business` — replace the hardcoded `BusinessStatus.APPROVED`
  (`business.service.ts:46`) with `flag ? DRAFT : APPROVED`.
- **New** `POST /business/{businessId}/submit` → `BusinessDto`.
  - `DRAFT | REJECTED → PENDING_REVIEW`, clearing `rejectionReason`.
  - With the flag **off**, lands on `APPROVED` directly — the endpoint is never a dead end,
    and a client that calls it gets a usable business either way.
  - Ownership violation → 403 `FORBIDDEN`. Any other source status → 409
    `INVALID_STATUS_TRANSITION`. Unknown id → 404 `BUSINESS_NOT_FOUND`.
- **New** `POST /admin/businesses/{id}/approve` and `POST /admin/businesses/{id}/reject`
  (body `{ reason }`) → `PENDING_REVIEW → APPROVED | REJECTED`. `ADMIN` or `MODERATOR`.

These are decisions, not edits. They stay separate from the existing admin `PUT /admin/businesses/{id}`,
which is a full-replace edit — collapsing the two would let a moderator silently rewrite a
business while approving it.

### 2.2 Listing

- `listings.service.ts` `submit()` — replace the `TODO(post-MVP)` block at line 391:
  - flag **on** → `DRAFT → PENDING_REVIEW`;
  - flag **off** → today's `ACTIVE`, or `SCHEDULED` when `validFrom` is future. Unchanged.
- **New** `POST /admin/listings/{id}/approve` → `PENDING_REVIEW → ACTIVE`, or `SCHEDULED`
  when `validFrom` is still future (the cron already promotes those). `POST /admin/listings/{id}/reject`
  → `REJECTED` + `rejectionReason`.

### 2.3 Re-moderation on edit (§6.3)

A pure domain function, no NestJS and no Prisma, so it is unit-testable standalone:

```ts
// src/modules/listings/domain/re-moderation.ts
export function requiresReModeration(stored: Listing, incoming: UpdateListingInput): boolean
```

Returns true when any **material** field differs: `title`, `description`, `images`,
`discount` (type, value, conditions), `originalPrice`, `categoryKey`.

`listings.service.update()` then applies: `ACTIVE` + flag on + material change → `PENDING_REVIEW`;
otherwise the status is left alone. This covers §6.3's exempt set — `branchIds`, `validTo`,
`redemption.totalLimit`, `optionGroups[].isAvailable`, `attributes.stockCount`,
`attributes.seatsLeft` — without enumerating it, because a change confined to those fields
simply is not a material change.

`PUT` is a full replace, so this is a field-by-field comparison of stored against incoming,
not a patch inspection.

---

## 3. `GET /business/types/{type}/attributes-schema` (gap #4)

A third route on the existing `CatalogController`. The request document (§5.1, §10.1) asks for
"JSON Schema"; we serve the **same `AttributeFieldDto` vocabulary the categories endpoint
already returns**, because the client's dynamic form already parses it. Emitting draft-07
alongside it would mean two parsers for one concept.

```jsonc
{
  "businessType": "PLAYSTATION",
  "common": [ /* AttributeFieldDto[] — specs where category_key IS NULL */ ],
  "byCategory": [
    { "categoryKey": "PS5", "fields": [ /* AttributeFieldDto[] */ ] }
  ]
}
```

- New DTOs: `AttributesSchemaDto`, `CategoryAttributeFieldsDto`. `AttributeFieldDto` is reused.
- New repository method `findAllAttributeSpecs(businessType)` — the existing
  `findAttributeSpecs` requires a `categoryKey`, so it cannot serve a whole type.
- Unknown type → 404 `NOT_FOUND`, matching the sibling categories route.
- Public, no auth — it is static reference data, like the two routes beside it.

---

## 4. Geo path aliases (gap #5)

`elon-uz.json` specifies `/geo/regions` and `/geo/regions/{regionId}/districts`. The code
serves `/regions` and `/districts` — and those paths are **already documented and shipped to
the admin panel** (`docs/api/admin-panel/08-geo.md` §3, §4). Moving them would break it.

So: add, do not move. A new `GeoRegionsController` at `@Controller('geo/regions')` serving
`GET /geo/regions` and `GET /geo/regions/:regionId/districts`, delegating to the same
`GeoService` methods the existing controllers call. No logic is duplicated, no existing path
changes, and both consumers get the path their own contract names.

An unknown `regionId` on the nested districts route → 404 `NOT_FOUND`, matching
`GET /districts?regionId=`.

---

## 5. `GET /geo/metro-stations` (gap #6)

Not in `elon-uz.json` — a new ask from this document (§5.1). `Branch.metroStation` is free
text today and **stays that way**: the endpoint feeds an autocomplete, so adding an FK would
turn a new station into a branch-write failure.

New model:

```prisma
model MetroStation {
  id        String @id          // "CHILONZOR" — a readable key, like Region/District
  nameUz    String @map("name_uz")
  nameRu    String @map("name_ru")
  line      String              // e.g. "Chilonzor" — exact line/station list verified at seed time
  lat       Float
  lng       Float
  sortOrder Int    @default(0) @map("sort_order")
  @@map("metro_stations")
}
```

`GET /geo/metro-stations` → `MetroStationDto[]`, public, ordered by `line` then `sortOrder`.
Seeded with the Tashkent network. No `?regionId=` filter — the network is Tashkent-only, and a
parameter with one legal value is noise.

**Included addition.** `POST /geo/reverse-geocode` currently hardcodes `nearestMetro: null`
(`geocoding.service.ts:68`), a Level-1 stub called out in `GEO_GEOCODING.md` §7. With `lat/lng`
seeded, filling it in is a nearest-point scan over a few dozen rows, done in the service. This
closes the stub the request document's §5.7 response shape depends on.

---

## 6. Account-level limits (gap #7)

Following `student-listings/application/anti-spam.ts`: plain DB counts, `now` injected for
deterministic tests, throwing on the first breach. No Redis counter — Redis is wired, but a
count the database can answer does not need a second source of truth that can drift from it.

| Limit | Where | Code |
|---|---|---|
| 5 businesses per owner (non-`ARCHIVED`) | `business.service.create()` | 429 `RATE_LIMITED` |
| 100 active listings per business (`ACTIVE` + `PENDING_REVIEW`) | `listings.service.submit()` — §6.1 gate 8 | 429 `LISTING_LIMIT_REACHED` |
| 50 submits per day per owner | `listings.service.submit()` | 429 `RATE_LIMITED` |

`LISTING_LIMIT_REACHED` is reused for the listing cap to match how student-listings already
reports the same class of breach. Messages are user-facing Uzbek, as everywhere.

The daily submit count needs a submission timestamp, which does not exist. Adding
`Listing.submittedAt DateTime?` also gives the moderation queue of §2 its oldest-first ordering
and the §6.2 24-hour SLA its clock — one column, three uses.

---

## 7. Migrations

Two, both additive. No backfill, no destructive change, no lock of consequence.

1. `metro_stations` table + seed.
2. `listings.submitted_at` — nullable; existing rows read as "never submitted", which is
   correct for the daily-quota window and harmless for queue ordering.

---

## 8. Testing

- Unit, mocked repositories, **both flag states** for every moderation transition:
  business create/submit, listing submit, admin approve/reject.
- `requiresReModeration` — pure-function tests: each material field flipped in isolation, and
  the whole exempt set changed at once asserting `false`.
- Limit helpers — pure-function tests at, one below, and one above each cap.
- `nearestMetro` — nearest-point selection, including the no-stations-loaded case.
- e2e for the full chain: business create → submit → admin approve → listing create → submit →
  admin approve → visible to the student feed.

---

## 9. Departures from the request document

1. **§4's seven business types are not implemented.** The document defines `GAME_CLUB`,
   `GROCERY`, `CLOTHING`, `CAFE_RESTAURANT`, `EDUCATION_CENTER`, `ENTERTAINMENT`,
   `ELECTRONICS` with hardcoded per-type `attributes` keys. Our catalog has **27** types
   (`TENNIS`, `PLAYSTATION`, `NATIONAL_FOOD`, `BARBERSHOP`, …) seeded from `catalog-seed.json`,
   with attributes driven per **category** by `attribute_specs` rows. The document's taxonomy
   is stale; implementing it literally would be a regression, and the DB-driven form already
   delivers what §10.1 wants — new fields without a client release.
2. **`GET /discounts` (§5.8) is not built.** Killed deliberately in
   `ENDPOINTS_CHECKLIST.md` §8 and replaced by `POST /v1/discounts/search`
   (`docs/api/client/STUDENT_FEED.md` §2): a GET query string cannot carry the feed's filter
   model (`attributes[]` with operators, `bbox`, id arrays). The path stays `deprecated` in
   `elon-uz.json` for history.
3. **`attributes-schema` returns `AttributeFieldDto`, not draft-07 JSON Schema** — §3 above.
4. **Geo paths are aliased, not moved** — §4 above.
5. **Branch-per-business limit.** The mobile copy says 50; the reconciled provider copy says
   unlimited. We follow the provider copy — no limit — since it is the tracked source of truth.
6. **Auth is ours, not Firebase.** The document says `Authorization: Bearer <Firebase ID token>`
   throughout (§5). This backend owns authentication with its own JWT access/refresh pair over
   `students` and `business_owners`; see `docs/architecture/auth.md` (D6). Long-settled, noted
   here only because the request repeats the Firebase assumption.
7. **`403 FORBIDDEN_ROLE` / `NOT_BUSINESS_OWNER` (§7) are not distinct codes.** Both cases
   return `403 FORBIDDEN`, per the envelope contract in `CLAUDE.md`. Splitting them would tell
   a caller probing another owner's business that the id exists.
