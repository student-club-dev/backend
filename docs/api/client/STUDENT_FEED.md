# StudentClub Feed API — kelishilgan spetsifikatsiya

> **Holat:** kelishilgan (backend shu bo'yicha quriladi) · **Sana:** 2026-07-25
> **O'rnini bosadi:** `_raw/DISCOUNTS_SEARCH_PROMPT.md` + `_raw/PROMPT_REGULAR_LISTINGS.md`
> **Auditoriya:** backend (bajarish uchun) va mobil dev (klientni moslash uchun)
>
> Bu hujjat — talaba tomonining (StudentClub) **yagona haqiqat manbai**. `_raw/` dagi fayllar
> mobil dev yuborgan asl topshiriqlar; ular **tarixiy nusxa**, ishlatilmaydi.
>
> **Hukm tartibi** (ziddiyat chiqqanda):
> `elon-uz.json` (shartnoma) → `docs/api/provider/BACKEND_PROMPT.md` → `catalog-seed.json` →
> shu hujjat → `_raw/`.

---

## 0. Asl topshiriqdan farqlar — mobil dev uchun

Asl spec sifatli va o'ylangan; ayniqsa **Q6** (filtrni server e'lon qiladi, klient qattiq
kodlamaydi) — to'g'ri qaror va to'liq saqlanadi. Quyidagilar — kod bazasi bilan
solishtirilgandan keyingi tuzatishlar.

### 0.1. Bekor qilingan talablar — allaqachon bajarilgan

