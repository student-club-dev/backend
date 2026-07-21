# Listings (E'lonlar) — Design

> Status: **approved, ready to implement** · Date: 2026-07-21 · Level: 1 (core module)
> Contract impact: the two endpoints below **are already in `elon-uz.json`** — do not change it.
> This is the project's central module; Discounts, Search, Favorites, Views, Redemptions and
> Moderation all build on it, so the domain model + validation layer are locked first.

## 1. Scope (Level-1)

Exactly two operations:

- **`POST /v1/business/:businessId/listings`** → `201 ListingDto`, creates the listing as **`DRAFT`**.
- **`POST /v1/listings/:listingId/submit`** → `200 ListingDto`, transitions **`DRAFT → PENDING_REVIEW`**.

**Explicitly Level-2 (not here):** read/list/detail, update/edit, pause/activate/withdraw,
duplicate, statistics, moderation (`APPROVED`/`REJECTED`), and the cron lifecycle transitions
(`SCHEDULED`/`ACTIVE`/`EXPIRED`/`SOLD_OUT`). The Level-1 model + validation are designed so these
build on top without structural change.

## 2. Aggregate boundary

The `listings` module owns the whole **Listing aggregate** (all already in `schema.prisma`):

```
Listing (root)
├── ListingBranch   (M:N to Branch — the `branchIds` associations)
├── OptionGroup
│   └── Option
```

Create persists the **entire aggregate atomically in one transaction**. The `redemption` object in
the request is **configuration only** (method, promoCode, url, limits) stored on the `Listing`.
Actual `Redemption` records + QR/promo verify/confirm/history belong to the **separate Redemptions
module** (Level-2).

## 3. Contract (source of truth: `elon-uz.json`)

`CreateListingRequestDto` — required: `categoryKey, title, images, priceUnit, originalPrice,
discount, redemption, validFrom, validTo`; optional: `branchIds, customCategoryName, description,
currency, attributes, optionGroups`.

- `discount` = `DiscountRequestDto { type, value, conditions?, appliesToOptions? }`
- `redemption` = `RedemptionInfoDto { method, promoCode?, url?, perUserLimit?, perUserPeriod?, totalLimit? }`
- `attributes` = `ListingAttributesDto` (map `string → string`)
- `optionGroups` = `OptionGroupDto[]` (`{ name, selectionType, isRequired?, minSelect?, maxSelect?, sortOrder?, options[] }`, options `OptionDto { name, priceDelta, isAvailable?, sortOrder? }`)

`finalPrice`, `status`, `usedCount`, `viewsCount` are **server-owned** — ignored if the client sends them.

## 4. Pricing — server-computed `finalPrice` (4 discount types)

| type | `finalPrice` | rule |
|---|---|---|
| `PERCENT` | `originalPrice − originalPrice*value/100` | `value` 1..90; `>90 → 422 DISCOUNT_TOO_HIGH` |
| `FIXED_AMOUNT` | `max(0, originalPrice − value)` | |
| `SPECIAL_PRICE` | `value` | |
| `FREE_ITEM` | `originalPrice` | 1+1; `conditions` explains |

- Money is integer **so'm** (`BigInt` in Prisma, serialized to `Number`).
- `finalPrice` is **always recomputed server-side** and stored.
- Non-regular listings: enforce `finalPrice < originalPrice` (all types except `FREE_ITEM`), else
  `422 FINAL_PRICE_INVALID`.

## 5. Regular (non-discount) listings — `attributes._regular == "1"`

The catalog defines `_regular` (`catalog-seed.json` → `REGULAR_KEY`). A regular listing is a plain
single-price item (no student discount). When `_regular == "1"`:

- `finalPrice = originalPrice`.
- The discount pricing gates (`DISCOUNT_TOO_HIGH`, `FINAL_PRICE_INVALID`) are **skipped**.
- The `discount` object is still required by the contract and **structurally validated**, but is
  **normalized before persistence** to a canonical no-discount form so stored data isn't
  self-contradictory: **`type = PERCENT, value = 0`, `conditions = null`, `appliesToOptions = false`**.
  (Filters like `discountValue > 0` / `finalPrice < originalPrice` then cleanly exclude regulars.)

