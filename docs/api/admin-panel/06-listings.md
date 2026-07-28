# 06 — E'lonlar (Listings)

> Konvensiyalar (base URL, envelope, pagination, auth guard'lar, scope belgilar, umumiy error kodlari) — [`00-overview.md`](./00-overview.md)da. Bu fayl faqat listings moduliga xos narsalarni tavsiflaydi.

---

## 1. Maqsad

`listings` — bu productning yadro "e'loni" (advertisement): biznes egasi o'z biznesi ostida chegirmali yoki oddiy taklif yaratadi, tahrirlaydi va uni **submit** qilib jonli qiladi. E'lon o'z lifecycle'iga ega (DRAFT → jonli → EXPIRED/SOLD_OUT/ARCHIVED). Student feed (`07-discounts-feed.md`) faqat `ACTIVE` e'lonlarni ko'rsatadi.

**Barcha endpointlar 🏢 Business + 🔓 owner-scoped:** har amal `BusinessAccountGuard` (student token → 403) va **ownership** tekshiruvidan o'tadi — e'lon (yoki uning biznesi) chaqiruvchiga tegishli bo'lishi shart, aks holda **403 FORBIDDEN** (birovning e'loni uchun 403, 404 emas — mavjudligini oshkor qilmaslik uchun).

Kod: `listings.controller.ts` (base `business/:businessId/listings`), `listing.controller.ts` (base `listings`), `listing-submit.controller.ts`, mantiq — `listings.service.ts`.

---

## 2. Endpointlar

| # | METHOD + path | Scope | Maqsad |
|---|---|---|---|
| 1 | `GET /v1/business/:businessId/listings` | 🏢 🔓 | Biznesning e'lonlari ro'yxati (paginated, filtered) |
| 2 | `POST /v1/business/:businessId/listings` | 🏢 🔓 | Yangi e'lon yaratish (→ `DRAFT`) |
| 3 | `PUT /v1/listings/:listingId` | 🏢 🔓 | E'lonni to'liq almashtirish (full replace) |
| 4 | `DELETE /v1/listings/:listingId` | 🏢 🔓 | Arxivlash (soft-delete → `ARCHIVED`) |
| 5 | `POST /v1/listings/:listingId/pause` | 🏢 🔓 | To'xtatib turish (`ACTIVE` → `PAUSED`) |
| 6 | `POST /v1/listings/:listingId/activate` | 🏢 🔓 | Qayta faollashtirish (`PAUSED` → `ACTIVE`/`SCHEDULED`) |
| 7 | `POST /v1/listings/:listingId/withdraw` | 🏢 🔓 | Ko'rikdan qaytarib olish (`PENDING_REVIEW` → `DRAFT`) |
| 8 | `POST /v1/listings/:listingId/duplicate` | 🏢 🔓 | Nusxa olish (→ yangi `DRAFT`) |
| 9 | `POST /v1/listings/:listingId/submit` | 🏢 🔓 | Ko'rikka yuborish — **MVP: to'g'ridan jonli** (pastga qarang) |
| 10 | `GET /v1/listings/:listingId/stats` | 🏢 🔓 | E'lon statistikasi (owner-only) |

> Diqqat: **list va create** biznes ostida nested (`business/:businessId/listings`); qolgan hammasi e'lon id bo'yicha (`listings/:listingId`) — ownership e'lonning o'z `businessId`sidan aniqlanadi.

---

## 3. Har endpoint

### Ownership qanday tekshiriladi (umumiy)

- **List / Create** (`business/:businessId/...`) → `assertBusinessOwned`: biznes mavjud bo'lmasa **404 `BUSINESS_NOT_FOUND`**, egasi boshqa bo'lsa **403 `FORBIDDEN`**. (Create biznes hali `APPROVED` bo'lmasa ham DRAFT yaratishga ruxsat beradi.)
- **Bir e'longa amallar** (update/archive/pause/activate/withdraw/duplicate/stats) → `loadOwnedListing`: e'lon topilmasa **yoki `ARCHIVED` bo'lsa 404 `LISTING_NOT_FOUND`** (arxivlangan e'lon o'chirilgan hisoblanadi), biznesi boshqa egaga tegishli bo'lsa **403 `FORBIDDEN`**.
- **Submit** — o'zining alohida yo'li: e'lon `findById` bilan topiladi (bu yerda `ARCHIVED` uchun maxsus 404 yo'q — arxivlangan e'lon status-guard'ga tushib **409 `INVALID_STATUS_TRANSITION`** beradi, chunki `DRAFT` emas).

