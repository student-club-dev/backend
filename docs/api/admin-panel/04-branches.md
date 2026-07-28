# 04 — Filiallar / do'konlar (Branches)

> Konvensiyalar (base URL, envelope, auth guard'lar, scope belgilar, error kodlari) — [`00-overview.md`](./00-overview.md). Bu fayl faqat shu modulga xos mantiq, DTO va filtrlarni tasvirlaydi.

## 1. Maqsad

Filial (branch) — bir biznesning jismoniy **do'koni/nuqtasi**: lokatsiya (viloyat/tuman + koordinata), ish vaqti, ixtiyoriy yetkazib berish zonasi, va ixtiyoriy **savdo markazi** (trade center) bog'lanishi. E'lonlar (`listings`) shu filiallarga tegishli bo'ladi va student feed'i filial koordinatasi bo'yicha yaqinlikni hisoblaydi.

Bu modul — **owner-side CRUD**: barcha endpointlar biznes ostida nested (`/business/:businessId/branches`) va faqat **o'sha biznes egasi** uchun. Ro'yxat oddiy massiv (paginatsiyasiz). `DELETE` — **hard delete** (filialda status ustuni yo'q).

Kodda: `src/modules/branches/presentation/branches.controller.ts`, `application/branches.service.ts`, DTO'lar `presentation/dto/`.

## 2. Endpointlar

Barcha endpointlar guard'lari: `JwtAuthGuard` + `BusinessAccountGuard` → **🏢 Business** (student token → **403**), va har amal **🔓 owner-scoped** (ota-biznes `ownerId === req.user.id` bo'lishi shart, aks holda **403 FORBIDDEN**).

| METHOD + path | Scope | Maqsad |
|---|---|---|
| `GET /v1/business/:businessId/branches` | 🏢 🔓 | Biznesning barcha filiallari (massiv, paginatsiyasiz) |
| `POST /v1/business/:businessId/branches` | 🏢 🔓 | Filial yaratish (HTTP **201**) |
| `PUT /v1/business/:businessId/branches/:branchId` | 🏢 🔓 | Filialni **to'liq almashtirish** (full replace) |
| `DELETE /v1/business/:businessId/branches/:branchId` | 🏢 🔓 | Filialni **hard delete** (HTTP **200**, `result: null`) |

> `:businessId` har path'da majburiy path-param. `POST`/`PUT`/`DELETE` avval biznes egaligini tekshiradi (404 `BUSINESS_NOT_FOUND` yoki 403 `FORBIDDEN`), keyingina asosiy amal.

---

## 3. Har endpoint

### 3.1 `GET /v1/business/:businessId/branches` 🏢 🔓

Egalik qilingan biznesning barcha filiallari.

- **Request:** body yo'q. Faqat `:businessId` path-param. **Paginatsiya, filtr, sort yo'q** — javob to'g'ridan-to'g'ri `BranchDto[]` massivi.
- **Response:** `result` — `BranchDto` massivi (pastdagi shakl).
- **Logika:** `assertBusinessOwned` → biznes bor (404) va egaga tegishli (403) → `findManyByBusiness(businessId)`.

### 3.2 `POST /v1/business/:businessId/branches` 🏢 🔓

Yangi filial yaratadi. **HTTP 201.**

- **Request DTO:** `BranchRequestDto` (pastda). `result` — yaratilgan `BranchDto`.
- **Logika (tartib bilan):**
  1. `assertBusinessOwned` — biznes bor (404 `BUSINESS_NOT_FOUND`) va egaga tegishli (403 `FORBIDDEN`).
  2. **Lokatsiya validatsiyasi** (§3.5) — 4 ta gate + geohash serverda hisoblanadi.
  3. **Savdo markazi validatsiyasi** (§3.6) — trade-center va uning maydonlari.
  4. Yozib qo'yiladi; javob to'liq `BranchDto`.

### 3.3 `PUT /v1/business/:businessId/branches/:branchId` 🏢 🔓

Filialni **to'liq almashtiradi** (full-replace — PATCH emas; barcha maydonlar qayta yuboriladi). Spec'da yagona `BranchRequestDto` (create bilan bir xil).

- **Request DTO:** `BranchRequestDto`. `result` — yangilangan `BranchDto`.
- **Logika:**
  1. `loadOwnedBranch` — biznes egalik (404/403) + filial shu biznesda mavjud, aks holda **404 `BRANCH_NOT_FOUND`**.
  2. **Lokatsiya validatsiyasi** — duplicate-check'da **shu filialning o'zi chetlab o'tiladi** (`excludeBranchId`), ya'ni o'z koordinatasi duplicate hisoblanmaydi.
  3. **Savdo markazi validatsiyasi**.
  4. Yangilanadi.

### 3.4 `DELETE /v1/business/:businessId/branches/:branchId` 🏢 🔓

Filialni **butunlay o'chiradi** (hard delete — filialda status/soft-delete ustuni yo'q). **HTTP 200**, `result: null`.