The business meaning lives in `_regular`, never in contradictory pricing columns.

> Doc-contradiction to fix after implementation: `DISCOUNTS_BUSINESS_API.md §32` says non-discount
> listings don't exist — it loses to `BACKEND_PROMPT.md` + `catalog-seed.json`; update it so there's
> one definition of a regular listing.

## 6. Attributes validation (full strict, against the catalog)

The catalog stays the single source of truth for attribute structure (`AttributeSpec`). Validation:

- Merge the applicable specs: **type-level** (`categoryKey IS NULL`) **+ category-level** (matching
  `categoryKey`) for the listing's business type.
- Every `required` spec must be present.
- Each value matches its `kind`: `TEXT`→string · `NUMBER`→numeric · `BOOLEAN`→boolean · `SELECT`→∈
  `options` · `MULTI_SELECT`→every value ∈ `options` · `TAGS`→**free-form strings** (not restricted
  to options).
- **Unknown keys rejected**, except reserved system keys `_regular`, `_gender`, `_phone`.
- Any failure → `422 ATTRIBUTES_SCHEMA_MISMATCH`. Listings is never more permissive than the catalog.

## 7. Redemption config validation

- `method ∈ {QR, PROMO_CODE, STUDENT_ID, ONLINE_LINK}`.
- `PROMO_CODE` → `promoCode` required. `ONLINE_LINK` → `url` required.
- `perUserLimit`, `totalLimit` ≥ 0 when present; `perUserPeriod ∈ {DAY, WEEK, MONTH, TOTAL}`.
- No `Redemption` rows are created here (Level-2).

## 8. Option groups validation

- ≤ 10 groups per listing, ≤ 30 options per group.
- `selectionType ∈ {SINGLE, MULTIPLE}`; `minSelect/maxSelect` coherent (`0 ≤ min ≤ max ≤ #options`);
  `isRequired` ⇒ `minSelect ≥ 1`.
- `priceDelta` is integer so'm (may be negative). Persisted under the listing in the same transaction.

## 9. `branchIds`

- **Create:** if provided, each id must belong to the business → else `422` (validation). Empty =
  "not specified yet" → persist no `ListingBranch` rows.
- **Submit:** if still empty and the business is **not** `isOnlineOnly`, resolve to the business's
  **current active branches**, snapshot them as `ListingBranch` rows, and require ≥ 1 → else
  `422 NO_ACTIVE_BRANCH`. `isOnlineOnly` businesses may have no branches.

## 10. Validation split — CREATE (correctness) vs SUBMIT (publish-readiness)

**CREATE (→ DRAFT): the stored draft is internally consistent, not necessarily publish-ready.**
Ownership; `categoryKey` ∈ catalog for the business type (`422 CATEGORY_NOT_IN_CATALOG`);
`customCategoryName` required iff `categoryKey == "OTHER"`; `title` 3–120; `originalPrice > 0`;
`validTo > validFrom` (≤ +1 year); `images ≤ 10`; pricing (§4/§5); attributes (§6); redemption (§7);
option groups (§8); `branchIds` ownership (§9). **The business need NOT be `APPROVED`; `images` may
be 0; branches may be empty** — those are publish gates, not draft gates.

**SUBMIT (DRAFT → PENDING_REVIEW): the §6.1 publish gates. SUBMIT never trusts CREATE** — a draft may
sit for weeks, so it independently re-validates everything below (category could be removed, a branch
deactivated, the business un-approved):
1. Business `status == APPROVED` → else `403 BUSINESS_NOT_APPROVED`.
2. ≥ 1 active branch with complete location, **or** `isOnlineOnly` → else `422 NO_ACTIVE_BRANCH` (§9).
3. `images ≥ 1`.
4. `finalPrice < originalPrice` — **skipped for regular listings**.
5. `validTo` in the future.
6. `categoryKey` ∈ business type (re-check).
7. `attributes` match the schema (re-check, §6).
- Listing must be in `DRAFT` → else `409 INVALID_STATUS_TRANSITION`; ownership.