---

### 1) `GET /v1/business/:businessId/listings` — ro'yxat 🏢 🔓

Biznesning e'lonlari, **eng yangisi birinchi**, 1-based paginatsiya.

**Filtrlar (query — `ListListingsQueryDto`):**

| Param | Type | Default | Izoh |
|---|---|---|---|
| `status` | `ListingStatus` | — | Bitta status bo'yicha filtr. **Berilmasa** — `ARCHIVED` chiqarib tashlanadi (qolgan barcha statuslar ko'rinadi). |
| `categoryKey` | string | — | Kategoriya kaliti bo'yicha (masalan `PIZZA`). |
| `page` | int ≥ 1 | `1` | **1-based** sahifa raqami. |
| `size` | int 1..100 | `20` | Sahifa hajmi, **max 100**. |

**Response:** `ListingPageDto` = `{ items: ListingDto[], page, size, total, hasNext }` (1-based; `hasNext = page * size < total`).

**BaseResponse (list page):**
```jsonc
{
  "success": true,
  "status": 200,
  "code": null,
  "message": "OK",
  "result": {
    "items": [ /* ListingDto[] — quyidagi shakl */ ],
    "page": 1,
    "size": 20,
    "total": 42,
    "hasNext": true
  },
  "error": null
}
```

**Xatolar:** `BUSINESS_NOT_FOUND` (404), `FORBIDDEN` (403).

---

### 2) `POST /v1/business/:businessId/listings` — yaratish 🏢 🔓 → **201**

E'lon **`DRAFT`** sifatida saqlanadi. `finalPrice`, `status`, `usedCount`, `viewsCount` — **server-owned** (request'da qabul qilinmaydi; client yuborgani e'tiborsiz).

**Request body — `CreateListingRequestDto`:**