- **Request:** body yo'q.
- **Logika:** `loadOwnedBranch` (404/403 yuqoridagidek) → `branches.delete(branchId)`.

### 3.5 Lokatsiya validatsiya gate'lari (create + update)

`validateLocation` — DTO-darajali chegaralar (`LocationDto`) o'tgach, servisda quyidagi 5 qadam (DISCOUNTS_BUSINESS_API §6.6):

| # | Qoida | Buzilsa |
|---|---|---|
| 1 | Koordinata O'zbekiston chegarasida (`isWithinUzbekistan`) | **422 `LOCATION_OUT_OF_BOUNDS`** — "Koordinata O'zbekiston chegarasidan tashqarida" |
| 2 | `districtId` tanlangan `regionId`ga tegishli | **422 `DISTRICT_REGION_MISMATCH`** — "Tuman tanlangan viloyatga tegishli emas" |
| 3 | Nuqta tuman markazidan **≤ 10 km** (markaz koordinatasi noma'lum bo'lsa, o'tkazib yuboriladi) | **422 `LOCATION_DISTRICT_MISMATCH`** — "Nuqta tanlangan tumandan 10 km dan uzoq" |
| 4 | Shu biznesning boshqa filiali **100 m** radiusda yo'q (update'da o'zi hisobga olinmaydi) | **409 `DUPLICATE_BRANCH_LOCATION`** — "100 m radiusda shu biznesning filiali bor" |
| 5 | `geohash` serverda hisoblanadi (precision **7**, ~150 m) — client yuborgan qiymat **e'tiborsiz** | — |

### 3.6 Savdo markazi validatsiya gate'lari (create + update)

`validateTradeCenter` (TRADE_CENTERS.md §5). Lokatsiyadan **keyin** ishlaydi:

| # | Qoida | Buzilsa |
|---|---|---|
| 1 | `tradeCenterId === null` → yuborilgan `tradeCenterFields` **e'tiborsiz** (avvalgi qiymatlar tozalanadi) | — |
| 2 | Tanlangan markaz mavjud va **ACTIVE** | **422 `TRADE_CENTER_NOT_FOUND`** — "Savdo markazi topilmadi yoki faol emas" |
| 3 | Har yuborilgan `fieldId` shu markazga tegishli va **takrorlanmagan** | **422 `TRADE_CENTER_FIELD_INVALID`** (+ `fields`) — "Maydon ushbu savdo markaziga tegishli emas" / "Maydon ikki marta yuborilgan" |
| 4 | Har **required** maydon bor va bo'sh emas | **422 `TRADE_CENTER_FIELD_INVALID`** (+ `fields`) — "Majburiy maydon to'ldirilmagan" (`{fieldId: "<label> majburiy"}`) |
| 5 | `NUMBER`-tipdagi qiymat raqamli (bo'sh optional qiymat tegilmaydi) | **422 `TRADE_CENTER_FIELD_INVALID`** (+ `fields`) — "Qiymat raqamli bo'lishi kerak" |

---

## DTO'lar

### `BranchRequestDto` (create + update — bir xil)

| Field | Type | Majburiy | Qoida |
|---|---|---|---|
| `name` | string | ✅ | bo'sh emas |
| `location` | `LocationDto` | ✅ | nested (pastda) |
| `phone` | string \| null | — | ixtiyoriy |
| `workingHours` | `WorkingHoursDto[]` | ✅ | massiv (bo'sh bo'lishi mumkin) |
| `deliveryZone` | `DeliveryZoneDto` \| null | — | ixtiyoriy |
| `isActive` | boolean | — | default `true` |
| `tradeCenterId` | string \| null | — | tashlab ketilsa → markazda emas |
| `tradeCenterFields` | `BranchTradeCenterFieldInputDto[]` | — | `tradeCenterId` yo'q bo'lsa e'tiborsiz |

### `LocationDto`

| Field | Type | Majburiy | Qoida / diapazon |
|---|---|---|---|
| `regionId` | string | ✅ | masalan `"TOSHKENT_SHAHRI"` |
| `districtId` | string | ✅ | masalan `"CHILONZOR"` |
| `address` | string | ✅ | uzunlik **5–200** |
| `landmark` | string \| null | — | maxLength **200** |
| `entranceNote` | string \| null | — | maxLength **120** (masalan "Ikkinchi qavat, lift bilan") |
| `lat` | number | ✅ | **37.0 – 46.0** (double) |
| `lng` | number | ✅ | **55.0 – 74.0** (double) |
| `geohash` | string \| null | — | **serverda hisoblanadi** (7 belgi ~150 m); requestda e'tiborsiz, faqat responseda |
| `mapUrl` | string \| null | — | ixtiyoriy |
| `metroStation` | string \| null | — | faqat Toshkent shahri |

> Koordinata chegarasi ikki qatlamda: DTO `@Min/@Max` (37–46 / 55–74) — dagi keng "quti", so'ng servis `isWithinUzbekistan` bilan aniqroq chegara (`LOCATION_OUT_OF_BOUNDS`).

### `WorkingHoursDto` (bir kun)

| Field | Type | Majburiy | Qoida |
|---|---|---|---|
| `day` | `DayOfWeek` | ✅ | `MON`..`SUN` (enum) |
| `open` | string \| null | — | `"HH:mm"` formatida, masalan `"09:00"` |
| `close` | string \| null | — | `"HH:mm"`, masalan `"23:00"` |
| `isClosed` | boolean | ✅ | shu kuni yopiq bo'lsa `true` |

> `close < open` bo'lsa — tunda ochiq (masalan `20:00`–`04:00`). Format serverda qat'iy tekshirilmaydi (faqat `IsString`) — client to'g'ri `HH:mm` yuborishi kutiladi.

### `DeliveryZoneDto` (ixtiyoriy yetkazib berish)

| Field | Type | Majburiy | Qoida |
|---|---|---|---|
| `enabled` | boolean | ✅ | — |
| `radiusMeters` | int \| null | `enabled=true` bo'lsa ✅ | **1000 – 30000** |
| `minOrderAmount` | int \| null | — | so'm (int64) |
| `deliveryFee` | int \| null | — | so'm |
| `freeDeliveryFrom` | int \| null | — | so'm |

> Asosan `GROCERY` va `CAFE_RESTAURANT` uchun. Pul maydonlari — butun so'm.

### `BranchTradeCenterFieldInputDto` (request — bitta maydon qiymati)

| Field | Type | Majburiy |
|---|---|---|
| `fieldId` | string | ✅ (bo'sh emas) |
| `value` | string | ✅ |

### `BranchDto` (response)

| Field | Type | Izoh |
|---|---|---|
| `id` | string | filial id (cuid) |
| `businessId` | string | ota-biznes id |
| `name` | string | — |
| `location` | `LocationDto` | `geohash` to'ldirilgan holda qaytadi |
| `phone` | string \| null | — |
| `workingHours` | `WorkingHoursDto[]` | — |
| `deliveryZone` | `DeliveryZoneDto` \| null | — |
| `isActive` | boolean | — |
| `tradeCenter` | `{ id, name }` \| null | markazda bo'lsa (display uchun) |
| `tradeCenterFields` | `{ label, type, value }[]` | resolve qilingan maydon qiymatlari (markazda emas → `[]`) |

**BaseResponse — `BranchDto` (create/update javobi):**

```jsonc
{
  "success": true,
  "status": 200,
  "code": null,
  "message": "OK",
  "result": {
    "id": "br_01H8X",
    "businessId": "biz_01H8A",
    "name": "Chilonzor filiali",
    "location": {
      "regionId": "TOSHKENT_SHAHRI",
      "districtId": "CHILONZOR",
      "address": "Chilonzor 9-kvartal, 42-uy",
      "landmark": null,
      "entranceNote": "Ikkinchi qavat, lift bilan",
      "lat": 41.2856,
      "lng": 69.2034,
      "geohash": "tzr3n2k",
      "mapUrl": null,
      "metroStation": "Chilonzor"
    },
    "phone": "+998901234567",
    "workingHours": [
      { "day": "MON", "open": "09:00", "close": "23:00", "isClosed": false },
      { "day": "SUN", "open": null, "close": null, "isClosed": true }
    ],
    "deliveryZone": {
      "enabled": true,
      "radiusMeters": 5000,
      "minOrderAmount": 50000,
      "deliveryFee": 10000,
      "freeDeliveryFrom": 150000
    },
    "isActive": true,
    "tradeCenter": { "id": "tc_abusaxiy", "name": "Abu Saxiy" },
    "tradeCenterFields": [
      { "label": "Qator", "type": "TEXT", "value": "A" },
      { "label": "Do'kon raqami", "type": "NUMBER", "value": "42" }
    ]
  },
  "error": null
}
```

> `GET` (ro'yxat) javobida `result` — shu obyektlarning **massivi** (paginatsiya kalitlari yo'q). `DELETE` javobida `result: null`.

---

## 4. Enumlar

| Enum | Qiymatlar |
|---|---|
| `DayOfWeek` (`DayOfWeekDto`) | `MON` `TUE` `WED` `THU` `FRI` `SAT` `SUN` (dushanba-birinchi) |
| `TradeCenterFieldType` (`TradeCenterFieldTypeDto`) | `TEXT` `NUMBER` (keyinchalik kengaytiriladi: SELECT/BOOLEAN/DATE/PHONE) |

---

## 5. Xatolar

| `error.code` | HTTP | Qachon |
|---|---|---|
| `UNAUTHORIZED` / `TOKEN_EXPIRED` | 401 | Token yo'q/yaroqsiz / muddati o'tgan |
| `FORBIDDEN` | 403 | Biznes token emas (student), yoki biznes **boshqa egaga** tegishli |
| `BUSINESS_NOT_FOUND` | 404 | `:businessId` bo'yicha biznes yo'q |
| `BRANCH_NOT_FOUND` | 404 | `:branchId` yo'q yoki shu biznesga tegishli emas (`PUT`/`DELETE`) |
| `DUPLICATE_BRANCH_LOCATION` | 409 | 100 m radiusda shu biznesning boshqa filiali bor |
| `LOCATION_OUT_OF_BOUNDS` | 422 | Koordinata O'zbekiston chegarasidan tashqarida |
| `DISTRICT_REGION_MISMATCH` | 422 | Tuman tanlangan viloyatga tegishli emas |
| `LOCATION_DISTRICT_MISMATCH` | 422 | Nuqta tumandan 10 km dan uzoq |
| `TRADE_CENTER_NOT_FOUND` | 422 | Savdo markazi topilmadi yoki faol emas |
| `TRADE_CENTER_FIELD_INVALID` | 422 | Noma'lum/takroriy/majburiy/raqamli-emas maydon (`error.fields` to'ldiriladi) |
| `VALIDATION_ERROR` | 422 | DTO-darajali chegaralar (uzunlik, lat/lng diapazoni, `radiusMeters` va h.k.) |

---

## 6. Admin panel eslatmasi

**🔓 owner-scoped (mobil) — bu yerdagi hamma narsa faqat egalik qilingan biznes ostida yetib boradi.** `GET /business/:businessId/branches` biznes egaligini tekshiradi (begona → **403**), global ro'yxat yoki filtr yo'q. Bular o'zgarmaydi.

**Admin uchun cross-business filial qatlami — ✅ built** ([`ADMIN-API.md`](./ADMIN-API.md)):
- `GET /v1/admin/branches` — **barcha biznes bo'ylab** filiallar, filtr: `q, businessId, ownerId, regionId, districtId, tradeCenterId, isActive, hasDelivery`, **geo** (bbox yoki radius, PostGIS `ST_DWithin`) + paginatsiya (Faza 1);
- `GET /v1/admin/branches/:id` — istalgan filial, owner-bypass (Faza 1);
- `PUT /v1/admin/branches/:id` — admin tahrir (full replace + location/trade-center gate'lar) (Faza 3).

To'liq reja: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