**Deferred to Level-2** (need explicit error codes + policy, like max-branches): the active-listings
limit (≤ 100) and the daily-submit limit (≤ 50). Not implemented now.

## 11. Cross-module wiring — one published read port per bounded context

Each owning context exposes a **single public read interface**; listings depends only on those.

- **Business** — introduce a canonical exported read port, the Business context's official read API:
  `findSummaryById(id): Promise<{ id, ownerId, type, status, isOnlineOnly } | null>`. Listings uses
  it (ownership + submit gates). **Branches is refactored onto it**, deleting its local
  `OwningBusinessRepository` (one business-read port, not two overlapping ones).
- **Catalog** — reuse the exported `CATALOG_REPOSITORY`; **add** `findAttributeSpecs(type, categoryKey)`
  (and use existing `findCategoriesByType` for the category check).
- **Branches** — **export** `BRANCH_REPOSITORY` (already has `findManyByBusiness`) for the `branchIds`
  ownership + active-branch checks. No new port.

Listings imports `BusinessModule`, `CatalogModule`, `BranchesModule` and injects their read ports —
the same pattern branches uses for `GeoModule`/`TradeCentersModule`.

## 12. Module structure (`src/modules/listings/`, standard DDD)

```
domain/        entities (Listing, OptionGroup, Option value types), listing.repository.ts port,
               pricing (finalPrice calculator — pure), the reserved-attribute keys.
application/   listings.service.ts (create + submit use-cases), attribute-validation +
               submit-precondition helpers, listings.io.ts.
infrastructure/ listing.prisma.repository.ts (atomic aggregate create in a $transaction),
               listing.mapper.ts.
presentation/  listings.controller.ts (2 endpoints), dto/ (request + response, 1:1 with elon-uz.json).
```

The `finalPrice` calculator lives in `domain/` as a pure function (no NestJS/Prisma) so it's unit-testable
and reused by future edit/duplicate flows.

## 13. Error codes

Existing (reuse): `CATEGORY_NOT_IN_CATALOG`, `INVALID_STATUS_TRANSITION`, `VALIDATION_ERROR`,
`LISTING_NOT_FOUND`, `BUSINESS_NOT_FOUND`, `FORBIDDEN`.
**Add** to `src/common/errors/error-code.ts`: `DISCOUNT_TOO_HIGH`, `FINAL_PRICE_INVALID`,
`ATTRIBUTES_SCHEMA_MISMATCH`, `NO_ACTIVE_BRANCH`, `BUSINESS_NOT_APPROVED`.

> Note: `DISCOUNTS_BUSINESS_API.md §7` also lists `INVALID_CATEGORY_FOR_TYPE`. We use the
> contract/CLAUDE.md code `CATEGORY_NOT_IN_CATALOG` for "category not valid for this business type";
> reconcile the doc term when fixing §32.

## 14. Testing

- Pure unit tests for the `finalPrice` calculator across all 4 types + boundaries (0, 90, >90) + regular.
- `ListingsService` create: happy path (full aggregate), each validation failure (category, attributes,
  discount-too-high, final-price-invalid, customCategoryName-if-OTHER, option-group limits, redemption
  method rules, branchIds ownership), regular-listing normalization.
- `ListingsService` submit: each of the 7 gates independently (business not approved, no active branch,
  no images, final-price, past validTo, category removed, attributes drift), status-transition guard,
  empty-branchIds → active-branch snapshot, online-only path.
- Mock all three injected read ports.

## 15. Out of scope / follow-ups

Level-2: read/list/detail, edit, pause/activate/withdraw, duplicate, stats, moderation, cron
lifecycle, redemption lifecycle, count-limits. Doc fix: `DISCOUNTS_BUSINESS_API.md §32` (regular
listings) + the `INVALID_CATEGORY_FOR_TYPE` term.
