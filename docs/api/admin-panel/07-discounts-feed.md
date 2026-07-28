# 07 — Discounts feed (student proximity feed)

> Konvensiyalar (base URL, `BaseResponse` envelope, error kodlari, scope belgilar) — [`00-overview.md`](./00-overview.md)da. Bu fayl faqat shu modulga xos narsalarni yozadi.

---

## 1. Maqsad

Student ilovasining **kashfiyot (discovery) yuzasi** — talaba chegirmalarni **yaqinlik bo'yicha** topadigan feed. Bitta kuchli `search` endpoint uch rejimda ishlaydi (ro'yxat / xaritada belgilar / faset bilan hisoblash), qo'shimcha detail, filter-schema, sevimlilar va autocomplete endpointlari bor.

Modulning **asosiy qiymati — filtrlar**: geo (radius + viewport + region/district + online), narx, chegirma, redemption, bayroqlar, ish vaqti / amal muddati va **dinamik atribut shartlari** (`listings.attributes` jsonb ustidan operatorli). Barcha filtrlar `POST /v1/discounts/search` body'sida (`SearchFilterDto`) keladi.

**Eng muhim qoida — ko'rinuvchanlik (visibility, Q4):** feed **faqat ko'rinadigan** e'lonlarni qaytaradi:

```
listing.status = ACTIVE  AND  business.status = APPROVED  AND  valid_from <= now() <= valid_to
```

Bu qoida `src/modules/discounts/infrastructure/visible-scope.sql.ts` da bitta joyda yozilgan (`VISIBLE_LISTING`) va **har bir** SQL'ga (search, count, map, facet, detail, favorites) bosiladi. Ya'ni `DRAFT` / `PENDING` / `REJECTED` / `PAUSED` / `EXPIRED` e'lonlar hech qachon ko'rinmaydi. Bu **moderatsiya yuzasi emas** — pastdagi "Admin panel eslatmasi"ga qarang.

**Personalizatsiya (D5):** feed public (token shart emas), lekin token bo'lsa **faqat student token** `isFavorite`, promo-kod va shaxsiy redemption limitini ochadi. Biznes token → anonim kabi ishlaydi.

---

## 2. Endpointlar

| METHOD + path | Scope | Maqsad |
|---|---|---|
| `POST /v1/discounts/search` | 🌐 OptionalJwt | Feed'ni izlash — `mode` bo'yicha LIST / COUNT / MAP |
| `POST /v1/discounts/detail` | 🌐 OptionalJwt | Bitta e'lonning to'liq ko'rinishi (id body'da) |
| `POST /v1/catalog/filter-schema` | 🌐 **Public** (guard yo'q) | Tanlangan scope uchun mavjud filtr variantlari + count |
| `POST /v1/discounts/favorites/toggle` | 👤 Student | E'lonni saqlash / saqlashdan olish (idempotent) |
| `POST /v1/discounts/favorites/search` | 👤 Student | Chaqiruvchining **o'z** sevimlilarini ro'yxatlash |
| `POST /v1/discounts/suggest` | 🌐 OptionalJwt | Qidiruv autocomplete |

Barcha muvaffaqiyatli javob **HTTP 200** (hatto `search`/`toggle` ham — pagination/read semantikasi). Guard'lar: `search` / `detail` / `suggest` — `OptionalJwtAuthGuard` (token bo'lsa biriktiradi, yaroqsiz token baribir 401). `favorites/*` — `JwtAuthGuard` + `StudentGuard`. `filter-schema` — **umuman guard yo'q**, to'liq public.

> ⚠️ **Pagination — 0-based.** Bu feed `page: { number, size }` ishlatadi: `number` **0-based** (default 0), `size` default 20, **max 50** (undan yuqori → `PAGE_SIZE_EXCEEDED`). `hasNext = (number + 1) * size < total`. Bu loyihaning boshqa ro'yxatlaridan (1-based `?page=&size=`) farq qiladi — [`00-overview.md`](./00-overview.md) → pagination.

---

## 3. Har endpoint

### 3.1 `POST /v1/discounts/search` — 🌐 OptionalJwt

Feed'ning yagona o'qishi. Body — `SearchRequestDto`; javob **`mode`ga qarab uch xil shaklda**.

**Request — `SearchRequestDto`:**

