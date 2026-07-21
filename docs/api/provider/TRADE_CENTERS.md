# Trade Centers (Savdo markazlari) — Design

> Status: **approved, ready to implement** · Date: 2026-07-21 · Level: additive to Level 1
> Contract impact: **none to `elon-uz.json`** — new endpoints + new Branch fields are additive
> and backward-compatible (see §7). The mobile/frontend team integrates when ready.

## 1. Purpose

Many sellers (especially clothing) operate from a **stall inside a trade center / bazaar**
(Abu Saxiy, Bek Baraka, Chorsu, Ipodrom, Malika, …) rather than a street address. Their exact
in-market location is expressed with center-specific fields — `Qator` (row), `Pavilon`,
`Do'kon` (shop), `Qavat` (floor), `Blok`, `Sektor`, `Rastasi`, … — which **differ per center**.

This feature adds trade centers as first-class data plus per-center **dynamic fields**, and lets a
Branch record which trade center it sits in and the values for that center's fields. The frontend
renders a dynamic form from the field definitions.

## 2. Key decisions

**Location stays on the Branch (decision "B" + "A").** The Branch remains the single source of
truth for coordinates, region, district, and proximity ranking (`GET /discounts` is unchanged). A
trade center is **additional, structured location metadata on the Branch** — not a parallel
location system, and not stored on the Listing.

- **Not on the Listing:** a seller typically has one stall and posts many listings from it; storing
  the stall address per listing would duplicate data. Listings keep referencing Branch(es) exactly
  as today and inherit the trade-center detail from the branch.
- **Trade center has no coordinates of its own:** proximity always uses `Branch.lat/lng`. If it had
  coordinates, 500 listings in one bazaar would collapse to one point and effectively replace the
  branch model.

**UX (for reference, frontend):**
- **Branch create/edit:** ☑ "in a trade center" → pick a center → fill its dynamic fields.
- **Listing create:** only pick an existing Branch; if that branch is in a trade center the detail
  shows read-only (edited via the branch).

## 3. Data model (Prisma / PostgreSQL)

```prisma
enum TradeCenterStatus   { ACTIVE  INACTIVE }
enum TradeCenterFieldType { TEXT  NUMBER }   // extensible later: SELECT BOOLEAN DATE PHONE

model TradeCenter {
  id        String            @id @default(cuid())
  name      String
  slug      String            @unique
  status    TradeCenterStatus @default(ACTIVE)
  sortOrder Int               @default(0) @map("sort_order")
  createdAt DateTime          @default(now()) @map("created_at")
  updatedAt DateTime          @updatedAt      @map("updated_at")

  fields    TradeCenterField[]
  branches  Branch[]

  @@index([status, sortOrder])
  @@map("trade_centers")
}

model TradeCenterField {
  id            String                @id @default(cuid())
  tradeCenterId String                @map("trade_center_id")
  label         String                                          // "Qator", "Pavilon", ...
  type          TradeCenterFieldType  @default(TEXT)
  required      Boolean               @default(false)
  sortOrder     Int                   @default(0) @map("sort_order")

  tradeCenter TradeCenter                   @relation(fields: [tradeCenterId], references: [id], onDelete: Cascade)
  values      BranchTradeCenterFieldValue[]

  @@index([tradeCenterId, sortOrder])
  @@map("trade_center_fields")
}

// --- Branch: additive changes to the existing model ---
model Branch {
  // ...existing fields...
  tradeCenterId String? @map("trade_center_id")
  tradeCenter   TradeCenter? @relation(fields: [tradeCenterId], references: [id], onDelete: SetNull)
  tradeCenterFieldValues BranchTradeCenterFieldValue[]
  // @@index([tradeCenterId])
}

model BranchTradeCenterFieldValue {   // EAV
  id       String @id @default(cuid())
  branchId String @map("branch_id")
  fieldId  String @map("field_id")
  value    String

  branch Branch           @relation(fields: [branchId], references: [id], onDelete: Cascade)
  field  TradeCenterField @relation(fields: [fieldId],  references: [id], onDelete: Cascade)

  @@unique([branchId, fieldId])
  @@index([fieldId])
  @@map("branch_trade_center_field_values")
}
```

## 4. Endpoints (read-only, JWT-guarded, under `/v1`)

Module: `src/modules/trade-centers/` (standard DDD layers).

### `GET /v1/trade-centers`
List **ACTIVE** centers, ordered by `sortOrder` then `name`.
```jsonc
// result:
[ { "id": "tc_abusaxiy", "name": "Abu Saxiy", "slug": "abu-saxiy" }, ... ]
```