| Asl talab | Haqiqiy holat |
|---|---|
| §11.2 «`catalog-seed.json` hozir 7 tur — Ilova A bo'yicha 27 turga qayta yarat; bu birinchi qadam» | `catalog-seed.json` **v2.0.0 allaqachon 27 tur**. Skript bilan qatorma-qator solishtirildi: 27/27 tur, 74/74 noyob atribut kaliti, 120/120 atribut ta'rifi, rang / narx birligi / jins / `allCategoryLabel` / `optionGroupHint` — **aynan mos**. Ish talab qilinmaydi. |
| `PROMPT_REGULAR_LISTINGS.md` butun premisasi: «backend har e'lonni chegirmali deb hisoblaydi» | **Yozish tomonida allaqachon noto'g'ri.** `_regular` to'liq ishlangan: `listings/domain/reserved-attribute-keys.ts`, `listings.service.ts` (chegirma validatsiyasi o'tkazib yuboriladi, `finalPrice = originalPrice`), testlari bilan. Yetishmayotgani — faqat **o'qish (feed)** tomoni. |
| §9 «PostGIS `geography(Point,4326)` + GiST indeks» | Sxemada bor: `Branch.geoPoint` + `branches_geo_point_gist`. |
| §9 «`GIN` indeks `listing.attributes` ustida» | Sxemada bor: `listings_attributes_gin` (`jsonb_path_ops`). |
| §9 «Kompozit indeks `(status, valid_to)`, `(valid_from, valid_to)`» | Sxemada bor. |
| §11.3 «Zod sxemalari» | Loyiha **class-validator** ishlatadi (`CLAUDE.md`, ataylab qilingan tanlov). HTTP shartnomasi bir xil. |

### 0.2. Tuzatilgan xatolar

| # | Joy | Xato | Tuzatish |
|---|---|---|---|
| E1 | Ilova A, `CLOTHING` | «Kategoriyalar **(27)**» — bazaviy + MALE + FEMALE ro'yxatlari bitta qatorga yopishib ketgan; `ALL` 3 marta, `OUTERWEAR`/`SHOES`/`ACCESSORIES`/`OTHER` 2 marta | Aslida: bazaviy **9** + MALE **9** + FEMALE **9**. `catalog-seed.json` dagi tuzilma (`categories.CLOTHING` + `categoriesByGender.CLOTHING`) to'g'ri |
| E2 | Ilova A, jami | «174 kategoriya» | **172** (+18 jinsga xos) |
| E3 | Ilova A, `CLOTHING` | `ACCESSORIES` = "Aksessuar", `BAGS` = "Sumka" | Seed: "Aksessuarlar", "Sumkalar" — seed ustun |
| E4 | §8 + Ilova B | `SPORT` guruhida **aynan 10 tur**; `types ≤ 10` chegarasi «guruh yoyilgandan keyin ham» tekshiriladi → `SPORT + FOOD` = 13 tur = **422**. Foydalanuvchi ikki guruhni hech qachon tanlay olmaydi | **D1** ga qarang |
| E5 | §11.1 | `catalog_synonym(categoryKey, term, weight)` — `categoryKey` yolg'iz o'zi noyob emas: `ALL` va `OTHER` 27 turning hammasida, `SHOES`/`KIDS`/`VIP`/`TRAINING` bir nechtasida bor | **D2** ga qarang |
| E6 | §5 ↔ §9 | §5 «so'z chegarasi majburiy, `to_tsquery('osh:*')`, `"osh"` → `"Toshkent"` ga tushmasin» ↔ §9 «`pg_trgm` GIN». Trigram aynan substring moslikni beradi — §5 ning o'z taqig'i | **D7** ga qarang |
| E7 | §3 ↔ §9 | «`jsonb_path_ops` GIN» raqamli `BETWEEN`/`GTE`/`LTE` ni tezlashtirmaydi — u faqat containment (`@>`) uchun | **D9** ga qarang |
| E8 | §9 | «`discount_card_mv` — `listing`/`branch`/`business` o'zgarganda yangilanadi». `REFRESH MATERIALIZED VIEW` butun ko'rinishni qayta quradi; har yozuvda bajarib bo'lmaydi | **D8** ga qarang |
| E9 | §6.2 ↔ §10.8 ↔ §10.11 | MAP javobidagi `total` — markerlar soni yoki e'lonlar soni? Uchala talab bir vaqtda to'g'ri bo'lolmaydi | **D15** ga qarang |
| E10 | §10.12 | «`facets` dagi har bir variantni tanlash 0 dan katta natija beradi» — faceted search'da bu faqat **bitta** o'lchov tanlanganda kafolatlanadi | **D17** ga qarang |
| E11 | Ilova B ↔ §10.17 | `BEAUTY` jins bo'yicha filtrlanadi, lekin `listingsCount` filtrlanadimi — aytilmagan. Filtrlansa §10.17 buziladi | **D16** ga qarang |
| E12 | `PROMPT_REGULAR_LISTINGS` §1 | «eski `filter.discount.onlyDiscounted` maydonini olib tashlang» — asosiy spec'da bunday maydon umuman yo'q; addendum eskiroq versiyaga murojaat qilyapti | E'tiborsiz qoldirildi |
| E13 | `PROMPT_REGULAR_LISTINGS` §6 | «`/v1/feed/*` ga o'tkazing» ↔ §1 jadvalidagi `/v1/discounts/*` — o'z ichida ziddiyat | **D6** ga qarang |
| E14 | `_raw/BACKEND_PROMPT.md` | Butun fayl `docs/api/provider/BACKEND_PROMPT.md` ning **eskirgan nusxasi** (3 farq: `MAX_IMAGES` 5↔10, `MAX_BRANCHES` 20↔cheklovsiz, `CATEGORY_NOT_IN_CATALOG`↔`INVALID_CATEGORY_FOR_TYPE`) va student tomoniga tegishli emas (29 endpointdan 28 tasi provider) | Ishlatilmaydi. Faqat `provider/` nusxasi amal qiladi |

### 0.3. Qarorlar (D1–D20)

Har biri quyida o'z bo'limida batafsil; bu — qisqa ro'yxat.

| # | Qaror |
|---|---|
| **D1** | Chegara turlarga emas **guruhlarga**: `groupKeys ≤ 3`. Yoyilgandan keyin tur soni tekshirilmaydi. Oshkora `types` uchun `≤ 10` qoladi |
| **D2** | `catalog_synonyms(business_type, category_key, term, weight)` — noyob kalit uchtasi birga |
| **D3** | `LIST` javobi **aynan** `{items, page, size, total, hasNext}`. `cursor`, `meta`, `facets` — Level 1 dan chiqarildi (`facets` → `mode: "COUNT"`) |
| **D4** | 422 uchun maxsus kodlar **ruxsat etiladi** (`INVALID_CATEGORY_FOR_TYPE` precedenti bor); `error.fields` doim to'ldiriladi |
| **D5** | Feed **ochiq** (ixtiyoriy auth); `favorites/*` — student tokeni majburiy; `promoCode` faqat autentifikatsiyada |
| **D6** | Yo'l nomi `/v1/discounts/*` qoladi. `GET /discounts` **olib tashlanadi** |
| **D7** | `tsvector` = qidiruv (prefiks, so'z chegarasi); `pg_trgm` = **faqat** `suggest` (xato yozuvga chidamlilik) |
| **D8** | `discount_card_mv` **bekor**. O'rniga `listings` dagi denormallashtirilgan ustunlar |
| **D9** | Raqamli atributlar uchun Level 1 da indeks **yo'q** — o'lchangandan keyin qo'shiladi |
| **D10** | `TAGS` vergul bilan ajratilgan matn bo'lib qoladi; `ANY`/`ALL` — `string_to_array` orqali |
| **D11** | `branch_working_hours` jadvali — `openNow` ni indekslangan `WHERE` ga aylantiradi |
| **D12** | `hasDeliveryOnly` **faqat** `attributes.hasDelivery` ni o'qiydi; `Branch.deliveryZone` filtr emas |
| **D13** | `filter.options` Level 1 dan **chiqarildi** — `OptionGroup.name` erkin matn |
| **D14** | `nearestBranch` teng holatda `(createdAt, id)` bo'yicha barqaror tanlanadi |
| **D15** | MAP: `total` = **e'lonlar** soni; `markersTotal` = markerlar soni |
| **D16** | `listingsCount` **hech qachon** jins bo'yicha filtrlanmaydi; jins faqat `/catalog/types` ro'yxatini kesadi |
| **D17** | Facet kafolati bitta o'lchov uchun qayta yozildi |
| **D18** | `_gender` — filtrlanadigan yagona jins manbai; `CLOTHING.gender` atributi ko'rsatish uchun qoladi |
| **D19** | `favoritesCount` **olib tashlandi**; javob `{listingId, saved}` |
| **D20** | Ko'rinmaydigan statuslar ro'yxatiga `SCHEDULED` qo'shildi |

### 0.4. Level 1 dan chiqarilganlar (keyinroq)

`cursor` (keyset sahifalash) · `meta.appliedFilters` / `meta.warnings` / `meta.tookMs` ·
`filter.options` · `discount_card_mv` · `favoritesCount`.

**Shaxsiylashtirilgan «Siz uchun» aralash feed ham Level 1 dan tashqarida.** Asl spec §7.1
5-qadamda «klient oxirgi tanlangan guruhni yuboradi» degan, lekin bosh ekranda hali hech
narsa tanlanmagan holat uchun yo'l ko'rsatmagan. Level 1 da bosh ekran **guruhlardan
boshlanadi** (`/catalog/groups` — u `types` talab qilmaydi). Turlararo aralash tavsiya
feed'i kerak bo'lganda u Q3 dan ozod alohida endpoint (`POST /v1/discounts/feed`) sifatida
qo'shiladi — mavjud `search` ga tiqishtirilmaydi.

---

## 1. Qat'iy qoidalar

**Q1. Yagona endpoint.** Filtr, qidiruv, saralash, sahifalash va xarita — bitta
`POST /v1/discounts/search`. Har filtr uchun alohida endpoint yo'q. ✅ saqlanadi

**Q2. Id'lar hech qachon URL'da emas.** Har qanday obyekt id'si (`listingId`, `businessId`,
`branchId`, `tradeCenterId`, `regionId`…) **doim so'rov tanasida**. Shuning uchun feed'ning
barcha o'qish endpointlari ham `POST`. ✅ saqlanadi

> Eslatma: bu qoida **faqat feed'ga** tegishli. Provider tomonidagi mavjud
> `GET /business/types`, `GET /regions` va h.k. o'zgarmaydi.

**Q3. «Hammasi» hech qachon qaytmaydi.** `filter.types` **yoki** `filter.groupKeys` — kamida
bittasi majburiy, kamida 1 element bilan. Ikkalasi ham bo'sh → `422 TYPE_REQUIRED`.
`groupKeys` berilsa server uni o'sha guruhdagi turlarga yoyadi. ✅ saqlanadi
**Istisno:** `favorites/search` — sevimlilar allaqachon cheklangan to'plam.

**Q0. Feed ikkala turdagi e'lonni qamraydi.** Biznes egasi e'lon qo'yayotganda rejimni o'zi
tanlaydi; oddiy e'londa `attributes._regular = "1"` yoziladi va chegirma validatsiyasi
o'tkazilmaydi. Demak:
- Qidiruvning odatiy holati — **ikkalasi ham** (`filter.listingKind: "ALL"`).
- Oddiy e'londa `discount`, `savedAmount`, `badge` → **`null`** (`0` yoki soxta qiymat emas).
- `DISCOUNT_PERCENT` va `SAVED_AMOUNT` saralashlarida oddiy e'lonlar **oxiriga** tushadi
  (`NULLS LAST`), tashlab yuborilmaydi.
✅ saqlanadi

> `DISCOUNTS_BUSINESS_API.md` §1 dagi «chegirmasiz e'lon bo'lmaydi» — **eskirgan**.

**Q4. Faqat ko'rinadigan e'lon.** Javobga faqat quyidagilar tushadi:
`listing.status = 'ACTIVE'` **va** `business.status = 'APPROVED'` **va**
`validFrom <= now() <= validTo`.

**D20 —** ko'rinmaydigan statuslarning **to'liq** ro'yxati:
`DRAFT`, `PENDING_REVIEW`, `REJECTED`, **`SCHEDULED`**, `PAUSED`, `EXPIRED`, `SOLD_OUT`,
`ARCHIVED`. Hech qanday holatda, hatto id bo'yicha so'ralsa ham.

**Q5. Konvert.** Har javob `BaseResponse` da:
`{ success, status, code, message, result, error }`. `data` maydoni **yo'q**.

**Q6. Filtrni server e'lon qiladi, klient qattiq kodlamaydi.** Qaysi turda qanday filtr
mumkinligini backend aytadi (`POST /v1/catalog/filter-schema`); klient sxemani umumiy tarzda
chizadi va tanlangan qiymatlarni aynan o'sha kalitlar bilan qaytaradi. ✅ saqlanadi — bu
butun dizaynning o'zagi

---

## 2. Endpointlar va auth

| Metod | Yo'l | Auth | Vazifasi |
|---|---|---|---|
| `POST` | `/v1/catalog/groups` | ixtiyoriy | 8 guruh (e'lon soni bilan) |
| `POST` | `/v1/catalog/types` | ixtiyoriy | Guruhdagi turlar |
| `POST` | `/v1/catalog/filter-schema` | ixtiyoriy | Qaysi filtrlar mumkin |
| `POST` | `/v1/discounts/search` | ixtiyoriy | Asosiy: filtr + qidiruv + sort + sahifa + xarita |
| `POST` | `/v1/discounts/suggest` | ixtiyoriy | Qidiruv taklifi |
| `POST` | `/v1/discounts/detail` | ixtiyoriy | Bitta e'lonning to'liq holati |
| `POST` | `/v1/discounts/favorites/toggle` | **student majburiy** | Saqlash / bekor qilish |
| `POST` | `/v1/discounts/favorites/search` | **student majburiy** | Saqlanganlar ro'yxati |

**D5 — auth qoidalari** (asl spec'da umuman aytilmagan edi):

- **Ixtiyoriy auth** — `Authorization` sarlavhasi bo'lmasa ham 200 qaytadi. Talaba
  ro'yxatdan o'tmasdan feed'ni ko'ra oladi (kashfiyot ilovasi uchun majburiy shart).
- Yaroqli **student** tokeni bo'lsa javob shaxsiylashtiriladi: `isFavorite` haqiqiy qiymat
  oladi. Token bo'lmasa `isFavorite: false`.
- **`promoCode`** `detail` javobida **faqat** autentifikatsiyadan o'tgan studentga qaytadi;
  aks holda `null`.
- `favorites/*` — token yo'q/yaroqsiz → `401 UNAUTHORIZED`; token biznes egasiniki
  (`type != STUDENT`) → `403 FORBIDDEN`.
- Yaroqsiz token **ixtiyoriy auth** endpointlarida ham `401` beradi (jimgina anonim
  holatga tushmaydi) — aks holda muddati tugagan token jimgina sevimlilarni yo'qotadi.

Bajarish: mavjud `JwtAuthGuard` yonida `OptionalJwtAuthGuard` (token bo'lsa tekshiradi,
bo'lmasa o'tkazadi) va `StudentGuard` (`req.user.type === STUDENT`).

**D6 — yo'l nomi.** `/v1/discounts/*` qoladi (mobil dev spec'ining §1 jadvalidagi nomlar).
`_raw/PROMPT_REGULAR_LISTINGS.md` §6 dagi `/v1/feed/*` tavsiyasi **qabul qilinmadi**: u
o'sha faylning §1 jadvaliga zid, va `isDiscount` / `listingKind` maydonlari semantikani
allaqachon aniq qilib beradi.

**`GET /discounts` hech qachon qurilmaydi** — `POST /discounts/search` uni to'liq qoplaydi.

✅ **Hal qilindi** (mobil dev bilan kelishildi, 2026-07-26):

- Mobil dev tomonida `dev/api-client-generator/elon-uz.json` da `/discounts` ham,
  `DiscountSortDto` ham **allaqachon yo'q**; generatsiya qilingan klientda `DiscountsApi`
  yaratilmagan. QS Business e'lonlarni `GET /v1/business/{id}/listings` orqali oladi.
- Klientdagi `DiscountSort` (4 qiymat: `DISTANCE`, `DISCOUNT_DESC`, `NEWEST`, `POPULAR`,
  `DiscountCard.kt:46`) — **sof domen enum'i**, spec'dan generatsiya qilinmaydi. Talaba feed'i
  uchun u §6 dagi **9 qiymatga** kengayadi; e'tibor bering: `DISCOUNT_DESC` →
  **`DISCOUNT_PERCENT`** deb nomlanadi.
- `elon-uz.json` **ikkala klient uchun umumiy emas** — backend teglar bo'yicha ikkita alohida
  hujjat chiqaradi (`/docs/business/json` va `/docs/student/json`), shuning uchun feed'ni
  biznes shartnomasidan chiqarish hech narsani buzmaydi.

**Bajarilgan chora — o'chirish emas, muzlatish.** `elon-uz.json` dagi `GET /discounts`
`"deprecated": true` bilan belgilanadi va tavsifi `POST /v1/discounts/search` ga yo'naltiradi;
`ENDPOINTS_CHECKLIST.md` §8 esa uni Level-1 «qurilishi kerak» ro'yxatidan chiqaradi.

> Checklist tuzatilishi **muhimroq**: u `GET /discounts` ni 22 ta Level-1 endpointdan biri deb
> sanardi, ya'ni tirik «buni qur» ko'rsatmasi edi. Haqiqiy xarajat spec qatorida emas — o'sha
> ro'yxat bo'yicha ishlab, feed'ning kambag'alroq dublikati qurilishida. GET query-param
> modeli feed filtrini ko'tara olmaydi (`attributes[]` operatorlar bilan, `bbox`,
> `attributesMatch`, id massivlari — Q2), ya'ni u abadiy kambag'al qolardi.

---

## 3. Katalog qatlami — guruhlar (yangi)

```
Guruh (8)          FOOD — "Ovqatlanish"
  └── Tur (27)       NATIONAL_FOOD — "Milliy taomlar"
        └── Kategoriya  PALOV — "Osh"
              └── Atribut  isHalal, portionGrams, spicyLevel, hasDelivery
```

Guruh qatlami — **yangi**; na klientda, na seed'da bor. Moslama **bazada** turadi
(`business_types.group_key`), kodda emas — adminka orqali turni boshqa guruhga ko'chirganda
ilova yangilanmasligi kerak. To'liq moslama — **Ilova** (oxirida).

### `POST /v1/catalog/groups`

So'rov: `{}` yoki `{ "geo": { "lat": .., "lng": .., "radiusMeters": 5000 } }`

```jsonc
{ "result": { "groups": [
  { "key": "FOOD", "nameUz": "Ovqatlanish", "emoji": "🍽", "icon": "cafe",
    "accentColor": "#F97316", "typesCount": 3, "listingsCount": 312, "sortOrder": 1,
    "types": ["NATIONAL_FOOD", "FAST_FOOD", "SOMSA"] }
] } }
```

Bo'sh guruh ham qaytadi, `listingsCount: 0` bilan — klient uni xiralashtiradi.

### `POST /v1/catalog/types`

So'rov: `{ "groupKeys": ["FOOD"], "gender": "MALE", "geo": {...} }`

> **A1 (amendment).** `gender` — **so'rov tanasida**, profil tokenidan emas. Mavjud
> `GET /business/types?gender=` aynan shu naqshda ishlaydi, katalog moduli `students`
> jadvaliga bog'lanmaydi va endpoint auth'siz qolaveradi. Klient jinsni o'z profilidan
> biladi va so'rovga qo'shadi.
>
> `groupKeys` — kamida 1, ko'pi bilan **3** element (D1).

```jsonc
{ "result": { "types": [
  { "key": "NATIONAL_FOOD", "groupKey": "FOOD", "nameUz": "Milliy taomlar", "emoji": "🍛",
    "accentColor": "#EA580C", "defaultPriceUnit": "PER_ITEM",
    "priceUnits": ["PER_ITEM", "PER_KG", "PER_PERSON"],
    "availableForGenders": ["MALE", "FEMALE"],
    "allCategoryLabel": "Butun menyu", "optionGroupHint": "Porsiya, tarkib",
    "categoriesCount": 8, "listingsCount": 187 }
] } }
```

**D16 — jins va `listingsCount`.**
- `availableForGenders` **faqat** `/catalog/types` ning **ro'yxatini** kesadi: profilida
  `gender=MALE` bo'lgan student `BEAUTY_SALON` ni ko'rmaydi, `FEMALE` — `BARBERSHOP` ni.
- `listingsCount` (guruhda ham, turda ham) **hech qachon** jins bo'yicha filtrlanmaydi.
- `/discounts/search` jins bo'yicha **umuman** filtrlamaydi — foydalanuvchi ataylab so'rasa
  topsin.

Shu qoida bilan §10.17 («guruhlar yig'indisi = turlar yig'indisi») buzilmaydi.

**Keshlash.** `listingsCount` har so'rovda `COUNT(*)` qilinmaydi — 5 daqiqalik Redis kesh;
`geo` berilganda koordinata ~1 km gacha yaxlitlanib kesh kalitiga qo'shiladi.

---

## 4. `POST /v1/discounts/search` — so'rov tanasi

```jsonc
{
  "mode": "LIST",                    // LIST | MAP | COUNT — majburiy

  "filter": {
    // --- MAJBURIY: `types` yoki `groupKeys` dan kamida bittasi (Q3) ---
    "groupKeys": ["FOOD"],                    // <=3 (D1). Guruh o'z turlariga yoyiladi
    "types": ["NATIONAL_FOOD"],               // <=10. Berilsa `groupKeys` ni toraytiradi

    // --- Katalog ---
    "categoryKeys": ["PALOV"],                // tanlangan turlarga tegishli bo'lishi shart
    "includeAllCategory": true,               // default true
    "includeCustomCategories": true,          // default true

    // --- Id'lar (Q2) ---
    "businessIds": [], "branchIds": [], "tradeCenterIds": [],
    "listingIds": [], "excludeListingIds": [],

    // --- Matnli qidiruv ---
    "query": "ps5 vip",                       // max 100 belgi

    // --- Geografiya ---
    "geo": {
      "lat": 41.3111, "lng": 69.2797,
      "radiusMeters": 5000,                   // 100..50000, default 5000
      "bbox": { "minLat": 41.28, "minLng": 69.20, "maxLat": 41.35, "maxLng": 69.31 },
      "regionIds": ["TOSHKENT_SHAHRI"],
      "districtIds": ["CHILONZOR", "YUNUSOBOD"],
      "inTradeCenterOnly": false,
      "onlineOnly": false                     // business.isOnlineOnly
    },

    // --- Narx ---
    "price": {
      "min": 0, "max": 150000,
      "basis": "FINAL",                       // FINAL | ORIGINAL
      "units": ["PER_HOUR", "PER_SESSION"],
      "currency": "UZS"
    },

    // --- E'lon turi (Q0) ---
    "listingKind": "ALL",                     // ALL (default) | DISCOUNT | REGULAR

    // --- Chegirma (listingKind ALL yoki DISCOUNT bo'lganda ma'noli) ---
    "discount": {
      "types": ["PERCENT", "SPECIAL_PRICE"],
      "minPercent": 20, "maxPercent": 90,
      "minSavedAmount": 10000
    },

    // --- Chegirmani ishlatish ---
    "redemption": {
      "methods": ["QR", "PROMO_CODE"],
      "hasPromoCode": true,
      "onlyAvailable": true                   // usedCount < totalLimit
    },

    // --- Vaqt va ish rejimi ---
    "availability": {
      "openNow": true,                        // Toshkent vaqti (UTC+5), tungi smena bilan
      "onDay": "SAT", "atTime": "19:30",
      "validAt": "2026-07-25T15:00:00Z",      // default now()
      "endingWithinHours": 24
    },

    // --- Turga xos atributlar (§5) ---
    "attributes": [
      { "key": "model",          "op": "IN",      "values": ["PS5", "PS4 Pro"] },
      { "key": "sessionMinutes", "op": "BETWEEN", "min": 30, "max": 120 },
      { "key": "hasWifi",        "op": "EQ",      "boolean": true },
      { "key": "games",          "op": "ANY",     "values": ["CS2", "Dota 2"] },
      { "key": "brand",          "op": "CONTAINS","text": "zara" }
    ],
    "attributesMatch": "ALL",                 // ALL (default) | ANY

    // --- Bayroqlar ---
    "flags": {
      "withImagesOnly": false,
      "favoritesOnly": false,                 // student tokeni talab qiladi
      "hasDeliveryOnly": false,               // D12: attributes.hasDelivery = "true"
      "newOnly": false                        // createdAt oxirgi 7 kun
    }
  },

  "sort": { "by": "DISTANCE", "direction": "ASC" },
  "page": { "number": 0, "size": 20 },
  "map":  { "zoom": 13, "clusterize": true, "maxMarkers": 500 },
  "locale": "uz"
}
```

`types`/`groupKeys` dan tashqari **barcha** `filter` maydonlari ixtiyoriy. Yo'q maydon =
filtr yo'q. `null` va bo'sh massiv bir xil ma'noda.

### D1 — chegara guruhlarga ko'chirildi

Asl spec: `types ≤ 10`, «guruh yoyilgandan **keyin** ham tekshiriladi». Ilova B da `SPORT`
aynan **10 tur** — demak `SPORT + FOOD` = 13 → `422`. Ikki guruhni tanlash imkonsiz edi.

**Yangi qoida:**

| Nima | Chegara | Xato |
|---|---|---|
| `groupKeys` | ≤ **3** | `422 TOO_MANY_GROUPS` |
| oshkora `types` | ≤ **10** | `422 TOO_MANY_TYPES` |
| yoyilgandan keyingi tur soni | **tekshirilmaydi** | — |

3 guruh × maks 10 tur = 30 tur — `IN` sharti uchun mutlaqo normal.

### D12 — `hasDeliveryOnly` ning yagona manbai

`flags.hasDeliveryOnly` **faqat** `listing.attributes.hasDelivery = "true"` ni o'qiydi.
`Branch.deliveryZone` (jsonb) — filial darajasidagi tafsilot, `detail` javobida qaytadi,
lekin **filtr emas**. Sabab: `hasDelivery` — mobil klient yozadigan atribut, ya'ni e'lonning
o'z da'vosi; `deliveryZone` esa boshqa maqsad uchun (radius, minimal buyurtma).

### D13 — `filter.options` chiqarildi

`OptionGroup.name` ("O'lcham", "Porsiya") — biznes egasi qo'lda yozadigan **erkin matn**.
Filtr kaliti sifatida ishonchsiz: "O'lcham" / "Olcham" / "Размер" bir xil narsa. Level 1 da
qo'llab-quvvatlanmaydi. Qayta ko'riladi — qachonki option group'lar katalogga bog'lansa.

---

## 5. Atribut filtrlari

E'lon `attributes` ni `jsonb` sifatida saqlaydi (`Map<String,String>`). Filtr **umumiy**
bo'lishi shart — har kalit uchun alohida kod emas, operatorlar orqali.

| `op` | Maydon | Ma'nosi |
|---|---|---|
| `EQ` | `text` \| `number` \| `boolean` | Aynan teng |
| `NEQ` | shu | Teng emas |
| `IN` | `values[]` | Ro'yxatdagilardan biri |
| `NOT_IN` | `values[]` | Hech biri emas |
| `BETWEEN` | `min`, `max` | Raqamli oraliq (biri `null` bo'lishi mumkin) |
| `GTE` / `LTE` | `number` | Katta-teng / kichik-teng |
| `CONTAINS` | `text` | Ichida bor (registrsiz, normallashtirilgan) |
| `ANY` | `values[]` | TAGS ichida kamida bittasi |
| `ALL` | `values[]` | TAGS ichida hammasi |
| `EXISTS` | — | Kalit to'ldirilganmi |

**Tur bo'yicha ruxsat (`AttributeKind` → `op`):**

- `TEXT` → `EQ`, `NEQ`, `CONTAINS`, `EXISTS`
- `NUMBER` → `EQ`, `NEQ`, `BETWEEN`, `GTE`, `LTE`, `EXISTS`
- `BOOLEAN` → `EQ`, `EXISTS` (bazada `"true"`/`"false"` matn — solishtirishda kastlanadi)
- `SELECT` → `EQ`, `NEQ`, `IN`, `NOT_IN`, `EXISTS`
- `MULTI_SELECT`, `TAGS` → `ANY`, `ALL`, `EXISTS`

Mos kelmasa → `422 ATTRIBUTE_OP_MISMATCH`, `error.fields["filter.attributes[0].op"]`.
Kalit tanlangan turlarning hech birida bo'lmasa → `422 UNKNOWN_ATTRIBUTE`.

**Maxsus (yashirin) kalitlar:**

| Kalit | Ma'nosi |
|---|---|
| `_regular` | `"1"` → chegirmasiz oddiy e'lon (Q0). `filter.listingKind` shu orqali |
| `_phone` | Aloqa telefoni — filtrlanmaydi, `detail` da qaytadi |
| `_gender` | `"MALE"` / `"FEMALE"` — e'lonning jins yo'naltirishi |

### D18 — jins mexanizmlari ajratildi

Asl spec'da jins uchun **uchta** mexanizm bir vaqtda ishlatilgan edi. Yakuniy taqsimot:

| Mexanizm | Nima uchun | Filtrlanadimi |
|---|---|---|
| `businessTypes[].availableForGenders` | `/catalog/types` **ro'yxatini** kesish (D16) | katalogda ✅, feed'da ❌ |
| `categoriesByGender` (faqat `CLOTHING`) | `CLOTHING` **kategoriya ro'yxati** almashadi | katalogda ✅ |
| `_gender` texnik kaliti (faqat `CLOTHING`) | E'lonning **o'z** jins yo'naltirishi | ✅ oddiy atribut kabi |
| `CLOTHING.gender` SELECT atributi | Ko'rsatish maydoni («Kimlar uchun») | ❌ — filtrga kirmaydi |

✅ **Hal qilindi** (mobil dev bilan kelishildi, 2026-07-26): taqsimot klient bilan **aynan mos**,
o'zgarish shart emas.

- `_gender` — `attributes` ichidagi texnik kalit, faqat `CLOTHING` uchun yoziladi
  (`PostListingViewModel.kt:522`). Qiymatlari `MALE` / `FEMALE`. **Filtr manbai.**
- `gender` — turning ko'rsatish atributi (`ListingCatalog.kt:771`, «Kimlar uchun»):
  Erkaklar / Ayollar / Uniseks / Bolalar. **Faqat ko'rsatish uchun.**
- Klient `_gender` ni ko'rsatiladigan atributlar ro'yxatidan chiqarib tashlaydi
  (`PostListingViewModel.kt:560`), shuning uchun foydalanuvchi bir narsani ikki marta ko'rmaydi.

⚠️ **Backend uchun qoida:** ikkalasi bir-biriga bog'lanmagan — foydalanuvchi `_gender=MALE`
qo'yib, `gender="Ayollar"` ni tanlashi mumkin va klient buni tekshirmaydi. Shuning uchun
backend `gender` ni **faqat matn sifatida** saqlaydi va undan hech qanday filtr yoki mantiq
chiqarmaydi. Ziddiyat xato emas — e'tiborsiz qoldiriladi.

> **Kelajak uchun izoh (hozir hech narsani bloklamaydi).** Ikki lug'atning quvvati bir xil
> emas: `_gender` da 2 qiymat, `gender` da 4. Ya'ni «uniseks» va «bolalar kiyimi» ni **faqat**
> `gender` ifodalaydi, `_gender` ularni ko'tara olmaydi. Agar keyinchalik talaba shu bo'yicha
> filtrlashni so'rasa, `_gender` lug'ati `MALE | FEMALE | UNISEX | KIDS` ga kengayishi kerak
> bo'ladi. Buni **e'lonlar to'planishidan oldin** qilish arzon — keyin `attributes` jsonb'i
> uchun data migratsiyasi kerak bo'ladi.

### D9 / D10 — indekslar haqida halol bayonot

- **D9.** Mavjud `listings_attributes_gin` (`jsonb_path_ops`) `EQ`/`IN`/containment uchun
  ishlaydi, lekin `BETWEEN`/`GTE`/`LTE` **ni tezlashtirmaydi** (asl spec §9 buni noto'g'ri
  taxmin qilgan). Level 1 da raqamli atributlar uchun **maxsus indeks qo'shilmaydi**:
  tur + status + geo filtrlari to'plamni allaqachon bir necha yuz qatorga tushiradi, undan
  keyingi `(attributes->>'key')::numeric` taqqoslash arzon. O'lchangandan keyin — ifoda
  B-tree indeksi yoki `listing_attribute_number` yon jadvali.
- **D10.** `TAGS` bazada vergul bilan ajratilgan matn bo'lib qoladi (mobil klient shunday
  yozadi — o'zgartirish yozish tomonini buzadi). `ANY` → `&&`, `ALL` → `@>`, ikkalasi ham
  `string_to_array(lower(...), ',')` ustida. Level 1 da indekssiz.

---

## 6. Saralash

| `sort.by` | Mantiq |
|---|---|
| `DISTANCE` | Eng yaqin filialgacha masofa. Koordinata yo'q → `422 GEO_REQUIRED_FOR_SORT` |
| `DISCOUNT_PERCENT` | Chegirma foizi. `FIXED_AMOUNT`/`SPECIAL_PRICE` → `(original-final)*100/original`; `FREE_ITEM` → 50 |
| `PRICE_FINAL` | Chegirmadan keyingi narx |
| `PRICE_ORIGINAL` | Asl narx |
| `SAVED_AMOUNT` | `originalPrice - finalPrice` |
| `NEWEST` | `createdAt` |
| `ENDING_SOON` | `validTo` |
| `POPULAR` | `viewsCount` |
| `RELEVANCE` | Matnli qidiruv reytingi. `query` bo'lmasa → `NEWEST` |

`direction`: `ASC` | `DESC`. Defaultlar: `DISTANCE`→ASC, `PRICE_*`→ASC, qolgani→DESC.

**Barqaror tartib majburiy.** Har `ORDER BY` oxirida `, id ASC` — aks holda teng qiymatlarda
sahifalar orasida e'lonlar takrorlanadi yoki tushib qoladi.

**Q0 bilan bog'liq:** `DISCOUNT_PERCENT` va `SAVED_AMOUNT` da oddiy e'lonlar
`NULLS LAST` bilan oxirga tushadi, ro'yxatdan chiqmaydi.

**Aralash narx birliklari.** «Soatiga 20 000» va «oyiga 300 000» ni bir ro'yxatda saralash
chalg'itadi. Asl spec buni `meta.warnings` orqali ogohlantirishni so'ragan — **D3** ga
ko'ra `meta` olib tashlandi. O'rniga: bu **klient tomonidagi** mas'uliyat — klient
`price.units` yubormasdan `PRICE_*` saralaganini o'zi biladi va foydalanuvchini
ogohlantiradi. Server hech narsa qaytarmaydi.

---

## 7. Matnli qidiruv (`filter.query`)

Qidiriladigan joylar (og'irlik kamayish tartibida):
1. `listing.title` · 2. `business.name` · 3. `category.nameUz` va `customCategoryName` ·
4. `listing.description` · 5. `attributes` ning TEXT/TAGS qiymatlari · 6. `optionGroups[].name`
va `options[].name`

**O'zbek tilini normallashtirish majburiy** — bularning hammasi bir xil natija bersin:
`o'` / `oʻ` / `oʼ` / `o` / `ў` · `g'` / `gʻ` / `g` / `ғ` · lotin ↔ kirill (`Тошкент` ↔
`Toshkent`) · registr va ortiqcha probel.

### D7 — `tsvector` va `pg_trgm` ning vazifalari ajratildi

Asl spec ikkalasini bir maqsadda tavsiya qilgan, bu esa uning o'z talabiga zid edi
(trigram substring moslikni beradi → `"osh"` → `"Toshkent"`).

| Vosita | Qayerda | Nima uchun |
|---|---|---|
| `listing.search_vector tsvector` + GIN | `filter.query` | **So'z boshidan** moslik (`to_tsquery('osh:*')`). `"osh"` → `"Toshkent"`, `"boshqa"` ga **tushmaydi**; `"ps5"` → `"PS5 VIP zal"` ishlaydi |
| `pg_trgm` GIN | **faqat** `/discounts/suggest` | Xato yozuvga chidamlilik (`"palv"` → "Palov"). Kategoriya nomlari, sinonimlar, biznes nomlari ustida — e'lon matni ustida emas |

`search_vector` `listing.search_text` (normallashtirilgan matn) dan trigger bilan
yangilanadi.

### Kategoriya nomi va sinonimlar

`"osh"` yozilganda `PALOV` kategoriyasining nomi mos keladi → o'sha kategoriyadagi
**barcha** e'lon topiladi, hatto sarlavhasida "osh" bo'lmasa ham
(`"Choyxona seti — 2 kishiga"`). Buning uchun kategoriya nomi va sinonimlari e'lonning
qidiruv ustuniga qo'shiladi.

**D2 — `catalog_synonyms` jadvali.** Asl spec `(categoryKey, term, weight)` degan edi;
`categoryKey` yolg'iz o'zi noyob emas (`ALL` va `OTHER` — 27 turning hammasida). To'g'ri
shakl:

```
catalog_synonyms(id, business_type, category_key, term, weight)
  UNIQUE (business_type, category_key, term)
```

Boshlang'ich to'plam (hammasi `NATIONAL_FOOD` / `FAST_FOOD` / `SOMSA` ichida):
`PALOV` ← osh, palov, plov, o'sh · `SOMSA`* ← somsa, самса · `LAGMON` ← lag'mon, lagmon,
laghmon · `MANTI_CHUCHVARA` ← manti, chuchvara, pelmen · `KABOB` ← kabob, shashlik, kebab ·
`LAVASH_SHAWARMA` ← lavash, shaurma, shawarma, донер · `PIZZA` ← pitsa, pizza ·
`BURGER` ← burger, gamburger

Sinonim orqali topilgan e'lon `matchedVia: "SYNONYM"` oladi.
Qidiruvda ham `filter.types`/`groupKeys` qo'llaniladi — qidiruv turdan qochib ketmaydi (Q3).

---

## 8. Javoblar

### 8.1. `mode: "LIST"`

**D3 — konvert toza qoladi.** `CLAUDE.md`: sahifalash `result` da **aynan**
`{items, page, size, total, hasNext}`. Asl spec `cursor` va `meta` qo'shgan edi:

| Maydon | Qaror | Sabab |
|---|---|---|
| `cursor` (keyset) | **chiqarildi** | `page.number` + barqaror `ORDER BY ..., id ASC` 20/sahifa uchun yetarli. Ikkinchi sahifalash yo'li = ikki barobar test va nomuvofiqlik xavfi |
| `meta.appliedFilters` | **chiqarildi** | Klient o'zi yuborgan filtrni biladi |
| `meta.warnings` | **chiqarildi** | Yagona ishlatilishi `MIXED_PRICE_UNITS` edi → §6 ga ko'ra klient tomonida |
| `meta.tookMs` | **chiqarildi** | Log darajasidagi ma'lumot. Sekin so'rovlar (>300ms) `traceId` bilan Pino'ga yoziladi |
| `facets` | **`mode: "COUNT"` ga** | Klient «Qo'llash · N ta e'lon» tugmasi uchun `COUNT` ni allaqachon chaqiradi |

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK", "error": null,
  "result": {
    "items": [ /* DiscountCard */ ],
    "page": 0, "size": 20, "total": 137, "hasNext": true
  }
}
```

**`DiscountCard`:**

```jsonc
{
  "id": "lst_01H8X...",
  "businessId": "biz_01H8X...",
  "businessName": "Choyxona Navruz",
  "businessLogoUrl": "https://cdn/.../logo.png",
  "businessType": "NATIONAL_FOOD",
  "groupKey": "FOOD",
  "categoryKey": "PALOV",
  "categoryLabel": "Osh",
  "matchedVia": "CATEGORY",          // CATEGORY | ALL | SYNONYM | TEXT | TYPE
  "title": "Osh (1 porsiya)",
  "imageUrl": "https://cdn/.../cover.jpg",
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
    "branchId": "br_01H8X...", "name": "Yunusobod filiali",
    "address": "Yunusobod 5-kvartal, 12-uy",
    "lat": 41.352, "lng": 69.273,
    "distanceMeters": 640,
    "isOpenNow": true, "closesAt": "23:00",
    "tradeCenterName": null
  },
  "branchesCount": 3,
  "validTo": "2026-08-01T18:59:59Z",
  "isFavorite": false,
  "isNew": true,
  "viewsCount": 412,
  "attributes": { "isHalal": "true", "portionGrams": "450", "spicyLevel": "Yengil" }
}
```

**Oddiy e'lon (Q0)** — soxta qiymat qo'yilmaydi:

```jsonc
{ "isDiscount": false, "originalPrice": 20000, "finalPrice": 20000,
  "savedAmount": null, "discount": null, "priceUnit": "PER_HOUR" }
```

`finalPrice`, `savedAmount`, `badge`, `distanceMeters`, `isOpenNow` — **server hisoblaydi**.
Klient hech qachon narx hisoblamaydi.

**D14 — `nearestBranch` barqarorligi.** Asl spec «geo berilmasa **birinchi** filial» degan,
lekin tartibni aytmagan → sahifalar orasida beqaror natija (§10.6 ni buzardi). Yakuniy
qoida:
- `geo.lat/lng` berilgan → eng yaqin filial (PostGIS `ST_Distance`), teng masofada
  `(createdAt ASC, id ASC)`.
- Berilmagan → `distanceMeters: null`, filial `(createdAt ASC, id ASC)` bo'yicha birinchisi.
- Filialsiz onlayn biznes → `nearestBranch: null`.
- Koordinata yo'q, lekin manzil bor → `lat`/`lng` `null`, `address` to'ldirilgan.

### 8.2. `mode: "MAP"`

```jsonc
{ "result": {
  "markers": [
    { "listingId": "lst_...", "branchId": "br_...", "lat": 41.352, "lng": 69.273,
      "priceLabel": "21k", "finalPrice": 21000, "discountBadge": "−30%",
      "businessType": "PLAYSTATION", "accentColor": "#7C5CFF",
      "isDiscount": true, "isFavorite": false }
  ],
  "clusters": [
    { "lat": 41.31, "lng": 69.24, "count": 42,
      "bbox": {"minLat":.., "minLng":.., "maxLat":.., "maxLng":..},
      "minPrice": 15000, "maxDiscountPercent": 45 }
  ],
  "bounds": { "minLat":.., "minLng":.., "maxLat":.., "maxLng":.. },
  "total": 137, "markersTotal": 214, "truncated": false
} }
```

**D15 — `total` ning ma'nosi aniqlashtirildi.** Asl spec'da uch talab bir-biriga zid edi
(§6.2 bitta `total`, §10.8 «ko'p filialli e'lon MAP'da har filial uchun», §10.11
«`COUNT.total == LIST.total`»). Yakuniy:

| Maydon | Ma'nosi |
|---|---|
| `total` | **E'lonlar** soni — `LIST` va `COUNT` dagi `total` bilan **aynan teng** |
| `markersTotal` | **Markerlar** soni (e'lon × filial). `total` dan katta bo'lishi normal |

Qolgan qoidalar o'zgarishsiz:
- `MAP` da `geo.bbox` **yoki** `geo.lat+lng+radiusMeters` majburiy → yo'q bo'lsa
  `422 GEO_REQUIRED`.
- Bir e'lonning bir necha filiali bo'lsa — har filial alohida marker, `listingId` bir xil.
- `clusterize=true` va marker soni `maxMarkers` dan oshsa: `map.zoom` ga qarab geohash
  bo'yicha guruhlanadi, `markers` qisqartiriladi, `truncated: true`. **Jimgina kesib
  tashlanmaydi.**
- Sahifalash yo'q; chegara `maxMarkers` (default 500, maks 2000).
- Oddiy e'lonlar ham marker sifatida chiqadi (`isDiscount: false`, faqat narx yorlig'i).

### 8.3. `mode: "COUNT"`

```jsonc
{ "result": {
  "total": 137,
  "facets": {
    "byCategory":    [ { "key": "PS5", "label": "PS5", "count": 54 } ],
    "byType":        [ { "key": "PLAYSTATION", "count": 96 } ],
    "byDistrict":    [ { "key": "CHILONZOR", "count": 31 } ],
    "byDiscountType":[ { "key": "PERCENT", "count": 88 } ],
    "byListingKind": [ { "key": "DISCOUNT", "count": 88 }, { "key": "REGULAR", "count": 49 } ],
    "byAttribute":   { "hallType": [ { "value": "VIP", "count": 22 } ] },
    "priceRange":    { "min": 8000, "max": 240000 },
    "discountRange": { "minPercent": 5, "maxPercent": 70 }
  }
} }
```

`byListingKind` — `_raw/PROMPT_REGULAR_LISTINGS.md` §4 dan (asosiy spec'ga singdirilmay
qolgan yagona band). `DISCOUNT + REGULAR = total`.

`facets` qolgan filtrlar qo'llangandan keyin, lekin **o'sha o'lchovning o'zini hisobga
olmay** sanaladi (klassik faceted search).

`COUNT` rejimi hech qachon to'liq qatorlarni yuklamaydi — faqat agregatlar.

---

## 9. Qolgan endpointlar

### `POST /v1/catalog/filter-schema` — Q6 ning yuragi

So'rov: `{ "groupKeys": ["FOOD"], "types": [], "categoryKeys": [], "geo": {...} }`

`types` bo'sh bo'lsa — guruhning barcha turlari bo'yicha birlashtirilgan sxema. Bir necha
tur tanlansa atributlar birlashtiriladi va har birida `appliesToTypes` ko'rsatiladi.

```jsonc
{ "result": {
  "types": [ { "key": "NATIONAL_FOOD", "nameUz": "Milliy taomlar", "emoji": "🍛", "listingsCount": 187 } ],
  "categories": [ { "key": "PALOV", "label": "Osh", "typeKey": "NATIONAL_FOOD", "count": 54 } ],
  "attributes": [
    { "key": "isHalal", "label": "Halol", "kind": "BOOLEAN",
      "appliesToTypes": ["NATIONAL_FOOD", "FAST_FOOD", "SOMSA"],
      "operators": ["EQ", "EXISTS"],
      "values": [ { "value": "true", "count": 241 }, { "value": "false", "count": 12 } ] },
    { "key": "portionGrams", "label": "Porsiya", "kind": "NUMBER", "suffix": "gramm",
      "appliesToTypes": ["NATIONAL_FOOD", "FAST_FOOD"],
      "operators": ["EQ", "BETWEEN", "GTE", "LTE", "EXISTS"],
      "range": { "min": 150, "max": 800, "step": 50 } }
  ],
  "listingKind": { "label": "E'lon turi", "values": [
    { "key": "ALL", "label": "Hammasi", "count": 312 },
    { "key": "DISCOUNT", "label": "Chegirmali", "count": 188 },
    { "key": "REGULAR", "label": "Chegirmasiz", "count": 124 } ] },
  "price": { "min": 8000, "max": 240000,
             "units": [ { "key": "PER_ITEM", "label": "Dona", "count": 268 } ] },
  "discount": { "types": [ { "key": "PERCENT", "count": 188 } ],
                "percentRange": { "min": 5, "max": 60 } },
  "redemption": { "methods": [ { "key": "STUDENT_ID", "count": 201 } ] },
  "geo": { "regions": [...], "districts": [ { "id": "CHILONZOR", "name": "Chilonzor", "count": 47 } ],
           "tradeCenters": [ { "id": "tc_...", "name": "Compass Mall", "count": 9 } ] },
  "sorts": [ { "key": "DISTANCE", "label": "Yaqinlik", "requiresGeo": true },
             { "key": "PRICE_FINAL", "label": "Arzon" },
             { "key": "DISCOUNT_PERCENT", "label": "Chegirma %" } ],
  "total": 312
} }
```

**Qat'iy qoidalar:**
- **Faqat bazada haqiqatan uchraydigan qiymatlar.** Katalogda `spicyLevel` da 4 variant
  bo'lsa-yu bazada 2 tasi ishlatilgan bo'lsa — 2 tasi qaytadi.
- Har variant yonida `count` (`geo` va `categoryKeys` hisobga olingan).
- `operators` **server** aytadi — klient `AttributeKind` dan o'zi chiqarmaydi.
- Javob 5 daqiqaga keshlanadi; `geo` koordinatasi ~1 km gacha yaxlitlanib kesh kalitiga
  qo'shiladi.

### `POST /v1/discounts/suggest`

So'rov: `{ "query": "osh", "groupKeys": ["FOOD"], "limit": 8 }`

```jsonc
{ "result": { "suggestions": [
  { "kind": "CATEGORY", "label": "Osh", "typeKey": "NATIONAL_FOOD", "categoryKey": "PALOV", "count": 54 },
  { "kind": "TYPE",     "label": "Milliy taomlar", "typeKey": "NATIONAL_FOOD", "count": 187 },
  { "kind": "BUSINESS", "label": "Besh Qozon", "businessId": "biz_...", "count": 6 },
  { "kind": "LISTING",  "label": "Osh (1 porsiya) — Choyxona Navruz", "listingId": "lst_...", "count": 1 }
] } }
```

Klient taklifni bosganda **matn qidiruvi emas**, aniq filtr yuboradi
(`categoryKeys: ["PALOV"]`) — ancha aniqroq natija.

`pg_trgm` **shu yerda** ishlatiladi (D7) — xato yozuvga chidamlilik uchun.

### `POST /v1/discounts/detail`

So'rov: `{ "listingId": "lst_01H8X...", "geo": { "lat": 41.31, "lng": 69.27 } }`

Javob — to'liq `Listing`: `DiscountCard` dagi hamma narsa + `description`, `images[]`
(to'liq), `attributes` (to'liq, `_phone` bilan), `optionGroups[]` → `options[]`
(`name`, `priceDelta`, `isAvailable`, `sortOrder`), `redemption` (`method`, `promoCode`,
`url`, `perUserLimit`, `perUserPeriod`, `totalLimit`, `usedCount`, `remainingForUser`),
**barcha** `branches[]` (manzil, `landmark`, koordinata, savdo markazi +
`tradeCenterFields`, 7 kunlik `workingHours`, `deliveryZone`, masofa), `business` (nom,
logo, telefon, kontaktlar, reyting), `validFrom`/`validTo`, `viewsCount`, `createdAt`.

- `promoCode` **faqat** autentifikatsiyadan o'tgan studentga (D5); aks holda `null`.
- Ko'rish hisoblagichi shu yerda oshadi, **idempotent**: bitta student + bitta e'lon + 1
  soat. Anonim so'rovda hisoblagich **oshmaydi** (IP bo'yicha hisoblash ishonchsiz).
- Ko'rinmaydigan e'lon (Q4) → `404 LISTING_NOT_FOUND` — holat oshkor qilinmaydi.

### `POST /v1/discounts/favorites/toggle`

So'rov: `{ "listingId": "lst_...", "saved": true }` → `{ "listingId": "...", "saved": true }`

**D19 — `favoritesCount` olib tashlandi.** Asl spec uni qaytargan, lekin ikki xil o'qilardi
(foydalanuvchining sevimlilari soni / e'lonni saqlaganlar soni) va UI'da ishlatilmaydi.
Kerak bo'lsa keyin qo'shiladi.

### `POST /v1/discounts/favorites/search`

Tanasi `search` bilan **bir xil** (`filter` + `sort` + `page`), faqat `filter.types` bu
yerda **ixtiyoriy** (Q3 dan istisno). Student tokeni majburiy.

---

## 10. Xatolar

**D4 — 422 uchun maxsus kodlar ruxsat etiladi.** Loyihada precedent bor:
`INVALID_CATEGORY_FOR_TYPE` va `BUSINESS_TYPE_IMMUTABLE` allaqachon 422 ostidagi alohida
kodlar. `VALIDATION_ERROR` — oddiy DTO validatsiyasi uchun fallback. Barcha holatlarda
`error.fields` to'ldiriladi.

| Kod | Status | Qachon |
|---|---|---|
| `TYPE_REQUIRED` | 422 | `filter.types` ham, `groupKeys` ham bo'sh |
| `TOO_MANY_GROUPS` | 422 | `groupKeys` 3 tadan ko'p (**yangi**, D1) |
| `TOO_MANY_TYPES` | 422 | Oshkora `types` 10 tadan ko'p (yoyilgandan keyin **tekshirilmaydi**, D1) |
| `UNKNOWN_TYPE` | 422 | Katalogda yo'q tur kaliti |
| `UNKNOWN_GROUP` | 422 | Katalogda yo'q guruh kaliti |
| `TYPE_GROUP_MISMATCH` | 422 | `types` dagi tur `groupKeys` ga kirmaydi |
| `UNKNOWN_CATEGORY` | 422 | Kategoriya tanlangan turlarga tegishli emas |
| `UNKNOWN_ATTRIBUTE` | 422 | Atribut kaliti tanlangan turlarda yo'q |
| `ATTRIBUTE_OP_MISMATCH` | 422 | Operator atribut turiga mos emas |
| `GEO_REQUIRED` | 422 | `mode=MAP`, lekin `bbox` ham `lat/lng` ham yo'q |
| `GEO_REQUIRED_FOR_SORT` | 422 | `sort.by=DISTANCE`, koordinata yo'q |
| `INVALID_BBOX` | 422 | `minLat > maxLat` yoki O'zbekiston chegarasidan tashqarida (lat 37..46, lng 55..74) |
| `PAGE_SIZE_EXCEEDED` | 422 | `size > 50` (MAP: `maxMarkers > 2000`) |
| `INVALID_PRICE_RANGE` | 422 | `min > max` |
| `VALIDATION_ERROR` | 422 | Qolgan DTO validatsiyasi |
| `UNAUTHORIZED` / `TOKEN_EXPIRED` | 401 | Token yo'q / yaroqsiz / muddati tugagan |
| `FORBIDDEN` | 403 | `favorites/*` ga biznes-egasi tokeni bilan |
| `LISTING_NOT_FOUND` | 404 | `detail`: yo'q **yoki** ko'rinmaydigan holatda |
| `RATE_LIMITED` | 429 | Chegaradan oshgan |

`error.fields` da aniq yo'l: `"filter.attributes[2].op"`, `"filter.geo.bbox.minLat"`.
`message` — doim **o'zbek tilida**, foydalanuvchiga ko'rsatish uchun.

> **Bajarilish holati.** `/catalog/*` endpointlarida `groupKeys` chegarasi DTO darajasida
> (`@ArrayMinSize(1)` / `@ArrayMaxSize(3)`) tekshiriladi, ya'ni `error.code` =
> `VALIDATION_ERROR` va `fields["groupKeys"]` to'ldiriladi. Jadvaldagi maxsus kodlar
> (`TYPE_REQUIRED`, `TOO_MANY_GROUPS`, `UNKNOWN_GROUP` …) `/discounts/search` bilan birga
> qo'shiladi — o'shanda filtr modeli murakkablashadi va umumiy `VALIDATION_ERROR` klientga
> yetarli ma'lumot bermay qoladi.

**Chegaralar:** `size` default 20 / maks 50 · `radiusMeters` 100..50 000 · `query` maks 100
belgi · `groupKeys` maks 3 · `types` maks 10 · `categoryKeys` maks 30 · `attributes` maks 20
shart · id massivlari maks 200 element · `maxMarkers` default 500 / maks 2000.

---

## 11. Ma'lumotlar bazasi

### Yangi jadvallar

```
catalog_groups(key PK, name_uz, name_ru?, emoji, icon, accent_color, sort_order,
               created_at, updated_at)

catalog_synonyms(id PK, business_type, category_key, term, weight,
                 UNIQUE (business_type, category_key, term))          -- D2

student_favorites(student_id, listing_id, created_at,
                  PRIMARY KEY (student_id, listing_id),
                  INDEX (listing_id))

branch_working_hours(id PK, branch_id, day, open_minute, close_minute,
                     spans_midnight, is_closed,
                     UNIQUE (branch_id, day),
                     INDEX (day, open_minute, close_minute))            -- D11
```

### Mavjud jadvallarga qo'shimchalar

```
business_types  + group_key            -> catalog_groups.key (FK, NOT NULL)

listings        + is_discount          boolean NOT NULL DEFAULT true
                + discount_percent     int NULL      -- normallashtirilgan foiz (sort uchun)
                + search_text          text NULL     -- normallashtirilgan qidiruv matni
                + search_vector        tsvector NULL -- search_text dan hosil qilinadi

  INDEX (is_discount)
  GIN   (search_vector)
  INDEX (business_id, is_discount, status)
```

### D8 — `discount_card_mv` bekor qilindi

Asl spek materiallashtirilgan ko'rinish talab qilgan va uni «`listing`/`branch`/`business`
o'zgarganda yangilash» degan. `REFRESH MATERIALIZED VIEW` **butun ko'rinishni** qayta
quradi — har yozuvda bajarib bo'lmaydi, `CONCURRENTLY` bilan ham. O'rniga:

- `listings` dagi denormallashtirilgan ustunlar (`is_discount`, `discount_percent`,
  `search_text`, `search_vector`) — **qatorma-qator** yangilanadi (yozish yo'lida +
  trigger).
- Mavjud PostGIS GiST indeksi filial masofasini beradi.
- Guruh/tur sonlari — 5 daqiqalik Redis kesh.

Materiallashtirilgan ko'rinish qayta ko'riladi **faqat** o'lchangan sekinlik bo'lsa.

### D11 — `branch_working_hours`

`Branch.workingHours` (jsonb) **klient shartnomasi sifatida o'zgarmaydi** — `BranchDto` ham,
`detail` javobi ham o'sha JSON'ni beradi. Yon jadval filial yozilganda undan hosil qilinadi
va faqat SQL filtri uchun xizmat qiladi:

- `availability.openNow` → indekslangan `WHERE` (Toshkent vaqti, UTC+5).
- Tungi smena (`close < open`) → `spans_midnight = true`, ikki oraliqqa bo'linadi.
- `isOpenNow` / `closesAt` `DiscountCard` uchun shu jadvaldan hisoblanadi.

### D9 — indeks qo'shilmaydigan joylar (ataylab)

Raqamli atributlar (`BETWEEN`/`GTE`/`LTE`) va `TAGS` (`ANY`/`ALL`) Level 1 da
indekslanmaydi — sabab §5 da. Bu **ongli qaror**, unutish emas: tur + status + geo
filtrlari to'plamni oldin kesadi.

---

## 12. Qabul mezonlari

1. **«Ovqat › Osh» ssenariysi** beshta qadamda ishlaydi: guruhlar → filtr sxemasi → ro'yxat
   (restoran manzili va koordinatasi bilan) → xarita (**o'sha `filter` obyekti, so'zma-so'z
   o'zgarishsiz**) → taklif.
2. `filter.types` **va** `groupKeys` bo'sh → `422 TYPE_REQUIRED`. Hech qanday yo'l bilan
   hamma e'lonni olib bo'lmaydi.
3. **`groupKeys: ["SPORT", "FOOD"]` ishlaydi** (13 turga yoyiladi, xato yo'q) — D1.
   `groupKeys` 4 ta bo'lsa → `422 TOO_MANY_GROUPS`.
4. Hech bir feed endpointi URL'ida id yo'q — barchasi `POST` va tanada.
5. `PAUSED`/`DRAFT`/`REJECTED`/**`SCHEDULED`** e'lon `search` da ham, `detail` da ham
   chiqmaydi.
6. Muddati tugagan (`validTo < now`) e'lon chiqmaydi.
7. `sort=DISTANCE` + koordinata → natija yaqindan uzoqqa; `distanceMeters` PostGIS va klient
   haversine'ida ±1 m farq.
8. Bir xil so'rov 1- va 2-sahifada takrorlangan e'lon bermaydi (barqaror tartib +
   `id ASC`).
9. `geo` bermasdan ikki marta so'ralganda `nearestBranch` **bir xil** filialni beradi (D14).
10. `mode=MAP` bbox ichidagi hamma filialni beradi; `maxMarkers` oshsa `truncated: true`.
11. Ko'p filialli e'lon `LIST` da **bir marta**, `MAP` da **har filial uchun** chiqadi;
    `MAP.total` = `LIST.total`, `MAP.markersTotal` ≥ `total` (D15).
12. `o'quv` / `oquv` / `oʻquv` qidiruvi bir xil natija beradi.
13. `"osh"` qidiruvi `PALOV` kategoriyasidagi e'lonlarni topadi (sinonim), lekin
    `"Toshkent"`, `"boshqa"` ga **tushmaydi** (so'z chegarasi, D7).
14. `attributes` filtri 27 turning har biri uchun ishlaydi — har tur uchun kamida bitta test.
15. `COUNT.total` aynan `LIST.total` ga teng.
16. **D17 —** `facets` kafolati: joriy filtr ustiga **bitta** facet varianti qo'shilsa natija
    0 dan katta bo'ladi. Ikki yoki undan ortiq facet kesishganda 0 chiqishi **normal** —
    bu faceted search'ning tabiiy xossasi, xato emas.
17. `filter-schema` faqat bazada haqiqatan uchraydigan variantlarni beradi.
18. `includeAllCategory: true` bilan `categoryKey="ALL"` li e'lon chiqadi va
    `matchedVia: "ALL"` oladi; `false` bilan chiqmaydi.
19. `/catalog/groups` dagi `listingsCount` yig'indisi `/catalog/types` dagi sonlar
    yig'indisiga teng — **jinsdan qat'i nazar** (D16).
20. `listingKind` berilmagan so'rov chegirmali **va** chegirmasiz e'lonlarni birga qaytaradi;
    `DISCOUNT + REGULAR = ALL`.
21. `listingKind: "REGULAR"` natijalarida `discount` va `savedAmount` — `null`,
    `finalPrice == originalPrice`.
22. `sort=DISCOUNT_PERCENT` da oddiy e'lonlar yo'qolmaydi — oxirida turadi (`NULLS LAST`).
23. Anonim so'rov 200 qaytaradi, `isFavorite: false`, `detail.promoCode: null`.
    `favorites/toggle` tokensiz → `401`, biznes-egasi tokeni bilan → `403` (D5).
24. Barcha javoblar `BaseResponse` konvertida; `LIST` natijasi **aynan**
    `{items, page, size, total, hasNext}` (D3).

---

## Ilova — guruh → tur moslamasi (8 guruh, 27 tur)

Moslama **bazada** (`business_types.group_key`), kodda emas.

| # | Guruh | `key` | Emoji | Ikonka | Rang | Turlar |
|---|---|---|---|---|---|---|
| 1 | Ovqatlanish | `FOOD` | 🍽 | `cafe` | `#F97316` | `NATIONAL_FOOD`, `FAST_FOOD`, `SOMSA` |
| 2 | Sport | `SPORT` | ⚽ | `ball` | `#16A34A` | `TENNIS`, `TABLE_TENNIS`, `FOOTBALL_FIELD`, `FOOTBALL_TRAINING`, `BASKETBALL`, `VOLLEYBALL`, `SWIMMING_POOL`, `FITNESS`, `BOXING`, `WRESTLING_MMA` |
| 3 | O'yin va bo'sh vaqt | `GAMES` | 🎮 | `gamepad` | `#7C5CFF` | `PLAYSTATION`, `CYBER_CLUB`, `BOWLING`, `BILLIARDS` |
| 4 | Ko'ngilochar | `ENTERTAINMENT` | 🎬 | `camera` | `#EF4444` | `CINEMA`, `KARAOKE` |
| 5 | Ta'lim | `EDUCATION` | 📚 | `book` | `#3B82F6` | `EDUCATION_CENTER`, `LIBRARY`, `TUTOR` |
| 6 | Go'zallik | `BEAUTY` | 💇 | `star` | `#EC4899` | `BARBERSHOP`, `BEAUTY_SALON` |
| 7 | Savdo va xizmat | `SHOPPING` | 🛍 | `cart` | `#06B6D4` | `CLOTHING`, `PRINTING` |
| 8 | Ijara | `HOUSING` | 🏠 | `home` | `#14B8A6` | `RENTAL_HOUSE` |

**Jami: 3 + 10 + 4 + 2 + 3 + 2 + 2 + 1 = 27** ✅

Ochiq qolgan mahsulot qarorlari (bazada, kodda emas — istalgan vaqt o'zgartiriladi):
`BOWLING`/`BILLIARDS` → `GAMES` da (sport emas) · `SWIMMING_POOL` → `SPORT` da ·
`LIBRARY` → `EDUCATION` da · `PRINTING` kerak bo'lsa alohida `SERVICES` guruhiga ajratiladi
(u holda 9 guruh).

---

## Katalog holati (Ilova A o'rniga)

Asl spec'ning **Ilova A** si (27 turning to'liq katalogi) bu yerda takrorlanmaydi — u
`docs/api/provider/catalog-seed.json` (v2.0.0) da **allaqachon mavjud va aynan mos**.
Yagona haqiqat manbai — seed fayli.

Solishtirish natijasi (skript bilan, 2026-07-25):

| | Ilova A | `catalog-seed.json` |
|---|---|---|
| Turlar | 27 | 27 ✅ |
| Kategoriyalar | «174» (E2 — noto'g'ri) | **172** + 18 jinsga xos |
| Atribut ta'riflari | 120 | 120 ✅ |
| Noyob atribut kalitlari | 74 | 74 ✅ |
| Rang / narx birligi / jins / `allCategoryLabel` / `optionGroupHint` | — | 27/27 ✅ |
| Farqlar | — | faqat `CLOTHING` (E1, E3) |
