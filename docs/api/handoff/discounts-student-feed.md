# Discounts (student feed) — mobil handoff

> Swagger tag: **`Discounts (student feed)`** · Ilova: **Student (StudentClub)**
> Holat: **✅ oltala endpoint ham ishlaydi**, e2e testlar bilan qoplangan.

Bu section — talaba ilovasining **yuragi**: feed, xarita, qidiruv, e'lon sahifasi, sevimlilar
va chegirmani olish uchun kod. Katalog qatlami (guruh/tur/filtr sxemasi) — alohida
[`catalog-student-feed.md`](./catalog-student-feed.md).

| # | Endpoint | Nima uchun | Auth |
|---|---|---|---|
| 1 | `POST /v1/discounts/search` | **Feed + xarita + sanoq** — bitta endpoint | 🟡 ixtiyoriy |
| 2 | `POST /v1/discounts/detail` | E'lon sahifasi | 🟡 ixtiyoriy |
| 3 | `POST /v1/discounts/suggest` | Qidiruv avtoto'ldirishi | 🟡 ixtiyoriy |
| 4 | `POST /v1/discounts/favorites/toggle` | Saqlash / saqlashni bekor qilish | 🔴 student majburiy |
| 5 | `POST /v1/discounts/favorites/search` | Saqlanganlar ro'yxati | 🔴 student majburiy |
| 6 | `POST /v1/listings/{listingId}/redeem/start` | Chegirma kodi (QR) olish | 🔴 student majburiy |

---

## 1. Umumiy qoidalar

