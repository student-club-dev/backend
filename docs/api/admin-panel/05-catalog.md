# 05 — Catalog (business types, kategoriyalar, atributlar, catalog groups/types, admin business-type CRUD)

> Konvensiyalar (base URL, envelope, pagination, auth guard'lar, scope belgilar, umumiy error) — [`00-overview.md`](./00-overview.md). Bu fayl faqat **catalog** modulini tasvirlaydi.

---

## 1. Maqsad

Katalog — ilovaning **statik ma'lumot bazasi** (data-driven, enum emas): biznes turlari (`business types`), ularning kategoriyalari (`categories`), har kategoriya uchun **dinamik forma maydonlari** (`attribute fields`), va student-feed uchun **guruhlar** (`catalog groups`). Bu ma'lumotlar `catalog-seed.json`dan **seed** qilinadi; ilova (mobil) ularni faqat **o'qiydi** (public). Yozuv tomoni — **admin**: to'liq katalog CRUD (guruhlar / kategoriyalar / attribute-specs / business-types) endi `/v1/admin/*` da qurilgan (✅ built, [`ADMIN-API.md`](./ADMIN-API.md) Faza 4). Bu fayl public o'qishlarni **va** `admin/business-types` endpointlarini batafsil yozadi; qolgan admin catalog CRUD — ADMIN-API.md'da.

Uch controller, uch xil qamrov:

- **`business/types`** (`CatalogController`) — 🌐 public read: biznes turlari va kategoriyalar (gender bo'yicha personalizatsiya).
- **`catalog`** (`CatalogGroupsController`) — 🌐 public, **POST-only** (Q2 — id hech qachon URL'da ketmaydi): student-feed uchun guruhlar/turlar + ko'rinadigan e'lonlar soni.
- **`admin/business-types`** (`AdminBusinessTypeController`) — 🔑 admin (`AdminJwtGuard` + `@Roles(ADMIN)`, admin Bearer JWT): business-type create/update/delete.

---

## 2. Endpointlar

| METHOD + path | Scope | Maqsad |
|---|---|---|
| `GET /v1/business/types` | 🌐 | Biznes turlari ro'yxati (gender bo'yicha filtrlanadi) |
| `GET /v1/business/types/:type/categories` | 🌐 | Bir tur uchun kategoriyalar + forma maydonlari |
| `POST /v1/catalog/groups` | 🌐 | 8 ta home-ekran guruhi + turlar/e'lonlar soni |
| `POST /v1/catalog/types` | 🌐 | Berilgan guruhlar ichidagi turlar + sonlar |
| `POST /v1/admin/business-types` | 🔑 | Biznes turi yaratish |
| `PUT /v1/admin/business-types/:type` | 🔑 | Biznes turini yangilash (partial) |
| `DELETE /v1/admin/business-types/:type` | 🔑 | Biznes turini o'chirish (faqat ishlatilmayotgan bo'lsa) |

> `POST /v1/catalog/filter-schema` **shu modulda emas** — u discounts-feedga tegishli, [`07-discounts-feed.md`](./07-discounts-feed.md)da hujjatlangan.

---

## 3. Har endpoint

### 3.1 🌐 `GET /v1/business/types` → `200`

Barcha biznes turlarini qaytaradi. `gender` berilsa **personalizatsiya**: tur faqat o'z `availableForGenders`ida shu gender bo'lsa ko'rinadi.

**Query (`GenderQueryDto`):**

| Field | Type | Majburiy | Izoh |
|---|---|---|---|
| `gender` | `MALE` \| `FEMALE` | yo'q | Berilmasa — **hamma** tur. `MALE` → `BEAUTY_SALON` chiqmaydi; `FEMALE` → `BARBERSHOP` chiqmaydi. |

**Response — `BusinessTypeInfoDto[]`:**

| Field | Type | Izoh |
|---|---|---|
| `type` | string | Tur kaliti (PK), masalan `NATIONAL_FOOD` |
| `nameUz` | string | |
| `nameRu` | string \| null | |
| `iconUrl` | string \| null | |
| `defaultPriceUnit` | `PriceUnit` | |
| `emoji` | string \| null | masalan `🎮` |
| `accentColor` | string \| null | HEX, masalan `#7C5CFF` |
| `priceUnits` | `PriceUnit[]` | Bu tur uchun yaroqli birliklar (birinchisi default) |

> Diqqat: bu DTO **`groupKey`, `availableForGenders`, `allCategoryLabel`, `optionGroupHint` maydonlarini qaytarmaydi** (ular entity'da bor, lekin wire'ga proyeksiya qilinmagan). Ularga muhtoj bo'lsangiz — `POST /catalog/types` (`CatalogTypeDto`) qaytaradi.

**BaseResponse (namuna):**

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK", "error": null,
  "result": [
    {
      "type": "NATIONAL_FOOD", "nameUz": "Milliy taomlar", "nameRu": "Национальная кухня",
      "iconUrl": null, "defaultPriceUnit": "PER_ITEM", "emoji": "🍛", "accentColor": "#EA580C",
      "priceUnits": ["PER_ITEM", "PER_PERSON"]
    },
    {
      "type": "BARBERSHOP", "nameUz": "Sartaroshxona", "nameRu": null,
      "iconUrl": null, "defaultPriceUnit": "PER_SESSION", "emoji": "💈", "accentColor": "#0EA5E9",
      "priceUnits": ["PER_SESSION"]
    }
  ]
}
```

---

### 3.2 🌐 `GET /v1/business/types/:type/categories` → `200`

Bir biznes turining kategoriyalarini, har biriga **forma maydonlari** (`fields`) bilan qaytaradi.

**Path:** `type` — biznes turi kaliti (masalan `NATIONAL_FOOD`).

**Query (`GenderQueryDto`):** `gender?` (`MALE` | `FEMALE`).

**Logika (kategoriya filtri):**

- Har doim **baza ro'yxati** qaytadi (`gender = null` bo'lgan kategoriyalar).
- `gender` berilsa — **qo'shimcha** mos gender-kategoriyalar ham qo'shiladi (amalda faqat `CLOTHING`: erkak/ayol uchun alohida kategoriyalar).
- `gender` **berilmasa** — faqat baza; gender-spetsifik kategoriyalar chiqmaydi.
- Boshqa turlar uchun `gender` **e'tiborsiz** (baza ro'yxati o'zgarmaydi).

**Response — `CategoryDto[]`:**

| Field | Type | Izoh |
|---|---|---|
| `key` | string | Kategoriya kaliti, masalan `PIZZA` |
| `businessType` | string | Egasi tur kaliti |
| `nameUz` | string | |
| `nameRu` | string \| null | |
| `iconUrl` | string \| null | |
| `sortOrder` | number | UI tartibi |
| `fields` | `AttributeFieldDto[]` | Bu kategoriya tanlanganda ko'rsatiladigan forma maydonlari (tartib muhim) |
| `requiresCustomName` | boolean \| null | `OTHER` uchun `true` — u holda `customCategoryName` majburiy bo'ladi |

**`AttributeFieldDto`:**

| Field | Type | Izoh |
|---|---|---|
| `key` | string | `Listing.attributes` kaliti, masalan `model` |
| `label` | string | |
| `type` | `AttributeFieldType` | maydon UI turi (pastdagi enum) |
| `required` | boolean | To'ldirilmasa e'lon publish bo'lmaydi |
| `hint` | string \| null | `TEXT`/`NUMBER` uchun placeholder |
| `suffix` | string \| null | `NUMBER` uchun birlik (masalan `daqiqa`) |
| `multiple` | boolean \| null | `MULTI_SELECT` uchun `true`; qiymat vergul bilan saqlanadi (`"S,M,L"`) |
| `options` | `AttributeOptionDto[]` \| null | Faqat `SELECT`/`MULTI_SELECT` uchun |

**`AttributeOptionDto`:** `{ value: string, label: string }`.

**BaseResponse (namuna):**

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK", "error": null,
  "result": [
    {
      "key": "PIZZA", "businessType": "NATIONAL_FOOD", "nameUz": "Pitsa", "nameRu": null,
      "iconUrl": null, "sortOrder": 0, "requiresCustomName": null,
      "fields": [
        {
          "key": "size", "label": "O'lcham", "type": "SELECT", "required": true,
          "hint": null, "suffix": null, "multiple": null,
          "options": [
            { "value": "SMALL", "label": "Kichik" },
            { "value": "LARGE", "label": "Katta" }
          ]
        },
        {
          "key": "bakeMinutes", "label": "Tayyorlash vaqti", "type": "NUMBER", "required": false,
          "hint": "15", "suffix": "daqiqa", "multiple": null, "options": null
        }
      ]
    }
  ]
}
```