| Field | Tur | Majburiy | Izoh |
|---|---|---|---|
| `mode` | `LIST` \| `COUNT` \| `MAP` | ha | LIST — kartalar; COUNT — jami + fasetlar (satr yuklamaydi); MAP — har (listing, branch) uchun belgi |
| `filter` | `SearchFilterDto` | ha | Pastdagi to'liq filtr modeli. `groupKeys` yoki `types` — **kamida bittasi shart** (Q3) |
| `sort` | `SearchSortDto` | yo'q | Default `RELEVANCE` (text bo'lmasa NEWEST) |
| `page` | `{ number, size }` | yo'q | 0-based; default `{0, 20}`, `size` max 50 |
| `map` | `SearchMapDto` | yo'q | Faqat `mode: MAP` — boshqa rejimlar e'tiborsiz qoldiradi |

#### `filter` — `SearchFilterDto` (barcha maydonlar)

| Field | Tur | Default | Izoh |
|---|---|---|---|
| `groupKeys` | `string[]` (max 3) | `[]` | Katalog guruhlari; o'z turlariga yoyiladi. Guruh yoki tur — kamida biri shart |
| `types` | `string[]` (max 10) | `[]` | Aniq business type kalitlari; `groupKeys` yoyilishini toraytiradi |
| `categoryKeys` | `string[]` (max 30) | `[]` | Kategoriya kalitlari |
| `includeAllCategory` | `boolean` | `true` | `categoryKey = "ALL"` e'lonlari kategoriya so'roviga javob beradimi |
| `includeCustomCategories` | `boolean` | `true` | Free-text `customCategoryName` (categoryKey `"OTHER"`) e'lonlari kiritiladimi |
| `businessIds` | `string[]` (max 200) | `[]` | Faqat shu bizneslar |
| `branchIds` | `string[]` (max 200) | `[]` | Faqat shu filiallar |
| `listingIds` | `string[]` (max 200) | `[]` | Faqat shu e'lonlar |
| `excludeListingIds` | `string[]` (max 200) | `[]` | Shu e'lonlarni chiqarib tashlash |
| `query` | `string` (max 100) | `null` | Prefix, so'z-chegarasi bo'yicha: title, biznes nomi, kategoriya, sinonimlar (§7) |
| `geo` | `SearchGeoDto` | — | Pastga qarang |
| `price` | `SearchPriceDto` | — | Pastga qarang |
| `listingKind` | `ALL` \| `DISCOUNT` \| `REGULAR` | `ALL` | Chegirmali / oddiy / ikkalasi |
| `discount` | `SearchDiscountDto` | — | Pastga qarang (oddiy e'lonlar bularni qondirmaydi) |
| `redemption` | `SearchRedemptionDto` | — | Pastga qarang |
| `flags` | `SearchFlagsDto` | — | Pastga qarang |
| `availability` | `SearchAvailabilityDto` | — | Pastga qarang |
| `attributes` | `SearchAttributeDto[]` (max 20) | `[]` | Dinamik atribut shartlari (§5) |
| `attributesMatch` | `ALL` \| `ANY` | `ALL` | Atribut shartlari hammasi / kamida biri qoniqsinmi |

**`geo` — `SearchGeoDto`:**

| Field | Tur | Izoh |
|---|---|---|
| `lat` | number | `lng` bilan **juft** yuboriladi (biri yo'q bo'lsa — 422) |
| `lng` | number | `lat` bilan juft |
| `radiusMeters` | int `100..50000` | Default 5000. `lat`/`lng` bilan ishlaydi; `distanceMeters` va `DISTANCE` sortini boshqaradi |
| `bbox` | `{ minLat, minLng, maxLat, maxLng }` | Xarita viewport'i. **Har uch rejimni** toraytiradi (faqat MAP emas). MAP'da `bbox` yoki `lat`+`lng` shart |
| `regionIds` | `string[]` (max 200) | E'lon filiallari region'i bo'yicha |
| `districtIds` | `string[]` (max 200) | Filiallar tuman'i bo'yicha |
| `onlineOnly` | boolean | Faqat online-only bizneslar (`business.is_online_only`) |

**`price` — `SearchPriceDto`** (butun so'm): `min` (int ≥0), `max` (int ≥0), `basis` (`FINAL` | `ORIGINAL`, default FINAL — `min`/`max` qaysi narxga solishtiriladi), `units` (`string[]` max 20, masalan `["PER_HOUR"]`). `min > max` → `INVALID_PRICE_RANGE`.

**`discount` — `SearchDiscountDto`** (oddiy e'lonlar hech qachon qondirmaydi): `types` (`string[]` max 10, masalan `["PERCENT"]`), `minPercent` (`0..100`), `maxPercent` (`0..100`), `minSavedAmount` (int ≥0 so'm).

**`redemption` — `SearchRedemptionDto`:** `methods` (`string[]` max 10, masalan `["QR","PROMO_CODE"]`), `hasPromoCode` (boolean; `null`=filtrsiz), `onlyAvailable` (boolean — faqat redemption'i qolgan offerlar).

**`flags` — `SearchFlagsDto`:** `withImagesOnly` (bool), `favoritesOnly` (bool — **student token talab qiladi**, anonim bo'lsa 401), `hasDeliveryOnly` (bool — faqat `attributes.hasDelivery` o'qiladi, D12), `newOnly` (bool — oxirgi 7 kunda yaratilgan).

**`availability` — `SearchAvailabilityDto`** (Toshkent vaqti UTC+5, tungi smenalar ham hisobga olinadi):

| Field | Tur | Izoh |
|---|---|---|
| `openNow` | boolean | Biror filial **hozir** ochiqmi |
| `onDay` | `WeekDay` | `atTime` bilan **juft** (biri yo'q → 422) |
| `atTime` | `"HH:mm"` | `onDay` bilan juft |
| `validAt` | ISO-8601 | Offer shu paytda amalda bo'lsin; default `now()` |
| `endingWithinHours` | int `1..8760` | Shu soat ichida tugaydi ("bugun tugaydi" filtri) |

`openNow` va `onDay`+`atTime` — ikki **alohida** savol, ikkalasi berilsa ikkalasi ham qo'llanadi.

**`attributes[]` — `SearchAttributeDto`** (§5): `key` (string, max 64), `op` (`AttributeOp`), va operandlar `text` / `number` / `boolean` / `values` (max 50) / `min` / `max`. Qaysi operand o'qilishi `op`ga bog'liq (§4 Enumlar → operand jadvali). Operator berilib operandi berilmasa (masalan `IN` `values`siz) → 422. Katalog qaysi operatorlar attributega yaraydi, deb qaror qiladi — mos kelmasa `ATTRIBUTE_OP_MISMATCH`. `_` bilan boshlangan texnik kalitlar (`_regular`, `_gender`, `_phone`) katalogda yo'q va tekshirilmaydi (D18).

#### `sort` — `SearchSortDto`

`by` — `SortBy` (default `RELEVANCE`; `query` yo'q bo'lsa NEWEST'ga tushadi). `direction` — `ASC`|`DESC`, default: `DISTANCE` / `PRICE_FINAL` / `PRICE_ORIGINAL` / `ENDING_SOON` → **ASC**, qolganlari → **DESC**. `by = DISTANCE` bo'lsa geo `lat`/`lng` shart, yo'q bo'lsa `GEO_REQUIRED_FOR_SORT`.

#### `map` — `SearchMapDto` (faqat MAP)

`zoom` (`0..22`, default 13 — clustering qanchalik qo'pol guruhlaydi), `clusterize` (bool, default false), `maxMarkers` (default 500, **max 2000** — undan yuqori → `PAGE_SIZE_EXCEEDED`). MAP'da pagination yo'q: viewport = sahifa.

#### Javob — `mode` bo'yicha

**`mode: LIST` → `SearchListResponseDto`** (aynan pagination envelope, faset yo'q):
```
{ items: DiscountCardDto[], page: number (0-based), size, total, hasNext }
```

**`mode: COUNT` → `SearchCountResponseDto`** — faqat agregatlar, satr yo'q:
```
{ total, facets: { byCategory[{key,label,count}], byType[{key,count}], byDistrict[],
                   byDiscountType[], byListingKind[{DISCOUNT},{REGULAR}],
                   byAttribute { <key>: [{value,count}] },
                   priceRange {min,max}|null, discountRange {minPercent,maxPercent}|null } }
```
`total` — aynan shu body bilan LIST bergan `total` (§12.15). ⚠️ Fasetlar **faqat** type/category/location scope bo'yicha hisoblanadi — narx/atribut/text filtri qo'shilsa, bucket `total`dan oshishi mumkin (Level 1 shuni qabul qiladi: fasetlar filtr ekranini belgilash uchun, yig'ish uchun emas).

**`mode: MAP` → `SearchMapResponseDto`:**
```
{ markers: MapMarkerDto[], clusters: MapClusterDto[], bounds: GeoBox|null,
  total, markersTotal, truncated }
```
`total` — LISTINGS (LIST/COUNT bilan bir xil), `markersTotal` — MARKERS (listing × branch), bittasi ko'p filialli bo'lsa `markersTotal > total` (D15, xato emas). `truncated` — biror belgi tashlangan yoki cluster'ga yig'ilganda `true`. `MapMarkerDto`: `listingId, branchId, lat, lng, priceLabel, finalPrice, discountBadge|null, businessType, accentColor|null, isDiscount, isFavorite`. `MapClusterDto`: `lat, lng, count, bbox, minPrice, maxDiscountPercent|null`.

#### `DiscountCardDto` — bitta feed satri (search, favorites, detail birga ishlatadi)

`id`, `businessId`, `businessName`, `businessLogoUrl`|null, `businessType`, `groupKey`, `categoryKey`, `categoryLabel`, `matchedVia` (nima uchun mos keldi: `CATEGORY`|`ALL`|`SYNONYM`|`TEXT`|`TYPE`), `title`, `imageUrl`|null, `imagesCount`, `priceUnit`, `isDiscount`, `originalPrice`, `finalPrice`, `savedAmount`|null (oddiy e'londa null, hech qachon 0 emas), `currency` (`"UZS"`), `discount` (`{type, value, badge, conditions|null}`|null), `redemptionMethod`, `hasPromoCode`, `nearestBranch` (`{branchId, name, address, lat|null, lng|null, distanceMeters|null, isOpenNow, closesAt|null, tradeCenterName|null}`|null — online-only biznesda null), `branchesCount`, `validTo` (ISO), `isFavorite` (anonim/biznes → doim false), `isNew` (oxirgi 7 kun), `viewsCount`, `attributes` (`Record<string,string>`).

**Logika:** so'rovni katalogga solishtiradi (Q3: guruh→turlar), §10 limitlarni tekshiradi (max 3 guruh, max 10 aniq tur, page size 50, marker 2000), keyin ko'rinadigan scope ichida (Q4) LIST/COUNT/MAP beradi. Visibility bu yerda emas — har SQL'ga bosilgan.

---

### 3.2 `POST /v1/discounts/detail` — 🌐 OptionalJwt

**Request — `DetailRequestDto`:** `listingId` (string, majburiy), `geo` (`GeoScopeDto {lat, lng, radiusMeters?}`, ixtiyoriy — faqat `distanceMeters`ni to'ldiradi va `branches`ni yaqindan tartiblaydi, hech qachon e'lonni yashirmaydi).

**Javob — `ListingDetailDto`** — `DiscountCardDto`ni **kengaytiradi** (narx/badge/masofa hech qachon karta bilan ziddiyatga tushmaydi), qo'shimcha:
- `description`|null, `images: string[]` (barcha rasmlar), `optionGroups: OptionGroupDto[]`
- `redemption`: `{ method, promoCode|null, url|null, perUserLimit|null, perUserPeriod|null, totalLimit|null, usedCount, remainingForUser|null }`
- `branches: DetailBranchDto[]` (har biri: `branchId, name, address, landmark|null, lat, lng, distanceMeters|null, tradeCenter|null, tradeCenterFields[], workingHours[] (7 kun), deliveryZone|null`; koordinata berilsa yaqindan)
- `business`: `{ id, name, logoUrl|null, phone, contacts|null, rating|null }`
- `validFrom` (ISO), `createdAt` (ISO)

**Logika (D5):** `promoCode` va `remainingForUser` **faqat login qilgan student**ga (anonim/biznesga null). E'lon ko'rinmasa (yo'q / ACTIVE emas / muddati o'tgan / biznesi APPROVED emas) → **404 `LISTING_NOT_FOUND`**, sababini aytmaydi. E'lon ochilishi student uchun **har soatda 1 marta** view sanaladi; anonim so'rov sanalmaydi.

---

### 3.3 `POST /v1/catalog/filter-schema` — 🌐 Public

Path katalog yuzasida, lekin mantiq — e'lon agregatsiyasi (shuning uchun discounts modulida). To'liq public (guard yo'q).

**Request — `FilterSchemaRequestDto`:** `groupKeys` (`string[]`, **majburiy, 1–3**), `types` (max 10, har biri `groupKeys`ga tegishli bo'lishi kerak), `categoryKeys` (max 30), `geo` (`GeoScopeDto`).

**Javob — `FilterSchemaDto`:** `types[{key, nameUz, emoji|null, listingsCount}]`, `categories[{key, label, typeKey, count}]`, `attributes[{key, label, kind (AttributeFieldType), suffix|null, appliesToTypes[], operators[], values?[{value,count}], range?{min,max}}]`, `listingKind[{key,count}]` (`ALL`/`DISCOUNT`/`REGULAR`), `priceUnits[]`, `priceRange{min,max}|null`, `discountTypes[]`, `discountPercentRange{min,max}|null`, `redemptionMethods[]`, `regions[]`, `districts[]`, `tradeCenters[]`, `sorts[{key,label,requiresGeo}]`, `total`.

**Logika (Q6):** katalog nima *bo'lishi mumkin*ligini, fasetlar nima *aslida uchraydi*ganini aytadi — faqat **kesishmasi** qaytadi, shuning uchun tanlanadigan biror filtr nol natija bermaydi. Faqat ko'rinadigan e'lonlar bo'yicha hisoblanadi. Client filtr ekranini shu javobdan to'g'ridan-to'g'ri quradi, kalitni hard-code qilmaydi.

---

### 3.4 `POST /v1/discounts/favorites/toggle` — 👤 Student

**Request — `FavoriteToggleRequestDto`:** `listingId` (string, majburiy), `saved` (boolean — **kerakli holat**, flip emas: `true` saqlaydi, `false` olib tashlaydi).

**Javob — `FavoriteToggleDto`:** `{ listingId, saved }` (amaldan keyingi holat).

**Logika:** idempotent — bir xil qiymatni ikki marta yuborish no-op. **Saqlash** e'lon ko'rinadigan bo'lishini talab qiladi (Q4) — aks holda **404 `LISTING_NOT_FOUND`** (noma'lum va yashirin e'lon bir xil javob beradi). **Olib tashlash** visibility'ni tekshirmaydi — sevimlilardagi muddati o'tgan e'lonni ham o'chirish mumkin. Sevimlilar **per-student** (har talabaning o'ziniki).

---

### 3.5 `POST /v1/discounts/favorites/search` — 👤 Student

Chaqiruvchining **o'z saqlangan to'plami** ustidan xuddi shu filtr/sort/page modeli (client bitta filtr ekranini qayta ishlatadi).

**Request — `FavoritesSearchRequestDto`:** `filter` (`SearchFilterDto`, **ixtiyoriy** — bu yerda `groupKeys`/`types` shart emas, chunki sevimlilar allaqachon chegaralangan to'plam; bo'sh body = "saqlaganimning hammasi"), `sort` (ixtiyoriy, default `NEWEST`), `page` (ixtiyoriy, 0-based).

**Javob — `SearchListResponseDto`** (doim LIST rejimida — `{items, page, size, total, hasNext}`).

**Logika:** ichkarida `favoritesOnly` majburan yoqiladi (endpoint'ni ochiq feedni qaytarishga majburlab bo'lmaydi), Q3 (tur/guruh shart) va §10 caplari ko'tariladi.

---

### 3.6 `POST /v1/discounts/suggest` — 🌐 OptionalJwt

**Request — `SuggestRequestDto`:** `query` (string, max 100, majburiy), `groupKeys` (max 3), `types` (max 10, `groupKeys`ga tegishli), `limit` (`1..20`, default 8). `groupKeys` yoki `types` — kamida biri shart (Q3).

**Javob — `SuggestionsDto`:** `{ suggestions: [{ kind (`CATEGORY`|`TYPE`|`BUSINESS`|`LISTING`), label, typeKey|null, categoryKey|null, businessId|null, listingId|null, count }] }`.

**Logika:** `query` 2 belgidan qisqa bo'lsa **bo'sh ro'yxat** (xato emas — client har bosishda so'raydi). Har satr scope ichidagi turlarga bog'lanadi va **kamida 1 ko'rinadigan** e'lon ortida turadi (count = 0 satr tushiriladi). Tartib: `CATEGORY → TYPE → BUSINESS → LISTING`, keyin count bo'yicha. Tanlangan satr matn emas, **aniq filtr** (masalan `categoryKeys: ["PALOV"]`) bo'lib qaytariladi.

---

## 4. Enumlar

| Enum | Qiymatlar |
|---|---|
| `SearchMode` | `LIST`, `COUNT`, `MAP` |
| `SortBy` | `DISTANCE`, `DISCOUNT_PERCENT`, `PRICE_FINAL`, `PRICE_ORIGINAL`, `SAVED_AMOUNT`, `NEWEST`, `ENDING_SOON`, `POPULAR`, `RELEVANCE` |
| `SortDirection` | `ASC`, `DESC` |
| `ListingKind` | `ALL`, `DISCOUNT`, `REGULAR` |
| `PriceBasis` | `FINAL`, `ORIGINAL` |
| `AttributesMatch` | `ALL`, `ANY` |
| `AttributeOp` | `EQ`, `NEQ`, `IN`, `NOT_IN`, `BETWEEN`, `GTE`, `LTE`, `CONTAINS`, `ANY`, `ALL`, `EXISTS` |
| `AttributeFieldType` (filter-schema `kind`) | `TEXT`, `NUMBER`, `BOOLEAN`, `SELECT`, `MULTI_SELECT`, `TAGS` |
| `WeekDay` (`availability.onDay`) | `SUN`, `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT` |
| `matchedVia` (card) | `CATEGORY`, `ALL`, `SYNONYM`, `TEXT`, `TYPE` |
| `SuggestionKind` | `CATEGORY`, `TYPE`, `BUSINESS`, `LISTING` |

**AttributeOp → operand** (qaysi maydon o'qiladi): `EQ`/`NEQ` → `text`|`number`|`boolean`; `IN`/`NOT_IN`/`ANY`/`ALL` → `values`; `BETWEEN` → `min`/`max`; `GTE`/`LTE` → `number`; `CONTAINS` → `text`; `EXISTS` → hech biri.

**AttributeFieldType → ruxsat etilgan operatorlar** (boshqasi → `ATTRIBUTE_OP_MISMATCH`): `TEXT` → EQ, NEQ, CONTAINS, EXISTS · `NUMBER` → EQ, NEQ, BETWEEN, GTE, LTE, EXISTS · `BOOLEAN` → EQ, EXISTS · `SELECT` → EQ, NEQ, IN, NOT_IN, EXISTS · `MULTI_SELECT` → ANY, ALL, EXISTS · `TAGS` → ANY, ALL, EXISTS.

---

## 5. Xatolar

Modul-spetsifik 422 kodlar (D4: `VALIDATION_ERROR` juda umumiy bo'lgani uchun aniqroq kod, `error.fields` doim to'ldirilgan):

| `error.code` | HTTP | Qachon |
|---|---|---|
| `TYPE_REQUIRED` | 422 | `groupKeys` ham, `types` ham berilmadi (search/suggest ochiq feed) |
| `TOO_MANY_GROUPS` | 422 | 3 tadan ko'p guruh |
| `TOO_MANY_TYPES` | 422 | 10 tadan ko'p aniq tur |
| `UNKNOWN_GROUP` | 422 | Katalogda bunday guruh yo'q |
| `UNKNOWN_TYPE` | 422 | Katalogda bunday tur yo'q |
| `TYPE_GROUP_MISMATCH` | 422 | Tur tanlangan guruhlarga kirmaydi |
| `UNKNOWN_CATEGORY` | 422 | Kategoriya tanlangan turlarga tegishli emas |
| `UNKNOWN_ATTRIBUTE` | 422 | Atribut tanlangan turlarda yo'q |
| `ATTRIBUTE_OP_MISMATCH` | 422 | Operator attribute kind'iga qo'llanmaydi (yoki operand yo'q) |
| `GEO_REQUIRED_FOR_SORT` | 422 | `sort.by = DISTANCE`, lekin `lat`/`lng` yo'q |
| `GEO_REQUIRED` | 422 | `mode = MAP`, lekin `bbox` ham `lat`/`lng` ham yo'q |
| `INVALID_BBOX` | 422 | Teskari yoki O'zbekistondan tashqaridagi bbox |
| `PAGE_SIZE_EXCEEDED` | 422 | `page.size > 50` yoki `map.maxMarkers > 2000` |
| `INVALID_PRICE_RANGE` | 422 | `price.min > price.max` |
| `VALIDATION_ERROR` | 422 | Umumiy DTO validatsiyasi (`geo.lat` `lng`siz, juft `onDay`/`atTime` va h.k.) |
| `LISTING_NOT_FOUND` | 404 | `detail` — ko'rinmas e'lon; `favorites/toggle` (faqat save) — yo'q/ko'rinmas e'lon |
| `UNAUTHORIZED` | 401 | `flags.favoritesOnly = true` anonimda; yaroqsiz/muddati o'tgan token; `favorites/*` token yo'q |
| `FORBIDDEN` | 403 | `favorites/*` — student bo'lmagan (biznes) token |

Umumiy kodlar (401/429/500) — [`00-overview.md`](./00-overview.md).

---

## 6. Admin panel eslatmasi

Bu feed admin panel uchun **read-only public katalog ko'rinishi** sifatida foydali — barcha **ko'rinadigan** (ACTIVE + APPROVED + amal muddatida) e'lonlarni boy filtr/sort/xarita bilan ko'rsatadi, cross-owner (biznes tegishligiga bog'liq emas). Panel "jonli feed" preview'i, geo/faset tahlili yoki e'lon qidiruvi uchun uni to'g'ridan-to'g'ri ishlatishi mumkin.

**Ammo bu moderatsiya yuzasi emas:**

- Feed **faqat ko'rinadigan** e'lonlarni beradi. `DRAFT` / `PENDING` / `REJECTED` / `PAUSED` / muddati o'tgan e'lonlar **hech qachon** ko'rinmaydi — visibility har SQL'ga qattiq bosilgan (`VISIBLE_LISTING`). Moderatsiya statusi (`PENDING`) bo'yicha **filtrlab bo'lmaydi**, chunki bunday e'lonlar umuman qaytmaydi.
- `detail` yashirin e'lon uchun **404** beradi — admin ham shu endpoint orqali moderatsiyaga tushган yoki rad etilgan e'lonni ko'ra olmaydi.
- `favorites/*` — **per-student**, faqat chaqiruvchining o'z to'plami; boshqa talabaning sevimlilarini ko'rish yo'q.
- `filter-schema` / `suggest` count'lari ham faqat ko'rinadigan e'lonlar ustidan.

**Panel uchun kerak (backend TODO):** moderatsiya/admin ro'yxati — barcha statuslardagi (`DRAFT`, `PENDING`, `REJECTED`, `PAUSED`, `EXPIRED`) e'lonlarni ko'rish va moderatsiya statusi bo'yicha filtrlash uchun **alohida admin endpoint** yoki mavjud search'ga permission bilan "visibility bypass + status filtri" rejimi kerak. To'liq ro'yxat: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).

---

## Ilova — LIST search `BaseResponse` misoli

**So'rov** `POST /v1/discounts/search`:
```jsonc
{
  "mode": "LIST",
  "filter": {
    "groupKeys": ["FOOD"],
    "categoryKeys": ["PALOV"],
    "geo": { "lat": 41.3111, "lng": 69.2797, "radiusMeters": 3000 },
    "listingKind": "DISCOUNT",
    "discount": { "minPercent": 20 },
    "flags": { "withImagesOnly": true }
  },
  "sort": { "by": "DISTANCE" },
  "page": { "number": 0, "size": 20 }
}
```

**Javob** (`BaseResponse` envelope, `result` — `SearchListResponseDto`):
```jsonc
{
  "success": true,
  "status": 200,
  "code": null,
  "message": "OK",
  "result": {
    "items": [
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
        "imageUrl": "https://cdn.elon.uz/lst_01H8X/cover.jpg",
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
          "lat": 41.352,
          "lng": 69.273,
          "distanceMeters": 640,
          "isOpenNow": true,
          "closesAt": "23:00",
          "tradeCenterName": null
        },
        "branchesCount": 3,
        "validTo": "2026-08-01T18:59:59.000Z",
        "isFavorite": false,
        "isNew": false,
        "viewsCount": 412,
        "attributes": { "spicyLevel": "O'rtacha" }
      }
    ],
    "page": 0,
    "size": 20,
    "total": 137,
    "hasNext": true
  },
  "error": null
}
```