| Qoida | Qiymat |
|---|---|
| Base URL | `{HOST}/v1` |
| Method | **`POST`**. Id'lar tanada (Q2) — `redeem/start` bundan mustasno, u yerda `listingId` yo'lda |
| Header | `Content-Type: application/json` · `Authorization: Bearer <accessToken>` (kerak bo'lganda) |
| Til | `uz` — xato `message` lari o'zbekcha |
| Sana | **ISO-8601** (`"2026-08-01T18:59:59.000Z"`) — hech qachon epoch-ms emas |
| Pul | Butun **so'm**, kasrsiz. `currency: "UZS"` |
| Vaqt zonasi | Ish vaqtlari **Toshkent (UTC+5)** bo'yicha hisoblanadi |

### Auth uch xil ishlaydi — diqqat

| Belgi | Ma'nosi | Xulq |
|---|---|---|
| 🟡 **ixtiyoriy** | `search`, `detail`, `suggest` | Tokensiz ham ishlaydi. **Lekin token yuborilib, u yaroqsiz/muddati o'tgan bo'lsa — `401`**, jimgina anonimga tushirilmaydi |
| 🔴 **student majburiy** | `favorites/*`, `redeem/start` | Tokensiz → `401`. **Biznes egasi tokeni bilan → `403`** |

**Biznes egasi tokeni bilan `search`/`detail` ga kirilsa — anonim kabi ishlanadi**
(`isFavorite` doim `false`, `promoCode` doim `null`).

### Anonim vs student — nima farq qiladi

| Maydon | Anonim | Student |
|---|---|---|
| `isFavorite` (card, marker) | doim `false` | haqiqiy holat |
| `redemption.promoCode` (detail) | `null` | haqiqiy kod |
| `redemption.remainingForUser` | `null` | qolgan limit |
| Ko'rishlar hisobi (`viewsCount`) | **sanalmaydi** | sanaladi (1 student × 1 soat) |
| `filter.flags.favoritesOnly` | `401` | ishlaydi |

### «Ko'rinadigan e'lon» (Q4) — hamma javoblar shunga tayanadi

```
listing.status = ACTIVE
AND business.status = APPROVED
AND validFrom <= hozir <= validTo
```

Ko'rinmaydigan e'lon feed'da chiqmaydi, `detail` da esa **`404`** beradi — **sababini
aytmaydi** (o'chirilgan / muddati o'tgan / biznes tasdiqlanmagan — hammasi bir xil javob).

---

## 2. `POST /v1/discounts/search` — feed'ning yagona o'qishi

Filtr + matnli qidiruv + saralash + sahifalash + xarita — **hammasi bitta endpoint** (Q1).

### 2.1. So'rovning umumiy skeleti

```jsonc
{
  "mode": "LIST",          // majburiy: LIST | COUNT | MAP
  "filter": { ... },       // majburiy (ichidagilarning hammasi ixtiyoriy)
  "sort":   { "by": "DISTANCE", "direction": "ASC" },   // ixtiyoriy
  "page":   { "number": 0, "size": 20 },                // ixtiyoriy
  "map":    { "zoom": 13, "clusterize": true, "maxMarkers": 500 }  // faqat MAP
}
```

| Maydon | Majburiy | Default |
|---|---|---|
| `mode` | ✅ | — |
| `filter` | ✅ (obyekt sifatida) | — |
| `sort` | ❌ | `{ by: "RELEVANCE" }` |
| `page` | ❌ | `{ number: 0, size: 20 }` |
| `map` | ❌ | `{ zoom: 13, clusterize: false, maxMarkers: 500 }` |

### ⚠️ Q3 — «hammasi» degan javob yo'q

**`filter.groupKeys` yoki `filter.types` dan kamida bittasi majburiy.** Ikkalasi ham
bo'lmasa → **`422 TYPE_REQUIRED`**. Yagona istisno — `favorites/search`.

### 2.2. `filter` — asosiy maydonlar

| Maydon | Tur | Default | Chegara / izoh |
|---|---|---|---|
| `groupKeys` | string[] | `[]` | ≤ **3** (`TOO_MANY_GROUPS`). Turlariga yoyiladi |
| `types` | string[] | `[]` | ≤ **10** (`TOO_MANY_TYPES`). Guruh berilgan bo'lsa — uning ichidan |
| `categoryKeys` | string[] | `[]` | ≤ **30**. Tanlangan turlarga tegishli bo'lishi shart |
| `includeAllCategory` | bool | **`true`** | `categoryKey = "ALL"` e'lonlari kategoriya so'roviga javob beradimi |
| `includeCustomCategories` | bool | **`true`** | `categoryKey = "OTHER"` + erkin matnli nom |
| `businessIds` | string[] | `[]` | ≤ 200 |
| `branchIds` | string[] | `[]` | ≤ 200 |
| `listingIds` | string[] | `[]` | ≤ 200 |
| `excludeListingIds` | string[] | `[]` | ≤ 200 — «shunga o'xshash» ro'yxatida joriy e'lonni chiqarib tashlash uchun |
| `query` | string | — | ≤ **100** belgi. Matnli qidiruv (§2.9) |
| `listingKind` | `ALL`\|`DISCOUNT`\|`REGULAR` | **`ALL`** | Chegirmali / oddiy e'lon |
| `attributes` | object[] | `[]` | ≤ **20** shart (§2.8) |
| `attributesMatch` | `ALL`\|`ANY` | **`ALL`** | Shartlar «va» bilanmi yoki «yoki» bilanmi |

### 2.3. `filter.geo`

```jsonc
"geo": {
  "lat": 41.3111, "lng": 69.2797, "radiusMeters": 5000,
  "bbox": { "minLat": 41.28, "minLng": 69.20, "maxLat": 41.35, "maxLng": 69.31 },
  "regionIds": ["TOSHKENT_SHAHRI"],
  "districtIds": ["CHILONZOR"],
  "onlineOnly": false
}
```

| Maydon | Tur | Default | Izoh |
|---|---|---|---|
| `lat` / `lng` | number | — | **Juftlikda keladi** — bittasi yuborilsa `422` |
| `radiusMeters` | int | **`5000`** | `100 … 50000` |
| `bbox` | object | — | Xarita ko'rinish maydoni. **Uchala rejimda ham** toraytiradi |
| `regionIds` | string[] | `[]` | ≤ 200. `id` — nom emas |
| `districtIds` | string[] | `[]` | ≤ 200 |
| `onlineOnly` | bool | `false` | Faqat onlayn bizneslar |

- `lat`/`lng` **berilmasa** `distanceMeters` hamma joyda `null` bo'ladi va
  `sort.by = "DISTANCE"` → **`422 GEO_REQUIRED_FOR_SORT`**.
- `bbox` teskari bo'lsa (`minLat > maxLat`) yoki O'zbekiston hududidan tashqarida bo'lsa →
  **`422 INVALID_BBOX`**.

### 2.4. `filter.price` · `filter.discount` · `filter.redemption`

```jsonc
"price":     { "min": 0, "max": 150000, "basis": "FINAL", "units": ["PER_ITEM"] },
"discount":  { "types": ["PERCENT"], "minPercent": 20, "maxPercent": 90, "minSavedAmount": 10000 },
"redemption":{ "methods": ["QR", "PROMO_CODE"], "hasPromoCode": true, "onlyAvailable": true }
```

| Blok | Maydon | Tur | Default | Izoh |
|---|---|---|---|---|
| `price` | `min` / `max` | int ≥ 0 | — | Butun so'm. `min > max` → `422 INVALID_PRICE_RANGE` |
| | `basis` | `FINAL`\|`ORIGINAL` | **`FINAL`** | Qaysi narx bilan solishtiriladi |
| | `units` | string[] | `[]` | `PriceUnit` enum, ≤ 20 |
| `discount` | `types` | string[] | `[]` | `DiscountType` enum, ≤ 10 |
| | `minPercent` / `maxPercent` | int | — | `0 … 100` |
| | `minSavedAmount` | int ≥ 0 | — | Kamida shuncha so'm tejaladi |
| `redemption` | `methods` | string[] | `[]` | `RedemptionMethod` enum, ≤ 10 |
| | `hasPromoCode` | bool | — | |
| | `onlyAvailable` | bool | `false` | Faqat limiti tugamaganlar |

> **`discount.*` shartlari oddiy (`REGULAR`) e'lonlarni hech qachon topmaydi** — ular
> chegirma emas. `discount` filtri qo'yilsa natijada faqat chegirmali e'lonlar qoladi.

### 2.5. `filter.flags`

| Maydon | Tur | Default | Izoh |
|---|---|---|---|
| `withImagesOnly` | bool | `false` | Rasmi borlar |
| `favoritesOnly` | bool | `false` | **Student tokeni shart** — anonim yuborsa `401` |
| `hasDeliveryOnly` | bool | `false` | Faqat `attributes.hasDelivery` ni o'qiydi (D12) |
| `newOnly` | bool | `false` | Oxirgi **7 kun** ichida yaratilganlar |

### 2.6. `filter.availability` — ish vaqti va amal muddati

```jsonc
"availability": {
  "openNow": true,
  "onDay": "SAT", "atTime": "19:30",
  "validAt": "2026-07-25T15:00:00Z",
  "endingWithinHours": 24
}
```

| Maydon | Tur | Izoh |
|---|---|---|
| `openNow` | bool | Hozir ochiq filial bor (Toshkent vaqti) |
| `onDay` | `SUN`…`SAT` | **`atTime` bilan birga** keladi, aks holda `422` |
| `atTime` | `HH:mm` | 24 soatlik format |
| `validAt` | ISO-8601 | E'lon shu paytda amalda bo'lsin. Default — hozir |
| `endingWithinHours` | int | `1 … 8760`. «Bugun tugaydi» filtri |

- `onDay` va `atTime` — **juftlik**. Yolg'iz yuborilsa `422`, xabar:
  `"onDay va atTime birga yuboriladi; ..."`.
- `openNow` va `onDay`/`atTime` — **ikki xil savol**, ikkalasi ham yuborilsa **ikkalasi ham**
  qo'llanadi.
- Kechasi ishlaydigan joylar (20:00–04:00) soat 02:00 da ham **ochiq** hisoblanadi.

### 2.7. Hafta kunlari

```
SUN | MON | TUE | WED | THU | FRI | SAT
```

### 2.8. `filter.attributes` — dinamik atribut shartlari

Har bir shart:

```jsonc
{ "key": "portionGrams", "op": "BETWEEN", "min": 300, "max": 600 }
{ "key": "spicyLevel",   "op": "IN",      "values": ["O'rtacha", "O'tkir"] }
{ "key": "isHalal",      "op": "EQ",      "boolean": true }
{ "key": "ingredients",  "op": "ANY",     "values": ["Mozzarella"] }
{ "key": "model",        "op": "CONTAINS","text": "zara" }
{ "key": "hasWifi",      "op": "EXISTS" }
```

**Operator → qaysi operandni o'qiydi:**

| `op` | Operand | Maydon |
|---|---|---|
| `EQ`, `NEQ` | qiymat | `text` **yoki** `number` **yoki** `boolean` |
| `IN`, `NOT_IN`, `ANY`, `ALL` | ro'yxat | `values` (≤ 50) |
| `BETWEEN` | oraliq | `min` va/yoki `max` |
| `GTE`, `LTE` | son | `number` |
| `CONTAINS` | matn | `text` (≤ 100) |
| `EXISTS` | — | hech nima |

**Qaysi `kind` qaysi operatorni qabul qiladi** (`filter-schema` javobidagi `operators` bilan bir xil):

| `kind` | Ruxsat etilgan `op` |
|---|---|
| `TEXT` | `EQ`, `NEQ`, `CONTAINS`, `EXISTS` |
| `NUMBER` | `EQ`, `NEQ`, `BETWEEN`, `GTE`, `LTE`, `EXISTS` |
| `BOOLEAN` | `EQ`, `EXISTS` |
| `SELECT` | `EQ`, `NEQ`, `IN`, `NOT_IN`, `EXISTS` |
| `MULTI_SELECT` | `ANY`, `ALL`, `EXISTS` |
| `TAGS` | `ANY`, `ALL`, `EXISTS` |

- Katalogda yo'q kalit → **`422 UNKNOWN_ATTRIBUTE`**
- Kind qabul qilmaydigan operator → **`422 ATTRIBUTE_OP_MISMATCH`**
- Operand yuborilmagan (masalan `IN` bor, `values` yo'q) → **`422 VALIDATION_ERROR`**
- **`_` bilan boshlanuvchi kalitlar** (`_regular`, `_gender`, `_phone`) — texnik, katalogda
  yo'q, tekshiruvdan o'tmaydi. **Klient ularni filtr sifatida ko'rsatmaydi.**

> Operatorlarni **hardcode qilmang** — `POST /v1/catalog/filter-schema` javobidagi
> `attributes[].operators` dan oling.

### 2.9. `filter.query` — matnli qidiruv

Qidiriladigan joylar (og'irlik kamayish tartibida):
`listing.title` → `business.name` → kategoriya nomi va `customCategoryName` →
`listing.description` → `TEXT`/`TAGS` atribut qiymatlari → option guruh/variant nomlari.

- **So'z boshidan moslik** (`osh:*`) — `"osh"` → `"Toshkent"` yoki `"boshqa"` ga **tushmaydi**.
- O'zbek tili normallashtiriladi: `o'` / `oʻ` / `o` / `ў`, `g'` / `gʻ` / `ғ`, lotin ↔ kirill,
  registr va ortiqcha probel — hammasi bir xil natija beradi.
- **Sinonimlar:** `"osh"` yozilsa `PALOV` kategoriyasidagi **barcha** e'lon topiladi, hatto
  sarlavhasida «osh» bo'lmasa ham. Bunday e'lon `matchedVia: "SYNONYM"` oladi.
- Qidiruv ham `types`/`groupKeys` doirasida qoladi — turdan qochib ketmaydi.

### 2.10. `sort`

```jsonc
"sort": { "by": "DISTANCE", "direction": "ASC" }
```

| `by` | Odatiy `direction` | Izoh |
|---|---|---|
| `RELEVANCE` | `DESC` | **Default.** `query` bo'lmasa — `NEWEST` kabi ishlaydi |
| `DISTANCE` | **`ASC`** | `geo.lat`/`lng` **shart**, aks holda `422 GEO_REQUIRED_FOR_SORT` |
| `PRICE_FINAL` | **`ASC`** | |
| `PRICE_ORIGINAL` | **`ASC`** | |
| `ENDING_SOON` | **`ASC`** | ⚠️ Spec'da `DESC` deyilgan, amalda `ASC` — «tez tugaydigani» tepada |
| `DISCOUNT_PERCENT` | `DESC` | |
| `SAVED_AMOUNT` | `DESC` | |
| `NEWEST` | `DESC` | |
| `POPULAR` | `DESC` | |

`direction` ni aniq yuborsangiz, default bekor bo'ladi.

### 2.11. `page` va `map`

| Blok | Maydon | Default | Chegara |
|---|---|---|---|
| `page` | `number` | `0` | **Noldan** boshlanadi |
| | `size` | `20` | ≤ **50**, aks holda `422 PAGE_SIZE_EXCEEDED` |
| `map` | `zoom` | `13` | `0 … 22` |
| | `clusterize` | `false` | Belgilar `maxMarkers` dan oshsa guruhlanadi |
| | `maxMarkers` | `500` | ≤ **2000**, aks holda `422 PAGE_SIZE_EXCEEDED` |

`map` bloki **faqat `MAP`** rejimida o'qiladi; `LIST`/`COUNT` uni e'tiborsiz qoldiradi.

---

## 3. Javoblar — uchta rejim

### 3.1. `mode: "LIST"` — kartochkalar sahifasi

```jsonc
{
  "success": true, "status": 200, "message": "OK", "error": null,
  "result": {
    "items": [ /* DiscountCard */ ],
    "page": 0,
    "size": 20,
    "total": 137,
    "hasNext": true
  }
}
```

> Aynan shu 5 ta kalit — **`cursor` yo'q, `meta` yo'q, `facets` yo'q** (D3).
> `page` nol asosli va so'rovni takrorlaydi.

#### `DiscountCard` — bitta feed qatori

```jsonc
{
  "id": "lst_01H8X",
  "businessId": "biz_01H8X",
  "businessName": "Choyxona Navruz",
  "businessLogoUrl": null,
  "businessType": "NATIONAL_FOOD",
  "groupKey": "FOOD",
  "categoryKey": "PALOV",
  "categoryLabel": "Osh / Palov",
  "matchedVia": "CATEGORY",
  "title": "Osh (1 porsiya)",
  "imageUrl": "https://.../cover.jpg",
  "imagesCount": 4,
  "priceUnit": "PER_ITEM",
  "isDiscount": true,
  "originalPrice": 30000,
  "finalPrice": 21000,
  "savedAmount": 9000,
  "currency": "UZS",
  "discount": { "type": "PERCENT", "value": 30, "badge": "−30%", "conditions": "Talaba ID bilan" },
  "redemptionMethod": "STUDENT_ID",
  "hasPromoCode": false,
  "nearestBranch": {
    "branchId": "br_01H8X",
    "name": "Yunusobod filiali",
    "address": "Yunusobod 5-kvartal, 12-uy",
    "lat": 41.352, "lng": 69.273,
    "distanceMeters": 640,
    "isOpenNow": true,
    "closesAt": "23:00",
    "tradeCenterName": null
  },
  "branchesCount": 3,
  "validTo": "2026-08-01T18:59:59.000Z",
  "isFavorite": false,
  "isNew": true,
  "viewsCount": 412,
  "attributes": { "isHalal": "true", "portionGrams": "450" }
}
```

| Maydon | Tur | Null | Izoh |
|---|---|---|---|
| `id` | string | ❌ | E'lon id — `detail`, `favorites/toggle`, `redeem/start` ga shu ketadi |
| `businessId` / `businessName` | string | ❌ | |
| `businessLogoUrl` | string | ✅ | |
| `businessType` / `groupKey` | string | ❌ | Katalog kalitlari |
| `categoryKey` / `categoryLabel` | string | ❌ | |
| `matchedVia` | enum | ❌ | Nega topildi — `CATEGORY` · `ALL` · `SYNONYM` · `TEXT` · `TYPE` |
| `title` | string | ❌ | |
| `imageUrl` | string | ✅ | **Faqat muqova.** Qolganlari `detail` da |
| `imagesCount` | int | ❌ | |
| `priceUnit` | enum | ❌ | `PriceUnit` |
| `isDiscount` | bool | ❌ | `false` — oddiy, bir narxli e'lon |
| `originalPrice` | int | ❌ | So'm |
| `finalPrice` | int | ❌ | **Serverda hisoblangan** — klient hech qachon o'zi hisoblamaydi |
| `savedAmount` | int | ✅ | Oddiy e'londa **`null`**, `0` emas |
| `currency` | string | ❌ | Doim `"UZS"` |
| `discount` | object | ✅ | Oddiy e'londa `null` |
| `discount.badge` | string | ❌ | **Serverda chizilgan matn** — `"−30%"`, `"1+1"`, `"−15 000 so'm"`. O'zgartirmasdan chop eting |
| `discount.conditions` | string | ✅ | |
| `redemptionMethod` | enum | ❌ | `QR` · `PROMO_CODE` · `STUDENT_ID` · `ONLINE_LINK` |
| `hasPromoCode` | bool | ❌ | |
| `nearestBranch` | object | ✅ | **Faqat onlayn biznesda `null`** |
| `nearestBranch.distanceMeters` | int | ✅ | So'rovda koordinata bo'lmasa `null` |
| `nearestBranch.isOpenNow` | bool | ❌ | Toshkent vaqti bo'yicha |
| `nearestBranch.closesAt` | string | ✅ | `"23:00"` |
| `branchesCount` | int | ❌ | |
| `validTo` | ISO-8601 | ❌ | |
| `isFavorite` | bool | ❌ | Anonimda doim `false` |
| `isNew` | bool | ❌ | Oxirgi 7 kun |
| `viewsCount` | int | ❌ | |
| `attributes` | `{string: string}` | ❌ | **Barcha qiymatlar matn** — `"true"`, `"450"` |

> **`badge` va `finalPrice` — serverdan.** Klient chegirmani qayta hisoblamaydi va
> «−30%» matnini o'zi yig'maydi (§8.1).

### 3.2. `mode: "COUNT"` — «Qo'llash · N ta taklif» tugmasi uchun

Qatorlarni **umuman yuklamaydi** — faqat sanoq va facetlar.

```jsonc
{
  "result": {
    "total": 137,
    "facets": {
      "byCategory":     [{ "key": "PALOV", "label": "Osh", "count": 54 }],
      "byType":         [{ "key": "NATIONAL_FOOD", "count": 187 }],
      "byDistrict":     [{ "key": "CHILONZOR", "count": 88 }],
      "byDiscountType": [{ "key": "PERCENT", "count": 88 }],
      "byListingKind":  [{ "key": "DISCOUNT", "count": 88 }, { "key": "REGULAR", "count": 49 }],
      "byAttribute": {
        "spicyLevel": [{ "value": "O'rtacha", "count": 61 }],
        "isHalal":    [{ "value": "true", "count": 120 }]
      },
      "priceRange":    { "min": 8000, "max": 240000 },
      "discountRange": { "minPercent": 5, "maxPercent": 70 }
    }
  }
}
```

**Ikki muhim nuqta:**

1. **`total` — LIST bilan aynan bir xil.** Bir xil tana bilan `LIST` yuborsangiz shu sonni
   olasiz. Tugmadagi raqam shu.
2. **`facets` to'liq filtr bo'yicha toraymaydi.** Ular faqat *tur / kategoriya / joylashuv*
   bo'yicha sanaladi. Narx, atribut yoki matn filtri qo'yilganda **facet bakiti `total` dan
   katta bo'lishi mumkin** — bu xato emas. Facetlar filtr ekranini **belgilash** uchun,
   qo'shish uchun emas.

> ⚠️ `byListingKind` bu yerda **faqat `DISCOUNT` va `REGULAR`** (`ALL` yo'q).
> `catalog/filter-schema` dagi `listingKind` esa uchtali — ikkovini aralashtirmang.
> `byDistrict[].key` — **district `id`**, nom emas.

### 3.3. `mode: "MAP"` — xarita

**`filter.geo.bbox` yoki `filter.geo.lat`+`lng` majburiy**, aks holda `422 GEO_REQUIRED`.
Sahifalash yo'q — ko'rinish maydonining o'zi sahifa.

```jsonc
{
  "result": {
    "markers": [
      {
        "listingId": "lst_01H8X", "branchId": "br_01H8X",
        "lat": 41.352, "lng": 69.273,
        "priceLabel": "21k", "finalPrice": 21000,
        "discountBadge": "−30%",
        "businessType": "PLAYSTATION", "accentColor": "#7C5CFF",
        "isDiscount": true, "isFavorite": false
      }
    ],
    "clusters": [
      { "lat": 41.31, "lng": 69.24, "count": 42,
        "bbox": { "minLat": 41.28, "minLng": 69.20, "maxLat": 41.35, "maxLng": 69.31 },
        "minPrice": 15000, "maxDiscountPercent": 45 }
    ],
    "bounds": { "minLat": 41.28, "minLng": 69.20, "maxLat": 41.35, "maxLng": 69.31 },
    "total": 137,
    "markersTotal": 214,
    "truncated": false
  }
}
```

| Maydon | Izoh |
|---|---|
| `markers[]` | **Bitta (e'lon × filial)** = bitta belgi. Uch filialli e'lon → **bir xil `listingId` li uchta marker**. Istalganiga bosilsa bir xil e'lon ochiladi |
| `markers[].priceLabel` | Serverda chizilgan qisqa yozuv: `"21k"`, `"1.2 mln"` |
| `markers[].discountBadge` | Oddiy e'londa `null` |
| `clusters[]` | `clusterize: true` va belgilar `maxMarkers` dan ko'p bo'lgandagina to'ladi |
| `bounds` | Qaytgan narsaning umumiy chegarasi. Bo'sh bo'lsa `null` |
| **`total`** | **E'lonlar** soni — `LIST`/`COUNT` bilan **aynan bir xil** |
| **`markersTotal`** | **Belgilar** soni — `total` dan **katta bo'lishi normal** (D15) |
| `truncated` | `true` — biror belgi tashlab yuborilgan yoki klasterga yig'ilgan |

> `total` va `markersTotal` — ikki xil savol. Foydalanuvchiga «N ta taklif» deb
> **`total`** ni ko'rsating.

---

## 4. `POST /v1/discounts/detail` — e'lon sahifasi

🟡 Auth ixtiyoriy.

### So'rov

```jsonc
{
  "listingId": "lst_01H8X",
  "geo": { "lat": 41.3111, "lng": 69.2797, "radiusMeters": 5000 }
}
```

| Maydon | Majburiy | Izoh |
|---|---|---|
| `listingId` | ✅ | |
| `geo` | ❌ | Faqat `distanceMeters` ni to'ldiradi va `branches` ni yaqindan uzoqqa saralaydi. **Hech qachon e'lonni yashirmaydi** |

### Javob

`result` = **`DiscountCard` ning hamma maydonlari** (§3.1) **+** quyidagilar:

| Qo'shimcha maydon | Tur | Izoh |
|---|---|---|
| `description` | string \| null | |
| `images` | string[] | **Barcha** rasmlar (kartochkada faqat muqova edi) |
| `optionGroups` | object[] | Variant guruhlari (porsiya, o'lcham, …) |
| `redemption` | object | Pastda |
| `branches` | object[] | **Barcha faol filiallar**, koordinata berilgan bo'lsa yaqindan uzoqqa |
| `business` | object | `id`, `name`, `logoUrl`, `phone`, `contacts`, `rating` |
| `validFrom` | ISO-8601 | |
| `createdAt` | ISO-8601 | |

#### `redemption` bloki

| Maydon | Tur | Anonimda | Izoh |
|---|---|---|---|
| `method` | enum | — | `QR` · `PROMO_CODE` · `STUDENT_ID` · `ONLINE_LINK` |
| `promoCode` | string \| null | **`null`** | Promo-kod **chegirmaning o'zi** — faqat tizimga kirgan studentga |
| `url` | string \| null | — | `ONLINE_LINK` uchun |
| `perUserLimit` | int \| null | — | `null` = cheklovsiz |
| `perUserPeriod` | enum \| null | — | `DAY` · `WEEK` · `MONTH` · `TOTAL` |
| `totalLimit` | int \| null | — | `null` = cheklovsiz |
| `usedCount` | int | — | |
| `remainingForUser` | int \| null | **`null`** | Shu student uchun qolgan. `perUserLimit` yo'q bo'lsa ham `null` |

#### `branches[]` bloki

`branchId`, `name`, `address`, `landmark`, `lat`, `lng`, `distanceMeters`, `tradeCenter`,
`tradeCenterFields`, **`workingHours` (yettala kun)**, `deliveryZone`.

### Xato

| HTTP | Kod | Qachon |
|---|---|---|
| `404` | `LISTING_NOT_FOUND` | Bunday e'lon yo'q **yoki** ko'rinmaydi (Q4). **Sababini aytmaydi** |
| `401` | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token yuborilgan, lekin yaroqsiz |

### Ko'rish hisobi

E'lon ochilganda **1 student × 1 soat** = 1 ko'rish. **Anonim so'rov sanalmaydi** — token
bo'lmaganda faqat IP qoladi, u esa mobil operator NAT'i tufayli ishonchsiz.

---

## 5. `POST /v1/discounts/suggest` — avtoto'ldirish

🟡 Auth ixtiyoriy.

### So'rov

```jsonc
{ "query": "osh", "groupKeys": ["FOOD"], "types": ["NATIONAL_FOOD"], "limit": 8 }
```

| Maydon | Majburiy | Default | Chegara |
|---|---|---|---|
| `query` | ✅ | — | ≤ 100 belgi |
| `groupKeys` | 🟡 | `[]` | ≤ 3 — `types` bilan birgalikda **kamida bittasi shart** |
| `types` | 🟡 | `[]` | ≤ 10 |
| `limit` | ❌ | **`8`** | `1 … 20` |

> **`query` 2 belgidan qisqa bo'lsa — `422` emas, bo'sh ro'yxat.** Klient har bosishda
> so'rov yuboradi, birinchi harf uchun xato berish noto'g'ri bo'lardi.

### Javob

```jsonc
{
  "result": {
    "suggestions": [
      { "kind": "CATEGORY", "label": "Osh / Palov",
        "typeKey": "NATIONAL_FOOD", "categoryKey": "PALOV",
        "businessId": null, "listingId": null, "count": 54 }
    ]
  }
}
```

| Maydon | Izoh |
|---|---|
| `kind` | `CATEGORY` · `TYPE` · `BUSINESS` · `LISTING` |
| `label` | Ekranda ko'rsatiladigan matn |
| `typeKey` / `categoryKey` / `businessId` / `listingId` | **Bosilganda `search` ga qaytariladigan aniq filtr.** `kind` ga qarab bittasi to'ladi |
| `count` | Shu variant nechta ko'rinadigan e'lon beradi. **Hech qachon `0` emas** — bunday qator qaytarilmaydi |

**Tartib:** avval `kind` bo'yicha (`CATEGORY` → `TYPE` → `BUSINESS` → `LISTING`), keyin
`count` bo'yicha.

### ⚠️ Eng muhim qoida

Foydalanuvchi variantni bosganda **yozilgan matnni emas, aniq filtrni** yuboring:

```jsonc
// ❌ noto'g'ri
{ "mode": "LIST", "filter": { "groupKeys": ["FOOD"], "query": "osh" } }

// ✅ to'g'ri — CATEGORY variantiga bosilgandan keyin
{ "mode": "LIST", "filter": { "types": ["NATIONAL_FOOD"], "categoryKeys": ["PALOV"] } }
```

Xato yozuvga chidamli (`"palv"` → «Palov») — bu faqat `suggest` da, `search` da emas.

---

## 6. `POST /v1/discounts/favorites/toggle`

🔴 **Student tokeni majburiy.**

### So'rov

```jsonc
{ "listingId": "lst_01H8X", "saved": true }
```

| Maydon | Izoh |
|---|---|
| `listingId` | ✅ |
| `saved` | **Kerakli holat, «teskarisiga o'zgartirish» emas.** `true` = saqlash, `false` = olib tashlash |

> Shuning uchun **takroriy so'rov zararsiz**: allaqachon saqlangan e'lonni yana saqlash ham,
> saqlanmaganini olib tashlash ham muvaffaqiyat beradi. Tarmoq uzilganda qayta yuborsangiz
> yurakcha teskari holatga o'tib ketmaydi.

### Javob

```jsonc
{ "result": { "listingId": "lst_01H8X", "saved": true } }
```

> `favoritesCount` **yo'q** (D19) — ikki xil o'qilardi va hech bir ekran ishlatmaydi.

### Xatolar

| HTTP | Kod | Qachon |
|---|---|---|
| `401` | `UNAUTHORIZED` | Tokensiz |
| `403` | `FORBIDDEN` | Biznes egasi tokeni bilan |
| `404` | `LISTING_NOT_FOUND` | **Faqat saqlashda** — e'lon yo'q yoki ko'rinmaydi |

> **Olib tashlashda `404` bo'lmaydi** — sevimlilar ichida muddati o'tgan e'lonni ham
> o'chira olish kerak.

---

## 7. `POST /v1/discounts/favorites/search`

🔴 **Student tokeni majburiy.** `search` bilan **aynan bir xil filtr modeli** — klient bitta
filtr ekranini ikkalasi uchun ishlatadi.

### So'rov

```jsonc
{
  "filter": { "types": ["NATIONAL_FOOD"], "price": { "max": 50000 } },
  "sort": { "by": "NEWEST" },
  "page": { "number": 0, "size": 20 }
}
```

| Farq | `search` | `favorites/search` |
|---|---|---|
| `mode` | majburiy | **yo'q** — doim `LIST` |
| `filter` | **majburiy** | **ixtiyoriy** — bo'sh tana `{}` = «hamma saqlaganlarim» |
| `filter.groupKeys`/`types` | **majburiy** (Q3) | **ixtiyoriy** — Q3 ning yagona istisnosi |
| `sort` default | `RELEVANCE` | **`NEWEST`** |
| `map` | bor | yo'q |

`filter.flags.favoritesOnly` avtomatik yoqiladi — endpointni ochiq feed qaytarishga
ko'ndirib bo'lmaydi.

### Javob

`search` ning `LIST` javobi bilan **bir xil**: `{ items, page, size, total, hasNext }`.

---

## 8. `POST /v1/listings/{listingId}/redeem/start` — chegirma kodi

🔴 **Student tokeni majburiy.** Bu yagona endpoint bo'lib, id **yo'lda** keladi.

### So'rov

Tana yo'q. `listingId` — yo'lda.

### Javob — **`201 Created`**

```jsonc
{
  "success": true, "status": 201, "message": "OK", "error": null,
  "result": { "code": "A7K2M9", "expiresAt": "2026-07-27T12:40:00.000Z" }
}
```

| Maydon | Izoh |
|---|---|
| `code` | **Bir martalik** kod. QR sifatida chizing yoki matn ko'rinishida ko'rsating |
| `expiresAt` | Muddati — **10 daqiqa** |

> **Muddati o'tmagan `PENDING` kod bo'lsa — o'sha qaytariladi**, yangisi yaratilmaydi.
> Ya'ni ekranni qayta ochish yangi kod bermaydi; qolgan vaqtni `expiresAt` dan hisoblang.

Keyin kassir `Redemptions` section'idagi `verify` / `confirm` bilan kodni tasdiqlaydi.

### Xatolar

| HTTP | Kod | Qachon |
|---|---|---|
| `401` | `UNAUTHORIZED` | Tokensiz |
| `403` | `FORBIDDEN` | Biznes egasi tokeni bilan |
| `404` | `LISTING_NOT_FOUND` | Bunday e'lon yo'q |
| `409` | `LISTING_NOT_ACTIVE` | E'lon `ACTIVE` emas |
| `409` | `REDEMPTION_LIMIT_REACHED` | Shaxsiy yoki umumiy limit tugagan |

---

## 9. Xatolar — to'liq jadval

### `search` ning 422 kodlari

Hammasi `error.fields` bilan keladi va **kalit — buzilgan maydonning yo'li**
(`"filter.geo.bbox.minLat"`, `"filter.attributes[2].op"`).

| Kod | Qachon | `message` |
|---|---|---|
| `TYPE_REQUIRED` | `groupKeys` ham, `types` ham yo'q | Yo'nalish yoki turni tanlang |
| `TOO_MANY_GROUPS` | `groupKeys` > 3 | Juda ko'p guruh tanlandi |
| `TOO_MANY_TYPES` | `types` > 10 | Juda ko'p tur tanlandi |
| `UNKNOWN_GROUP` | Katalogda yo'q guruh | Noma'lum katalog guruhi |
| `UNKNOWN_TYPE` | Katalogda yo'q tur | Noma'lum biznes turi |
| `TYPE_GROUP_MISMATCH` | Tur tanlangan guruhga kirmaydi | Tur va guruh mos kelmadi |
| `UNKNOWN_CATEGORY` | Kategoriya tanlangan turlarga tegishli emas | Kategoriya tanlangan turlarga tegishli emas |
| `UNKNOWN_ATTRIBUTE` | Katalogda yo'q atribut kaliti | Noma'lum atribut |
| `ATTRIBUTE_OP_MISMATCH` | Kind qabul qilmaydigan operator | Atribut sharti mos kelmadi |
| `GEO_REQUIRED_FOR_SORT` | `sort.by=DISTANCE`, koordinata yo'q | Yaqinlik bo'yicha saralash uchun joylashuv kerak |
| `GEO_REQUIRED` | `mode=MAP`, `bbox` ham `lat/lng` ham yo'q | Xarita uchun joylashuv kerak |
| `INVALID_BBOX` | Teskari yoki O'zbekistondan tashqaridagi bbox | Xarita chegarasi noto'g'ri |
| `PAGE_SIZE_EXCEEDED` | `page.size` > 50 yoki `map.maxMarkers` > 2000 | Sahifa hajmi juda katta |
| `INVALID_PRICE_RANGE` | `price.min > price.max` | Narx oralig'i noto'g'ri |
| `VALIDATION_ERROR` | DTO buzilgan, noma'lum maydon, operand yo'q | Ma'lumotlar noto'g'ri |

### Boshqa statuslar

| HTTP | Kod | Qayerda |
|---|---|---|
| `401` | `UNAUTHORIZED` | Tokensiz `favorites/*`, `redeem/start`; `favoritesOnly` anonimda |
| `401` | `TOKEN_EXPIRED` | Muddati o'tgan token — **refresh qilib qayta urinish** |
| `403` | `FORBIDDEN` | Biznes egasi tokeni bilan student endpointi |
| `404` | `LISTING_NOT_FOUND` | `detail`, `favorites/toggle` (saqlashda), `redeem/start` |
| `409` | `LISTING_NOT_ACTIVE` · `REDEMPTION_LIMIT_REACHED` | `redeem/start` |
| `500` | `INTERNAL_ERROR` | Kutilmagan xato |

> ⚠️ `VALIDATION_ERROR` da `fields` qiymatlari **inglizcha** (class-validator matni) —
> foydalanuvchiga ko'rsatmang, faqat `message` ni ko'rsating. Yuqoridagi maxsus kodlarda
> (`TYPE_REQUIRED` va h.k.) esa `fields` qiymati **o'zbekcha**.

---

## 10. Kafolatlar — klient shularga suyanishi mumkin

1. **`LIST`, `COUNT` va `MAP` ning `total` i bir xil** — bir xil tana bilan.
2. `COUNT.facets.byListingKind`: **`DISCOUNT + REGULAR = total`**.
3. `MAP.markersTotal ≥ MAP.total` — ko'p filialli e'lon tufayli.
4. Bir e'lonning uchta filiali → **bir xil `listingId` li uchta marker**.
5. `finalPrice`, `savedAmount`, `discount.badge`, `priceLabel` — **serverda hisoblangan**.
   Klient qayta hisoblamaydi.
6. `suggest` hech qachon `count: 0` qator qaytarmaydi.
7. `favorites/toggle` **idempotent** — takroriy so'rov holatni buzmaydi.
8. Ko'rinmaydigan e'lon feed'ga tushmaydi va `detail` da `404` beradi — **sababini oshkor
   qilmaydi**.

### Keshlash

`COUNT` rejimidagi **facetlar Redis'da 5 daqiqa** yashaydi (koordinata ~1 km gacha
yaxlitlanadi). `total` va `LIST` qatorlari **keshlanmaydi** — ular har doim tirik.

---

## 11. Enumlar

```
SearchMode        LIST | COUNT | MAP
ListingKind       ALL | DISCOUNT | REGULAR
SortBy            RELEVANCE | DISTANCE | PRICE_FINAL | PRICE_ORIGINAL | SAVED_AMOUNT
                  DISCOUNT_PERCENT | NEWEST | ENDING_SOON | POPULAR
SortDirection     ASC | DESC
PriceBasis        FINAL | ORIGINAL
AttributesMatch   ALL | ANY
AttributeOp       EQ | NEQ | IN | NOT_IN | BETWEEN | GTE | LTE | CONTAINS | ANY | ALL | EXISTS
MatchedVia        CATEGORY | ALL | SYNONYM | TEXT | TYPE
SuggestionKind    CATEGORY | TYPE | BUSINESS | LISTING
WeekDay           SUN | MON | TUE | WED | THU | FRI | SAT
PriceUnit         PER_ITEM | PER_HOUR | PER_KG | PER_MONTH | PER_COURSE
                  PER_LESSON | PER_TICKET | PER_PERSON | PER_SESSION
DiscountType      PERCENT | FIXED_AMOUNT | SPECIAL_PRICE | FREE_ITEM
RedemptionMethod  QR | PROMO_CODE | STUDENT_ID | ONLINE_LINK
RedemptionPeriod  DAY | WEEK | MONTH | TOTAL
```

---

## 12. Ekran oqimi

```
Bosh ekran → guruh/tur tanlandi   (Catalog section)
   │
   ├─ Feed
   │    POST /discounts/search  { mode: "LIST", filter: {...}, page, sort }
   │    → kartochkalar, pastga aylantirilganda page.number++
   │
   ├─ Filtr ekrani
   │    POST /catalog/filter-schema   → ekran chiziladi   (Catalog section)
   │    Har o'zgarishda: POST /discounts/search { mode: "COUNT", filter }
   │      → tugmada "Qo'llash · 137 ta taklif"
   │    "Qo'llash" → mode: "LIST" bilan qayta so'rov
   │
   ├─ Xarita
   │    POST /discounts/search { mode: "MAP", filter: { geo: { bbox } }, map: {...} }
   │    Ko'rinish maydoni siljiganda yangi bbox bilan qayta so'rov
   │
   ├─ Qidiruv qutisi
   │    Har bosishda: POST /discounts/suggest { query, groupKeys }
   │    Variantga bosilganda → aniq filtr bilan search (matn emas!)
   │
   ├─ E'lon sahifasi
   │    POST /discounts/detail { listingId, geo }
   │    Yurakcha → POST /discounts/favorites/toggle { listingId, saved }
   │    "Chegirmani olish" → POST /listings/{id}/redeem/start → QR
   │
   └─ Sevimlilar
        POST /discounts/favorites/search { filter?, sort?, page? }
```

**Maslahatlar**

- **Filtr ekranida `COUNT`** ishlating — u qator yuklamaydi, tez ishlaydi.
- `COUNT` so'rovlarini **debounce** qiling (~300 ms): har chek-boks bosilishida so'rov
  yubormang.
- `suggest` ni ham debounce qiling; `query` 2 belgidan qisqa bo'lsa umuman yubormang.
- Xarita `bbox` i o'zgarganda `clusterize: true` bilan yuboring — aks holda 2000 belgigacha
  keladi.
- `TOKEN_EXPIRED` kelganda: refresh qiling va **o'sha so'rovni takrorlang**.
- Sahifalashda `hasNext` ga qarang, `total` ni o'zingiz bo'lmang.

---

## 13. ⚠️ Spec'dan farqlar va qurilmaganlar

### Farqlar

| | Izoh |
|---|---|
| `ENDING_SOON` default yo'nalishi | Spec `DESC` degan, amalda **`ASC`** — «tez tugaydigani» tepada. Aniq `direction: "DESC"` yuborish mumkin |
| `COUNT.facets` toraymaydi | Narx / atribut / matn filtri facetlarga qo'llanmaydi (yuqorida batafsil) |
| `COUNT.byListingKind` | `ALL` **yo'q** (`filter-schema` da bor) |
| Facet massivlari tartibi | `byCategory`, `byType`, `byDistrict`, `byDiscountType`, `byAttribute` — **tartib kafolatlanmagan**, klient o'zi sortlasin |
| `redeem/start` | OpenAPI spec'da yo'q — ilovaga kod kerak, ataylab qo'shilgan |

### Yuborilmaydigan maydonlar — `422` beradi

`forbidNonWhitelisted` yoqilgan: quyidagilar **jimgina tashlanmaydi**, `422` qaytaradi.

| Maydon | Sabab |
|---|---|
| `filter.options` | D13 — `OptionGroup.name` erkin matn, filtr kaliti sifatida ishonchsiz |
| `filter.tradeCenterIds` | Hech bir ekran talab qilmadi |
| `filter.geo.inTradeCenterOnly` | Shu sabab |
| `attributes[].range.step` | Katalogda bunday maydon yo'q |
| `locale` | Faqat `uz` xizmat qiladi |

---

## 14. Manba fayllar

**Mobil dev'ga beriladigan:**

| Fayl | Nima uchun |
|---|---|
| **shu fayl** | Section'ning to'liq tavsifi |
| [`catalog-student-feed.md`](./catalog-student-feed.md) | Filtr sxemasi va katalog — bu section bilan juft ishlaydi |
| `GET /docs/student/json` | OpenAPI JSON — codegen uchun |
| `docs/api/client/STUDENT_FEED.md` §4–§10 | Kelishilgan spetsifikatsiya, qarorlar sababi (Q1–Q6, D1–D20) |

**Backend tomondagi kod (ma'lumot uchun):**

| Qatlam | Fayl |
|---|---|
| Controller | `src/modules/discounts/presentation/` — `search`, `detail`, `suggest`, `favorites` |
| | `src/modules/redemptions/presentation/redeem-start.controller.ts` |
| DTO | `src/modules/discounts/presentation/dto/` — `search-request.dto.ts` (so'rovning to'liq modeli), `search-response.dto.ts`, `discount-card.dto.ts`, `listing-detail.dto.ts`, `suggestion.dto.ts` |
| Service | `src/modules/discounts/application/` — `search.service.ts` (validatsiya + rejimlar), `detail.service.ts`, `suggest.service.ts`, `favorites.service.ts`, `marker-cluster.shaper.ts` |
| Model | `src/modules/discounts/application/search-query.model.ts` — operator/sort jadvallari |
| Domain | `src/modules/discounts/domain/` — `discount-badge.ts`, `price-label.ts`, `feed-time.ts` |
| SQL | `src/modules/discounts/infrastructure/` — `search-filter.sql.ts`, `discount-card.sql.ts`, `map-marker.sql.ts`, `facet.sql.ts`, `visible-scope.sql.ts` |
| E2E testlar | `test/student-feed.e2e-spec.ts` · `test/favorites.e2e-spec.ts` |