**Xato:** noma'lum `type` → **404**. ⚠️ Bu yerda `error.code` **`NOT_FOUND`** (generic), admin CRUD esa `BUSINESS_TYPE_NOT_FOUND` ishlatadi — pastdagi "Xatolar"ga qarang.

---

### 3.3 🌐 `POST /v1/catalog/groups` → `200`

8 ta home-ekran guruhini, har birining **turlar soni** va **ko'rinadigan e'lonlar soni** bilan qaytaradi. POST-only (Q2). Bo'sh body ham yaroqli.

**Body (`CatalogGroupsRequestDto`):**

| Field | Type | Majburiy | Izoh |
|---|---|---|---|
| `geo` | `GeoScopeDto` | yo'q | `listingsCount`ni radius ichidagi filialli e'lonlarga cheklaydi |

**`GeoScopeDto`:** `lat` (required, 37..46), `lng` (required, 55..74), `radiusMeters?` (default `5000`, 100..50000).

**Response — `CatalogGroupDto[]`:**

| Field | Type | Izoh |
|---|---|---|
| `key` | string | masalan `FOOD` |
| `nameUz` / `nameRu` | string / string\|null | |
| `emoji` | string \| null | masalan `🍽` |
| `icon` | string \| null | masalan `cafe` |
| `accentColor` | string \| null | HEX |
| `sortOrder` | number | |
| `types` | string[] | Guruh ichidagi tur kalitlari |
| `typesCount` | number | `types.length` |
| `listingsCount` | number | Ko'rinadigan e'lonlar (ACTIVE + APPROVED + amal muddatida), `geo` berilsa shunga cheklangan |