### `GET /v1/trade-centers/:id`
One center **with its fields** (ordered by `sortOrder`). Frontend builds the dynamic form from this.
```jsonc
// result:
{
  "id": "tc_abusaxiy", "name": "Abu Saxiy", "slug": "abu-saxiy",
  "fields": [
    { "id": "f_qator",   "label": "Qator",   "type": "TEXT",   "required": true,  "sortOrder": 0 },
    { "id": "f_pavilon", "label": "Pavilon", "type": "TEXT",   "required": true,  "sortOrder": 1 },
    { "id": "f_dokon",   "label": "Do'kon",  "type": "TEXT",   "required": true,  "sortOrder": 2 },
    { "id": "f_qavat",   "label": "Qavat",   "type": "NUMBER", "required": false, "sortOrder": 3 }
  ]
}
```
Unknown / INACTIVE id → `404 TRADE_CENTER_NOT_FOUND`.

## 5. Branch integration (extends the existing `branches` module)

**Request** — `BranchRequestDto` gains two optional fields:
```jsonc
{
  // ...existing branch fields (name, location, workingHours, ...)...
  "tradeCenterId": "tc_abusaxiy",
  "tradeCenterFields": [
    { "fieldId": "f_qator", "value": "A" },
    { "fieldId": "f_pavilon", "value": "23" },
    { "fieldId": "f_dokon", "value": "18" }
  ]
}
```

**Validation** (in `BranchesService`, on create and update):
1. If `tradeCenterId` is absent → ignore `tradeCenterFields` (branch simply isn't in a center).
2. `tradeCenterId` must exist and be `ACTIVE` → else `422 TRADE_CENTER_NOT_FOUND`.
3. Every `fieldId` must belong to that center → else `422 TRADE_CENTER_FIELD_INVALID`.
4. Every `required` field of that center must be present (non-empty) → else `422 TRADE_CENTER_FIELD_INVALID` (field-level message).
5. `NUMBER`-typed values must be numeric → else `422 TRADE_CENTER_FIELD_INVALID`.

Persisted as `BranchTradeCenterFieldValue` rows (replace-all on update). Clearing `tradeCenterId`
(set to null) removes the branch's field values.

**Response** — `BranchDto` gains (null when the branch isn't in a center):
```jsonc
{
  // ...existing branch fields...
  "tradeCenter": { "id": "tc_abusaxiy", "name": "Abu Saxiy" },
  "tradeCenterFields": [
    { "label": "Qator",   "type": "TEXT",   "value": "A"  },
    { "label": "Pavilon", "type": "TEXT",   "value": "23" },
    { "label": "Do'kon",  "type": "TEXT",   "value": "18" }
  ]
}
```

**New error codes** (`src/common/errors/error-code.ts`): `TRADE_CENTER_NOT_FOUND`,
`TRADE_CENTER_FIELD_INVALID`.

## 6. Seed data

Seed (idempotent upsert by `slug`) 5 centers with `sortOrder` 0..4 and their fields:

| Center | slug | Fields (`label` : `type`, required) |
|---|---|---|
| Abu Saxiy | `abu-saxiy` | Qator:TEXT✓ · Pavilon:TEXT✓ · Do'kon:TEXT✓ · Qavat:NUMBER |
| Bek Baraka | `bek-baraka` | Blok:TEXT✓ · Qator:TEXT✓ · Do'kon:TEXT✓ |
| Chorsu | `chorsu` | Sektor:TEXT✓ · Rastasi:TEXT✓ · Do'kon:TEXT✓ |
| Ipodrom | `ipodrom` | Qator:TEXT✓ · Do'kon:TEXT✓ |
| Malika | `malika` | Qator:TEXT✓ · Do'kon:TEXT✓ |

(Ipodrom/Malika field sets are a sensible default; adjust when the real bazaar layouts are known.)

## 7. API contract & compatibility

- `elon-uz.json` is **not modified**. The two new `GET /v1/trade-centers*` endpoints and the new
  optional Branch request/response fields are **additive**: the current generated mobile client
  never sends `tradeCenterId` and ignores unknown response fields, so nothing breaks.
- When the mobile/frontend team adopts this, they update `elon-uz.json` from this document and
  regenerate. Until then this is the contract of record for the feature (same pattern as the
  auth deviation noted in `CLAUDE.md`).

## 8. Out of scope (later)

- **Admin CRUD** for trade centers and their fields (create/edit/delete/reorder). Managed via seed
  for now; `sortOrder`/`status` already model what admin reordering + soft-disable will need.
- Additional field types (`SELECT`, `BOOLEAN`, `DATE`, `PHONE`) — the enum is ready to extend.

## 9. Testing

- `TradeCentersService` unit tests: list returns ACTIVE ordered; get-by-id returns fields ordered;
  unknown/inactive → 404.
- `BranchesService` unit tests (extend existing spec): valid trade-center + fields persists; unknown
  center → 422; foreign fieldId → 422; missing required field → 422; non-numeric NUMBER → 422;
  clearing `tradeCenterId` removes values.