| Field | Type | Majburiy | Izoh |
|---|---|---|---|
| `branchIds` | string[] | yo'q | Bo'sh/berilmasa → submit'da biznesning faol filiallariga bog'lanadi. Har id biznesga tegishli bo'lishi shart. |
| `categoryKey` | string | **ha** | Katalogdа biznes turi uchun mavjud bo'lishi shart. |
| `customCategoryName` | string\|null | `OTHER` bo'lsa **ha** | `categoryKey = OTHER` bo'lganda majburiy. |
| `title` | string | **ha** | 3–120 belgi. |
| `description` | string\|null | yo'q | ≤ 2000 belgi. |
| `images` | string[] | **ha** | ≤ 10 ta; **birinchisi — muqova (cover)**. |
| `priceUnit` | `PriceUnit` | **ha** | Narx birligi (pastga qarang). |
| `originalPrice` | int (so'm) | **ha** | > 0, butun so'm (tiyin yo'q). |
| `currency` | string | yo'q | Default `"UZS"`. |
| `discount` | `DiscountRequestDto` | **ha** | `{ type, value, conditions?, appliesToOptions? }`. |
| `redemption` | `RedemptionInfoDto` | **ha** | `{ method, promoCode?, url?, perUserLimit?, perUserPeriod?, totalLimit? }`. |
| `validFrom` | ISO-8601 | **ha** | Boshlanish. |
| `validTo` | ISO-8601 | **ha** | `validTo > validFrom`, ko'pi bilan **+1 yil**. |
| `attributes` | `{ [k]: string }` | yo'q | Biznes-turiga xos maydonlar; katalog sxemasiga tekshiriladi. |
| `optionGroups` | `OptionGroupDto[]` | yo'q | ≤ 10 guruh; har guruhda ≤ 30 variant. |

**Logika / validatsiya (`validateAndResolve` + `assertScalars` — create/update uchun umumiy):**
1. `categoryKey` katalogda biznes turi uchun bo'lishi shart → aks holda **422 `INVALID_CATEGORY_FOR_TYPE`**. `OTHER` → `customCategoryName` majburiy (**422 `VALIDATION_ERROR`**).
2. `title` 3–120, `originalPrice > 0`, `images ≤ 10`, `validTo > validFrom` va ≤ +1 yil → **422 `VALIDATION_ERROR`**.
3. **`finalPrice` server hisoblaydi** `discountType`+`discountValue`dan:
   - `PERCENT` value > 90 → **422 `DISCOUNT_TOO_HIGH`**.
   - `FREE_ITEM`dan tashqari `finalPrice >= originalPrice` → **422 `FINAL_PRICE_INVALID`**.
   - **Regular** e'lon (`attributes._regular == "1"`) → pricing gate'lari o'tkazib yuboriladi, discount kanonik "chegirmasiz" shaklga keltiriladi.
4. `attributes` katalog sxemasiga mos bo'lishi shart → aks holda **422 `ATTRIBUTES_SCHEMA_MISMATCH`**.
5. `redemption`: `PROMO_CODE` → `promoCode` majburiy; `ONLINE_LINK` → `url` majburiy; `perUserLimit`/`totalLimit` manfiy bo'lmasin → **422 `VALIDATION_ERROR`**.
6. `optionGroups`: ≤ 10 guruh, ≤ 30 variant/guruh, `minSelect`/`maxSelect` mantiqiy diapazon, majburiy guruhda `minSelect ≥ 1` → **422 `VALIDATION_ERROR`**.
7. `branchIds` — har biri biznesga tegishli bo'lishi shart → **422 `VALIDATION_ERROR`**.

**Response:** `ListingDto` (status = `DRAFT`).

**Xatolar:** `BUSINESS_NOT_FOUND` (404), `FORBIDDEN` (403), `VALIDATION_ERROR` (422), `INVALID_CATEGORY_FOR_TYPE` (422), `DISCOUNT_TOO_HIGH` (422), `FINAL_PRICE_INVALID` (422), `ATTRIBUTES_SCHEMA_MISMATCH` (422).

**BaseResponse (bitta `ListingDto`):**
```jsonc
{
  "success": true,
  "status": 201,
  "code": null,
  "message": "OK",
  "result": {
    "id": "lst_01H8XZ",
    "businessId": "biz_01H8AB",
    "branchIds": ["brn_01H8CD"],
    "categoryKey": "PIZZA",
    "customCategoryName": null,
    "title": "Pepperoni pitsa 35 sm",
    "description": "Yangi tandir pitsa",
    "images": ["https://cdn.elon.uz/l/lst_01H8XZ/1.jpg"],
    "priceUnit": "PER_ITEM",
    "originalPrice": 55000,
    "currency": "UZS",
    "discount": {
      "type": "PERCENT",
      "value": 20,
      "finalPrice": 44000,      // ⚠️ finalPrice — discount ICHIDA (top-level EMAS)
      "conditions": null,
      "appliesToOptions": false
    },
    "redemption": {
      "method": "QR",
      "promoCode": null,
      "url": null,
      "perUserLimit": 1,
      "perUserPeriod": "DAY",
      "totalLimit": 100,
      "usedCount": 0            // ⚠️ usedCount — redemption ICHIDA (top-level EMAS)
    },
    "validFrom": "2026-07-28T00:00:00.000Z",
    "validTo": "2026-08-28T00:00:00.000Z",
    "attributes": { "_regular": "0" },
    "optionGroups": [
      {
        "id": "og_01",
        "name": "Hajmni tanlang",
        "selectionType": "SINGLE",
        "isRequired": true,
        "minSelect": 1,
        "maxSelect": 1,
        "sortOrder": 0,
        "options": [
          { "id": "op_01", "name": "35 sm", "priceDelta": 0, "isAvailable": true, "sortOrder": 0 },
          { "id": "op_02", "name": "45 sm", "priceDelta": 12000, "isAvailable": true, "sortOrder": 1 }
        ]
      }
    ],
    "status": "DRAFT",
    "rejectionReason": null,
    "viewsCount": 0,
    "createdAt": "2026-07-28T10:30:00.000Z",
    "updatedAt": "2026-07-28T10:30:00.000Z"
  },
  "error": null
}
```

> ⚠️ **Gotcha (mobil/panel uchun muhim):** `finalPrice` — `discount.finalPrice` ichida, `usedCount` — `redemption.usedCount` ichida. **Top-level `finalPrice`/`usedCount` YO'Q.** `viewsCount` esa top-level.

---

### 3) `PUT /v1/listings/:listingId` — to'liq almashtirish 🏢 🔓 → **200**

Full replace. Body — `UpdateListingRequestDto` (create bilan bir xil, faqat `currency` yo'q — u o'zgarmas). Create bilan **aynan bir xil** re-validatsiya (yuqoridagi 7 qadam). `finalPrice` qayta hisoblanadi; **`status`, `currency`, `usedCount`, `viewsCount` saqlanib qoladi** (owner faqat kontentni tahrirlaydi, lifecycle'ni emas).

**Response:** `ListingDto`.
**Xatolar:** `LISTING_NOT_FOUND` (404, `ARCHIVED` ham 404), `FORBIDDEN` (403), va create'dagi barcha 422lar (`VALIDATION_ERROR`, `INVALID_CATEGORY_FOR_TYPE`, `DISCOUNT_TOO_HIGH`, `FINAL_PRICE_INVALID`, `ATTRIBUTES_SCHEMA_MISMATCH`).

---

### 4) `DELETE /v1/listings/:listingId` — arxivlash 🏢 🔓 → **200**

Soft-delete: e'lon `ARCHIVED` bo'ladi va ro'yxatdan tushadi. **`result: null`** qaytadi.
**Xatolar:** `LISTING_NOT_FOUND` (404), `FORBIDDEN` (403).

---

### 5) `POST /v1/listings/:listingId/pause` — to'xtatish 🏢 🔓 → **200**

`ACTIVE` → `PAUSED`. Boshqa har qanday status → **409 `INVALID_STATUS_TRANSITION`** ("Faqat faol e'lonni to'xtatib turish mumkin").
**Response:** `ListingDto`. **Xatolar:** `LISTING_NOT_FOUND` (404), `FORBIDDEN` (403), `INVALID_STATUS_TRANSITION` (409).

### 6) `POST /v1/listings/:listingId/activate` — qayta faollashtirish 🏢 🔓 → **200**

`PAUSED` → `ACTIVE`, **yoki** `validFrom` hali kelajakda bo'lsa → `SCHEDULED` (cron o'z vaqtida jonli qiladi). `PAUSED`dan boshqa status → **409 `INVALID_STATUS_TRANSITION`**.
**Response:** `ListingDto`. **Xatolar:** `LISTING_NOT_FOUND` (404), `FORBIDDEN` (403), `INVALID_STATUS_TRANSITION` (409).

### 7) `POST /v1/listings/:listingId/withdraw` — ko'rikdan qaytarish 🏢 🔓 → **200**

`PENDING_REVIEW` → `DRAFT` (owner tahrirlab qayta submit qilishi uchun). Boshqa status → **409 `INVALID_STATUS_TRANSITION`**.
**Response:** `ListingDto`. **Xatolar:** `LISTING_NOT_FOUND` (404), `FORBIDDEN` (403), `INVALID_STATUS_TRANSITION` (409).

> ⚠️ MVP'da submit `PENDING_REVIEW`ni **chetlab o'tadi** (pastga qarang), shuning uchun amalda `withdraw` deyarli hech qachon ishlamaydi — hech bir e'lon `PENDING_REVIEW`da qolmaydi. Endpoint mavjud, lekin moderatsiya yoqilmaguncha "o'lik".

### 8) `POST /v1/listings/:listingId/duplicate` — nusxa 🏢 🔓 → **201**

E'lon kontenti, filiallari va option-guruhlari yangi **`DRAFT`**ga klonlanadi; `usedCount`/`viewsCount` **0**ga tushiriladi. `EXPIRED`/`SOLD_OUT` taklifni qayta e'lon qilish uchun. Owner nusxani mustaqil tahrirlab submit qiladi.
**Response:** yangi `ListingDto` (status = `DRAFT`). **Xatolar:** `LISTING_NOT_FOUND` (404), `FORBIDDEN` (403).

---

### 9) `POST /v1/listings/:listingId/submit` — ko'rikka yuborish 🏢 🔓 → **200**

**Nominal:** `DRAFT` → `PENDING_REVIEW`.
**⚠️ MVP haqiqati:** moderatsiya **yo'q** — submit e'lonni **to'g'ridan-to'g'ri jonli** qiladi:
- `DRAFT` → **`ACTIVE`**, yoki
- `validFrom` kelajakda bo'lsa → **`SCHEDULED`** (cron uni o'z vaqtida `ACTIVE` qiladi).

Sabab (kod izohi): kodda boshqa hech narsa `ACTIVE` o'rnatmaydi, shuning uchun moderatsiyasiz pipeline "o'lik yo'l"ga aylanardi va hech bir e'lon student feedga (faqat `ACTIVE`) chiqmasdi. Bu — bizneslarning create'da avto-`APPROVED` bo'lishiga o'xshash vaqtinchalik yechim.

**Faqat `DRAFT` submit qilinadi** → aks holda **409 `INVALID_STATUS_TRANSITION`**.

**Publish gate'lari** (har biri mustaqil, noldan qayta tekshiriladi — draft eski bo'lishi mumkin, hech narsaga ishonilmaydi):