**Logika (sonlar):**

- `listingsCount` **doim barcha ko'rinadigan e'lonlar** ustidan hisoblanadi; gender **hech qachon** sonlarga ta'sir qilmaydi (D16).
- **Bo'sh guruhlar** ham qaytadi (`listingsCount: 0`) — klient ularni yashirmasdan xira ko'rsatadi.
- Guruh jami = uning turlari jamlarining yig'indisi (invariant).

---

### 3.4 🌐 `POST /v1/catalog/types` → `200`

Berilgan guruhlar ichidagi biznes turlarini, har biriga **kategoriyalar soni** va **ko'rinadigan e'lonlar soni** bilan qaytaradi.

**Body (`CatalogTypesRequestDto`):**

| Field | Type | Majburiy | Izoh |
|---|---|---|---|
| `groupKeys` | string[] | **ha** | **1–3** ta guruh kaliti (D1 — limit guruhda, turda emas; SPORT bitta o'zi 10 turdan iborat) |
| `gender` | `MALE` \| `FEMALE` | yo'q | Faqat **ro'yxatni** toraytiradi, **sonlarni** hech qachon emas (D16) |
| `geo` | `GeoScopeDto` | yo'q | `listingsCount`ni radiusga cheklaydi |

**Response — `CatalogTypeDto[]`:**

| Field | Type | Izoh |
|---|---|---|
| `key` | string | Tur kaliti |
| `groupKey` | string | |
| `nameUz` | string | |
| `emoji` / `accentColor` | string\|null / string\|null | |
| `defaultPriceUnit` | `PriceUnit` | |
| `priceUnits` | `PriceUnit[]` | |
| `availableForGenders` | `Gender[]` | |
| `allCategoryLabel` | string \| null | Tur bo'ylab "hammasi" kategoriyasi yorlig'i (masalan `Butun menyu`) |
| `optionGroupHint` | string \| null | masalan `Porsiya, tarkib` |
| `categoriesCount` | number | Baza kategoriyalar (gender-spetsifik ro'yxatlar chiqarilgan) |
| `listingsCount` | number | Ko'rinadigan e'lonlar, `geo` berilsa cheklangan |

**Logika:** `gender` ro'yxatni toraytiradi (`MALE` → `BEAUTY_SALON` yashiriladi, `FEMALE` → `BARBERSHOP`), lekin har bir sonni tegmasdan qoldiradi.

> `CatalogTypeDto` `GET /business/types`dagi `BusinessTypeInfoDto`dan **boyroq** — u `groupKey`, `availableForGenders`, `allCategoryLabel`, `optionGroupHint` ni ham beradi (lekin `iconUrl`, `nameRu` ni bermaydi). Bu ikki DTO ataylab bir xil emas.

---

### 3.5 🔑 `POST /v1/admin/business-types` → `201`

Yangi biznes turi yaratadi. Auth: admin Bearer JWT (`AdminJwtGuard` + `@Roles(ADMIN)`).

**Body (`CreateBusinessTypeDto`):**

| Field | Type | Majburiy | Cheklov |
|---|---|---|---|
| `type` | string | **ha** | 1–64, **PK/kalit** |
| `groupKey` | string | **ha** | 1–64; `catalog_groups`da mavjud bo'lishi shart |
| `nameUz` | string | **ha** | 1–120 |
| `nameRu` | string | yo'q | |
| `emoji` | string | yo'q | |
| `accentColor` | string | yo'q | HEX (`@IsHexColor`) |
| `iconUrl` | string | yo'q | |
| `defaultPriceUnit` | `PriceUnit` | **ha** | |
| `priceUnits` | `PriceUnit[]` | yo'q | default `[]` |
| `availableForGenders` | `Gender[]` | yo'q | default `[]` (bo'sh = hammaga); `GET /business/types?gender=` ni boshqaradi |

**Response — `BusinessTypeInfoDto`** (3.1 bilan bir xil shakl).

**Logika:** `type` kaliti bo'sh bo'lishi kerak (aks holda **409** `BUSINESS_TYPE_EXISTS`). `groupKey` mavjud bo'lishi tekshiriladi — yo'q bo'lsa xom Prisma FK xatosi (500) o'rniga **422** `fields.groupKey` qaytadi.

---

### 3.6 🔑 `PUT /v1/admin/business-types/:type` → `200`

Mavjud turni **partial** yangilaydi. `type` (path) — PK, o'zgartirib bo'lmaydi.

**Body (`UpdateBusinessTypeDto`):** `CreateBusinessTypeDto`ning barcha maydonlari **ixtiyoriy** (`type`dan tashqari). Faqat **berilgan** kalitlar yoziladi; berilmagani o'zgarmaydi.

**Response — `BusinessTypeInfoDto`.**

**Logika:** tur mavjud bo'lmasa **404** `BUSINESS_TYPE_NOT_FOUND`. `groupKey` berilsa — mavjudligi tekshiriladi (yo'q bo'lsa **422** `fields.groupKey`).

---

### 3.7 🔑 `DELETE /v1/admin/business-types/:type` → `200`

Turni o'chiradi — **faqat** hech bir biznes va hech bir kategoriya unga bog'lanmagan bo'lsa. `result` — `null`.

**Logika:** tur yo'q → **404** `BUSINESS_TYPE_NOT_FOUND`. Biror biznes yoki kategoriya hali ham shu turga havola qilsa → **409** `BUSINESS_TYPE_IN_USE`.

---

## 4. Enumlar

**`PriceUnit`:** `PER_ITEM`, `PER_HOUR`, `PER_KG`, `PER_MONTH`, `PER_COURSE`, `PER_LESSON`, `PER_TICKET`, `PER_PERSON`, `PER_SESSION`.

**`AttributeFieldType`:** `TEXT`, `NUMBER`, `BOOLEAN`, `SELECT`, `MULTI_SELECT`, `TAGS`.

**`Gender`:** `MALE`, `FEMALE`.

---

## 5. Xatolar

| HTTP | `error.code` | Qachon | `message` (uz) |
|---|---|---|---|
| 404 | `NOT_FOUND` | `GET /business/types/:type/categories` — noma'lum tur | `Biznes turi topilmadi` |
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Admin endpoint'da JWT yo'q/yaroqsiz/muddati o'tgan | (`AdminJwtGuard`) |
| 403 | `FORBIDDEN` | Admin JWT bor, lekin rol `ADMIN` emas (masalan `MODERATOR`) | (`@Roles(ADMIN)`) |
| 409 | `BUSINESS_TYPE_EXISTS` | `POST /admin/business-types` — kalit band | `Bu biznes turi allaqachon mavjud` |
| 404 | `BUSINESS_TYPE_NOT_FOUND` | `PUT`/`DELETE /admin/business-types/:type` — tur yo'q | `Biznes turi topilmadi` |
| 409 | `BUSINESS_TYPE_IN_USE` | `DELETE` — biznes yoki kategoriya havola qilmoqda | `Bu biznes turi ishlatilmoqda, uni o'chirib bo'lmaydi` |
| 422 | `VALIDATION_ERROR` | Create/Update — `groupKey` `catalog_groups`da yo'q | `fields.groupKey: "Bunday katalog guruhi yo'q"` |
| 422 | `VALIDATION_ERROR` | DTO validatsiyasi (majburiy maydon, enum, HEX, uzunlik, `groupKeys` 1–3) | `fields.<field>` |

> ⚠️ **Haqiqiy nomuvofiqlik:** public `GET /business/types/:type/categories` noma'lum tur uchun **generic `NOT_FOUND`** tashlaydi, admin `PUT`/`DELETE` esa xuddi shu holatda **`BUSINESS_TYPE_NOT_FOUND`** ishlatadi (`message` ikkalasida ham `Biznes turi topilmadi`). Public `GET /business/types` noma'lum `gender` uchun umuman xato bermaydi — shunchaki filtrlaydi (bo'sh ro'yxat ehtimoli). Admin panel bu ikki kodni bir joyga tenglashtirmasin.

---

## 6. Admin panel eslatmasi

Katalog — asosan **seed'dan boshqariladigan** ma'lumot, lekin panel uchun to'liq admin CRUD endi **qurilgan** (real admin auth/role bilan).

**✅ built — barchasi `AdminJwtGuard` + `@Roles(ADMIN)` ostida (qarang [`ADMIN-API.md`](./ADMIN-API.md) Faza 4):**

- **Business-type CRUD** — `POST · PUT · DELETE /v1/admin/business-types` (bu faylda batafsil). Guard endi placeholder `X-Admin-Key` **emas**, balki admin JWT.
- **Kategoriya CRUD** — `POST · PUT · DELETE /v1/admin/categories`.
- **Attribute-spec (forma maydonlari) CRUD** — `POST · PUT · DELETE /v1/admin/attribute-specs`.
- **Catalog-group CRUD** — `POST · PUT · DELETE /v1/admin/catalog/groups`.
- **Real admin auth** — env-based `AdminJwtGuard` (JWT + rol), eski `X-Admin-Key` (`AdminGuard`) + `ADMIN_API_KEY` **o'chirildi**.

Delete'lar referential-integrity bilan (ishlatilayotgan bo'lsa 409). Field shakllari va error kodlari — [`ADMIN-API.md`](./ADMIN-API.md) va Swagger (`/docs`).