| # | Gate | Buzilса |
|---|---|---|
| 1 | Biznes `APPROVED` | **403 `BUSINESS_NOT_APPROVED`** |
| 2 | ≥ 1 faol filial **yoki** biznes online-only | **422 `NO_ACTIVE_BRANCH`** |
| 3 | ≥ 1 rasm | **422 `VALIDATION_ERROR`** `{ images }` |
| 4 | `finalPrice < originalPrice` (qayta hisoblangan; **regular** va **FREE_ITEM** uchun o'tkazib yuboriladi) | **422 `FINAL_PRICE_INVALID`** |
| 5 | `validTo` kelajakda | **422 `VALIDATION_ERROR`** `{ validTo }` |
| 6 | `categoryKey` hali katalogda (biznes turi uchun) | **422 `INVALID_CATEGORY_FOR_TYPE`** |
| 7 | `attributes` hali sxemaga mos | **422 `ATTRIBUTES_SCHEMA_MISMATCH`** |

Gate 2 izohi: `branchIds` bo'sh bo'lsa — biznesning joriy faol filiallari snapshot qilinadi (≥ 1 shart); `branchIds` berilgan bo'lsa — kamida bittasi hali faol filial bo'lishi kerak.

**Response:** `ListingDto` (status = `ACTIVE` yoki `SCHEDULED`).
**Xatolar:** `LISTING_NOT_FOUND` / `BUSINESS_NOT_FOUND` (404), `FORBIDDEN` (403), `BUSINESS_NOT_APPROVED` (403), `INVALID_STATUS_TRANSITION` (409), `NO_ACTIVE_BRANCH` (422), `VALIDATION_ERROR` (422), `FINAL_PRICE_INVALID` (422), `INVALID_CATEGORY_FOR_TYPE` (422), `ATTRIBUTES_SCHEMA_MISMATCH` (422).

---

### 10) `GET /v1/listings/:listingId/stats` — statistika 🏢 🔓 → **200**

Owner analitikasi. **Response — `ListingStatsDto`:**

| Field | Type | Izoh |
|---|---|---|
| `listingId` | string | |
| `viewsCount` | int | Detail ko'rishlar. |
| `favoritesCount` | int | Saqlagan studentlar. |
| `redemptionsCount` | int | Tasdiqlangan redemption'lar. |
| `conversionRate` | double | `redemptionsCount / viewsCount` (views = 0 bo'lsa `0`). |
| `totalRevenue` | int (so'm) | Tasdiqlangan redemption'lar umumiy qiymati. |

**Xatolar:** `LISTING_NOT_FOUND` (404), `FORBIDDEN` (403).

---

## Status lifecycle (transitions)

**HTTP orqali (bu modul):**

| Amal | O'tish |
|---|---|
| create | → `DRAFT` |
| submit (MVP) | `DRAFT` → `ACTIVE` (yoki `SCHEDULED` agar `validFrom` kelajakda) |
| pause | `ACTIVE` → `PAUSED` |
| activate | `PAUSED` → `ACTIVE` (yoki `SCHEDULED`) |
| withdraw | `PENDING_REVIEW` → `DRAFT` |
| duplicate | (istalgan) → yangi `DRAFT` |
| archive (DELETE) | (istalgan, arxivlanmagan) → `ARCHIVED` |

**Cron orqali (HTTP EMAS — `runStatusTransitions`, BACKEND_PROMPT §7):** `SCHEDULED` → `ACTIVE` (`validFrom` yetganda), `ACTIVE` → `EXPIRED` (`validTo` o'tganda), `ACTIVE` → `SOLD_OUT` (`usedCount ≥ totalLimit`).

> **`REJECTED` hech bir endpoint tomonidan o'rnatilmaydi** — moderatsiya yo'q. `rejectionReason` maydoni response'da bor, lekin doim `null`. `PENDING_REVIEW` ham amalda hech qachon o'rnatilmaydi (submit uni chetlab o'tadi).

---

## 4. Enumlar

| Enum | Qiymatlar |
|---|---|
| `ListingStatus` | `DRAFT`, `PENDING_REVIEW`, `REJECTED`, `SCHEDULED`, `ACTIVE`, `PAUSED`, `EXPIRED`, `SOLD_OUT`, `ARCHIVED` |
| `DiscountType` | `PERCENT`, `FIXED_AMOUNT`, `SPECIAL_PRICE`, `FREE_ITEM` |
| `RedemptionMethod` | `QR`, `PROMO_CODE`, `STUDENT_ID`, `ONLINE_LINK` |
| `RedemptionPeriod` | `DAY`, `WEEK`, `MONTH`, `TOTAL` |
| `PriceUnit` | `PER_ITEM`, `PER_HOUR`, `PER_KG`, `PER_MONTH`, `PER_COURSE`, `PER_LESSON`, `PER_TICKET`, `PER_PERSON`, `PER_SESSION` |
| `SelectionType` | `SINGLE`, `MULTIPLE` |

**Discount qiymatlari:** `PERCENT` → `value` = 1..90; `FIXED_AMOUNT`/`SPECIAL_PRICE` → `value` = so'm; `FREE_ITEM` → 1+1 tipidagi, narx tushmaydi (finalPrice == originalPrice legitim). Pul — hamma joyda butun **so'm** (`BigInt` → JSON `Number`), tiyin yo'q, `currency: "UZS"`.

---

## 5. Xatolar

| `error.code` | HTTP | Qachon |
|---|---|---|
| `UNAUTHORIZED` / `TOKEN_EXPIRED` | 401 | Token yo'q/yaroqsiz / muddati o'tgan |
| `FORBIDDEN` | 403 | Student token, yoki e'lon/biznes boshqa egaga tegishli |
| `BUSINESS_NOT_APPROVED` | 403 | Submit: biznes hali `APPROVED` emas |
| `BUSINESS_NOT_FOUND` | 404 | Biznes topilmadi (list/create/submit) |
| `LISTING_NOT_FOUND` | 404 | E'lon topilmadi yoki `ARCHIVED` |
| `INVALID_STATUS_TRANSITION` | 409 | pause/activate/withdraw/submit — noto'g'ri joriy status |
| `VALIDATION_ERROR` | 422 | Umumiy field validatsiya (title, price, images, validTo, OTHER nomi, redemption, optionGroups, branchIds) — `error.fields` bilan |
| `INVALID_CATEGORY_FOR_TYPE` | 422 | `categoryKey` biznes turi katalogida yo'q |
| `DISCOUNT_TOO_HIGH` | 422 | `PERCENT` chegirma > 90% |
| `FINAL_PRICE_INVALID` | 422 | `finalPrice >= originalPrice` (FREE_ITEM/regular'dan tashqari) |
| `ATTRIBUTES_SCHEMA_MISMATCH` | 422 | `attributes` katalog sxemasiga mos emas |
| `NO_ACTIVE_BRANCH` | 422 | Submit: faol filial yo'q (online-only emas) |

---

## 6. Admin panel eslatmasi

**Mobil tomon hamon 🔓 owner-scoped:** `GET /business/:businessId/listings` bitta biznesga bog'langan va owner-gated, birovning e'loni/stats → **403**. Bular o'zgarmaydi.

**Admin uchun cross-business listings qatlami — ✅ built** ([`ADMIN-API.md`](./ADMIN-API.md)):
- `GET /v1/admin/listings` — **hamma biznes bo'ylab** ro'yxat, filtr: `status[]` (jumladan `DRAFT`/`PENDING`/`REJECTED`), `businessId`, `ownerId`, `categoryKey`, `type`, `groupKey`, `regionId`, `districtId`, narx (`priceMin/Max` + `priceBasis`), chegirma, `listingKind`, `redemptionMethod`, sana; paginatsiya (Faza 1);
- `GET /v1/admin/listings/:id` — **har status**, owner-bypass; `GET /v1/admin/listings/:id/stats` ham owner-bypass (Faza 1);
- `PUT /v1/admin/listings/:id` — admin tahrir (finalPrice qayta hisob + catalog/attribute/discount validatsiya) (Faza 3).

**🔴 hali yo'q (kutilmoqda):** moderatsiya oqimi — approve/reject endpointlari, `REJECTED`/`PENDING_REVIEW`ni o'rnatish, submit `DRAFT → PENDING_REVIEW`ga o'tishi. Hozir submit moderatsiyani chetlab to'g'ridan jonli qiladi. To'liq reja: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
