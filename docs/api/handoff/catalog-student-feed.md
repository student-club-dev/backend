# Catalog (student feed) — mobil handoff

> Swagger tag: **`Catalog (student feed)`** · Ilova: **Student (StudentClub)**
> Holat: **✅ uchala endpoint ham ishlaydi**, e2e testlar bilan qoplangan.

Bu section — talaba ilovasining **bosh ekrani** va **filtr ekrani** quriladigan katalog
qatlami. Feed'ning o'zi (`/v1/discounts/*`) alohida section.

| # | Endpoint | Nima uchun | Auth |
|---|---|---|---|
| 1 | `POST /v1/catalog/groups` | Bosh ekran — 8 ta guruh kartochkasi | ❌ yo'q |
| 2 | `POST /v1/catalog/types` | Guruh ichiga kirilganda — turlar ro'yxati | ❌ yo'q |
| 3 | `POST /v1/catalog/filter-schema` | Filtr ekrani to'liq shu javobdan chiziladi | ❌ yo'q |

---

## 1. Umumiy qoidalar

| Qoida | Qiymat |
|---|---|
| Base URL | `{HOST}/v1` — provider va student uchun **bitta** prefiks |
| Method | **Faqat `POST`**. URL'da hech qachon `id` bo'lmaydi (Q2) |
| Header | `Content-Type: application/json` |
| Auth | **Kerak emas.** Talaba ro'yxatdan o'tmasdan ham ko'ra oladi (D5). `Authorization` yuborilsa ham e'tiborsiz qoladi |
| Til | `uz` — `nameUz`, `label`, xato `message` hammasi o'zbekcha |
| Swagger | `GET /docs/student` (UI) · `GET /docs/student/json` (codegen uchun JSON) — **`/v1` prefiksisiz**. Stend'da Basic auth bilan yopilgan bo'lishi mumkin (login/parol alohida beriladi) |

### Javob konverti (envelope) — **har doim**

Muvaffaqiyat:

```jsonc
{
  "success": true,
  "status": 200,
  "code": null,
  "message": "OK",
  "result": <payload>,
  "error": null
}
```

Xato:

```jsonc
{
  "success": false,
  "status": 422,
  "code": null,
  "message": "Ma’lumotlar noto‘g‘ri",
  "result": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Ma’lumotlar noto‘g‘ri",
    "fields": { "groupKeys": "groupKeys must contain no more than 3 elements" }
  }
}
```

HTTP status **va** `status` maydoni doim teng.

### ⚠️ Noma'lum maydon = 422

Server `forbidNonWhitelisted` bilan ishlaydi: **hujjatda yo'q maydon jimgina tashlanmaydi,
`422` qaytadi.** Bu ataylab — filtr qo'llanmagan holda to'liq feed ko'rsatishdan ko'ra xato
berish yaxshiroq. So'rov tanasiga faqat quyidagi jadvallarda ko'rsatilgan maydonlarni qo'ying.

### `geo` obyekti (uchala endpointda bir xil)

```jsonc
"geo": { "lat": 41.3111, "lng": 69.2797, "radiusMeters": 5000 }
```

| Maydon | Tur | Majburiy | Chegara |
|---|---|---|---|
| `lat` | number | ✅ | to'g'ri kenglik |
| `lng` | number | ✅ | to'g'ri uzunlik |
| `radiusMeters` | int | ❌ | `100 … 50000`, default **`5000`** |

`geo` berilsa, **hamma `count` maydonlari** shu radius ichida **faol filiali bor** e'lonlar
bo'yicha sanaladi. Berilmasa — butun mamlakat bo'yicha.

---

## 2. `POST /v1/catalog/groups`

Bosh ekrandagi 8 ta guruh kartochkasi.

### So'rov

```jsonc
{}
```

yoki

```jsonc
{ "geo": { "lat": 41.3111, "lng": 69.2797, "radiusMeters": 5000 } }
```

| Maydon | Tur | Majburiy |
|---|---|---|
| `geo` | object | ❌ |

**Bo'sh tana (`{}`) to'liq to'g'ri so'rov.**

### Javob — `result` **massiv**

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK", "error": null,
  "result": [
    {
      "key": "FOOD",
      "nameUz": "Ovqatlanish",
      "nameRu": null,
      "emoji": "🍽",
      "icon": "cafe",
      "accentColor": "#F97316",
      "sortOrder": 1,
      "types": ["FAST_FOOD", "NATIONAL_FOOD", "SOMSA"],
      "typesCount": 3,
      "listingsCount": 312
    }
    // … jami 8 ta
  ]
}
```

| Maydon | Tur | Null bo'ladimi | Izoh |
|---|---|---|---|
| `key` | string | ❌ | Guruh kaliti — `POST /catalog/types` ga shuni yuborasiz |
| `nameUz` | string | ❌ | Ekranda ko'rsatiladigan nom |
| `nameRu` | string | ✅ | Hozircha seed'da to'ldirilmagan → `null` |
| `emoji` | string | ✅ | Kartochka emoji'si |
| `icon` | string | ✅ | Ikonka kaliti (`cafe`, `ball`, `gamepad`, …) — nomi klientdagi ikonkalar to'plamiga mos |
| `accentColor` | string | ✅ | HEX rang, `#RRGGBB` |
| `sortOrder` | int | ❌ | Ko'rsatish tartibi |
| `types` | string[] | ❌ | Shu guruhga kiruvchi tur kalitlari, **`key` bo'yicha alifbo tartibida** |
| `typesCount` | int | ❌ | `types.length` |
| `listingsCount` | int | ❌ | Ko'rinadigan e'lonlar soni (pastda "ko'rinadigan" ta'rifi) |

### Muhim

- Javob **doim 8 ta guruh**, **`sortOrder` bo'yicha** tartiblangan: `FOOD`, `SPORT`, `GAMES`,
  `ENTERTAINMENT`, `EDUCATION`, `BEAUTY`, `SHOPPING`, `HOUSING`.
- **Bo'sh guruh ham qaytadi**, `listingsCount: 0` bilan — uni yashirmang, **xiralashtiring**.
- Guruh ↔ tur moslamasi **bazada** turadi (`business_types.group_key`), kodda emas. Admin
  turni boshqa guruhga ko'chirsa, **ilova yangilanmaydi** — shuning uchun moslamani klientda
  hardcode qilmang.

---

## 3. `POST /v1/catalog/types`

Tanlangan guruh(lar) ichidagi biznes turlari.

### So'rov

```jsonc
{
  "groupKeys": ["FOOD"],
  "gender": "MALE",
  "geo": { "lat": 41.3111, "lng": 69.2797, "radiusMeters": 5000 }
}
```

| Maydon | Tur | Majburiy | Chegara |
|---|---|---|---|
| `groupKeys` | string[] | ✅ | **1 … 3** element |
| `gender` | `"MALE"` \| `"FEMALE"` | ❌ | — |
| `geo` | object | ❌ | — |

- `groupKeys` chegarasi **guruhlar** ustida, turlar ustida emas (D1). `SPORT` yolg'iz o'zi
  10 ta turni ochadi, `SPORT+FOOD+GAMES` → 17 ta tur qaytadi.
- **`gender` so'rov tanasida** keladi, tokendan olinmaydi (A1). Endpoint auth'siz qolishi
  uchun shunday. Klient jinsni o'z profilidan biladi va so'rovga qo'shadi.

### Javob — `result` **massiv**

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK", "error": null,
  "result": [
    {
      "key": "NATIONAL_FOOD",
      "groupKey": "FOOD",
      "nameUz": "Milliy taomlar",
      "emoji": "🍲",
      "accentColor": "#EA580C",
      "defaultPriceUnit": "PER_ITEM",
      "priceUnits": ["PER_ITEM", "PER_KG", "PER_PERSON"],
      "availableForGenders": ["MALE", "FEMALE"],
      "allCategoryLabel": "Butun menyu",
      "optionGroupHint": "Porsiya, tarkib",
      "categoriesCount": 8,
      "listingsCount": 187
    }
  ]
}
```

| Maydon | Tur | Null | Izoh |
|---|---|---|---|
| `key` | string | ❌ | Biznes tur kaliti |
| `groupKey` | string | ❌ | Qaysi guruhga tegishli |
| `nameUz` | string | ❌ | Ekrandagi nom |
| `emoji` | string | ✅ | |
| `accentColor` | string | ✅ | HEX |
| `defaultPriceUnit` | enum | ❌ | Odatiy narx birligi |
| `priceUnits` | enum[] | ❌ | Shu tur uchun ruxsat etilgan narx birliklari |
| `availableForGenders` | `["MALE","FEMALE"]` | ❌ | Kimga ko'rsatiladi |
| `allCategoryLabel` | string | ✅ | «Butun tur» kategoriyasining yorlig'i |
| `optionGroupHint` | string | ✅ | Biznes ilovasi uchun maslahat matni; talaba ilovasida kerak emas |
| `categoriesCount` | int | ❌ | Bazaviy kategoriyalar soni (**jinsga xos ro'yxatlar hisobga olinmaydi**) |
| `listingsCount` | int | ❌ | Ko'rinadigan e'lonlar soni |

Tartib: **`key` bo'yicha alifbo** (guruhlardagidek `sortOrder` yo'q).

> `nameRu`, `icon`, `sortOrder` — turlarda **yo'q**, faqat guruhlarda bor.

### D16 — jins va sonlar (klient uchun eng muhim qoida)

| | Jins ta'sir qiladimi? |
|---|---|
| `/catalog/types` ning **ro'yxati** | ✅ `MALE` → `BEAUTY_SALON` ko'rinmaydi · `FEMALE` → `BARBERSHOP` ko'rinmaydi |
| `listingsCount` (guruhda ham, turda ham) | ❌ **hech qachon** |
| `/discounts/search` | ❌ umuman filtrlamaydi |

Shuning uchun: **`gender=MALE` yuborilganda ham `BARBERSHOP.listingsCount` o'zgarmaydi**, va
`BEAUTY` guruhining `listingsCount` i ro'yxatdan tushib qolgan `BEAUTY_SALON` ni ham o'z
ichiga oladi. Bu ataylab — aks holda «guruh yig'indisi = turlar yig'indisi» qoidasi buzilardi
va son foydalanuvchiga qarab sakrardi.

---

## 4. `POST /v1/catalog/filter-schema`

**Filtr ekrani to'liq shu javobdan chiziladi.** Klient hech qanday filtr kalitini,
operatorini yoki qiymatini hardcode qilmaydi (Q6).

Ikki manba kesishmasi qaytadi:
- **katalog** — nimani filtrlash *mumkin* (kalit, yorliq, tur, operatorlar);
- **fakt** — hozir ko'rinadigan e'lonlarda nima *bor* (qiymat + soni).

Natijada **foydalanuvchi nol natija beradigan filtrni tanlay olmaydi**.

### So'rov

```jsonc
{
  "groupKeys": ["FOOD"],
  "types": ["NATIONAL_FOOD", "FAST_FOOD"],
  "categoryKeys": ["PALOV", "LAGMON"],
  "geo": { "lat": 41.3111, "lng": 69.2797, "radiusMeters": 5000 }
}
```

| Maydon | Tur | Majburiy | Chegara |
|---|---|---|---|
| `groupKeys` | string[] | ✅ | **1 … 3** |
| `types` | string[] | ❌ | ≤ **10**; har biri `groupKeys` ichidan bo'lishi shart |
| `categoryKeys` | string[] | ❌ | ≤ **30** |
| `geo` | object | ❌ | — |

- `types` bo'sh/berilmagan → `groupKeys` **to'liq ochiladi**.
- `types` da guruhga kirmaydigan tur bo'lsa → **422 `TYPE_GROUP_MISMATCH`** (bo'sh natija emas).
- Noma'lum guruh → **422 `UNKNOWN_GROUP`**.

### Javob — `result` **obyekt**

```jsonc
{
  "result": {
    "types": [
      { "key": "FAST_FOOD",     "nameUz": "Fastfud",       "emoji": "🍔", "listingsCount": 125 },
      { "key": "NATIONAL_FOOD", "nameUz": "Milliy taomlar", "emoji": "🍲", "listingsCount": 187 }
    ],
    "categories": [
      { "key": "PALOV",  "label": "Osh",    "typeKey": "NATIONAL_FOOD", "count": 54 },
      { "key": "LAGMON", "label": "Lag'mon", "typeKey": "NATIONAL_FOOD", "count": 31 }
    ],
    "attributes": [
      {
        "key": "portionGrams",
        "label": "Porsiya",
        "kind": "NUMBER",
        "suffix": "gramm",
        "appliesToTypes": ["NATIONAL_FOOD", "FAST_FOOD"],
        "operators": ["EQ", "NEQ", "BETWEEN", "GTE", "LTE", "EXISTS"],
        "range": { "min": 150, "max": 900 }
      },
      {
        "key": "spicyLevel",
        "label": "O'tkirlik",
        "kind": "SELECT",
        "suffix": null,
        "appliesToTypes": ["NATIONAL_FOOD"],
        "operators": ["EQ", "NEQ", "IN", "NOT_IN", "EXISTS"],
        "values": [
          { "value": "O'rtacha", "count": 61 },
          { "value": "O'tkir",   "count": 22 }
        ]
      },
      {
        "key": "isHalal",
        "label": "Halol",
        "kind": "BOOLEAN",
        "suffix": null,
        "appliesToTypes": ["NATIONAL_FOOD", "FAST_FOOD"],
        "operators": ["EQ", "EXISTS"],
        "values": [{ "value": "true", "count": 240 }, { "value": "false", "count": 12 }]
      },
      {
        "key": "ingredients",
        "label": "Tarkibi",
        "kind": "TAGS",
        "suffix": null,
        "appliesToTypes": ["FAST_FOOD"],
        "operators": ["ANY", "ALL", "EXISTS"],
        "values": [
          { "value": "Mozzarella", "count": 40 },
          { "value": "Tovuq",      "count": 33 }
        ]
      }
    ],
    "listingKind":       [{ "key": "ALL", "count": 312 }, { "key": "DISCOUNT", "count": 188 }, { "key": "REGULAR", "count": 124 }],
    "priceUnits":        [{ "key": "PER_ITEM", "count": 240 }],
    "priceRange":        { "min": 8000, "max": 240000 },
    "discountTypes":     [{ "key": "PERCENT", "count": 188 }],
    "discountPercentRange": { "min": 5, "max": 70 },
    "redemptionMethods": [{ "key": "QR", "count": 200 }],
    "regions":           [{ "key": "TOSHKENT_SHAHRI", "count": 300 }],
    "districts":         [{ "key": "CHILONZOR", "count": 88 }],
    "tradeCenters":      [{ "key": "clx3k9...", "count": 12 }],
    "sorts": [
      { "key": "DISTANCE",         "label": "Yaqinlik",   "requiresGeo": true  },
      { "key": "PRICE_FINAL",      "label": "Arzon",      "requiresGeo": false },
      { "key": "DISCOUNT_PERCENT", "label": "Chegirma %", "requiresGeo": false },
      { "key": "NEWEST",           "label": "Yangi",      "requiresGeo": false },
      { "key": "ENDING_SOON",      "label": "Tugayapti",  "requiresGeo": false },
      { "key": "POPULAR",          "label": "Ommabop",    "requiresGeo": false }
    ],
    "total": 312
  }
}
```

### Bloklar bo'yicha

| Blok | Shakl | Izoh |
|---|---|---|
| `types` | `{key, nameUz, emoji, listingsCount}[]` | Tanlangan (yoki ochilgan) turlar |
| `categories` | `{key, label, typeKey, count}[]` | Faqat **ko'rinadigan e'londa uchragan** kategoriyalar |
| `attributes` | pastda | Dinamik atribut filtrlari |
| `listingKind` | `{key, count}[]` | Doim 3 element, shu tartibda: `ALL`, `DISCOUNT`, `REGULAR`. `DISCOUNT + REGULAR = ALL = total` |
| `priceUnits` | `{key, count}[]` | `key` — `PriceUnit` enum |
| `priceRange` | `{min, max}` \| `null` | `finalPrice` chegaralari, **so'm (int)**. E'lon bo'lmasa `null` |
| `discountTypes` | `{key, count}[]` | `key` — `DiscountType` enum. **Faqat chegirmali e'lonlar** bo'yicha |
| `discountPercentRange` | `{min, max}` \| `null` | Normallashtirilgan chegirma foizi, faqat chegirmali e'lonlar |
| `redemptionMethods` | `{key, count}[]` | `key` — `RedemptionMethod` enum |
| `regions` | `{key, count}[]` | ⚠️ `key` = **region `id`** (`"TOSHKENT_SHAHRI"` kabi), nom emas |
| `districts` | `{key, count}[]` | ⚠️ `key` = **district `id`** (`"CHILONZOR"` kabi) |
| `tradeCenters` | `{key, count}[]` | ⚠️ `key` = **savdo markazi `id`** (cuid) |
| `sorts` | `{key, label, requiresGeo}[]` | Statik 6 ta. `requiresGeo: true` bo'lgani `geo`siz tanlanmasin |
| `total` | int | Ko'rinadigan e'lonlar jami |

> **Nom kerak bo'lsa:** `regions` / `districts` faqat `id` beradi. Nomlarni `Geo` section'dagi
> `GET /v1/regions` va `GET /v1/districts?regionId=` dan bir marta yuklab, keshda saqlang.
> `tradeCenters` uchun — `Trade Centers` section.

### `attributes[]` ni qanday chizish kerak

| `kind` | Nima keladi | UI |
|---|---|---|
| `SELECT` | `values[]` | Radio / bitta tanlov |
| `MULTI_SELECT` | `values[]` | Checkbox / ko'p tanlov |
| `TAGS` | `values[]` | Chip'lar |
| `BOOLEAN` | `values[]` (`"true"` / `"false"` sifatida) | Switch |
| `NUMBER` | `range: {min, max}` | Slayder |
| `TEXT` | **`values` ham, `range` ham yo'q** | Matn kiritish (yoki umuman ko'rsatmang) |

- `values[]` **soni bo'yicha kamayish tartibida** keladi (teng bo'lsa — alifbo). Shu tartibda chizing.
- `MULTI_SELECT` / `TAGS` da bitta e'lon bir nechta qiymatga tegishli bo'ladi, shuning uchun
  `values[].count` **yig'indisi `total` dan katta bo'lishi mumkin** — bu xato emas.
- `values` / `range` **yo'q bo'lishi mumkin** — u holda hozircha hech bir e'londa bu atribut
  to'ldirilmagan. Filtrni **ko'rsatmang**.
- `operators[]` — server ruxsat bergan operatorlar, `/discounts/search` ga aynan shulardan
  birini yuborasiz:

  | `kind` | `operators` |
  |---|---|
  | `TEXT` | `EQ`, `NEQ`, `CONTAINS`, `EXISTS` |
  | `NUMBER` | `EQ`, `NEQ`, `BETWEEN`, `GTE`, `LTE`, `EXISTS` |
  | `BOOLEAN` | `EQ`, `EXISTS` |
  | `SELECT` | `EQ`, `NEQ`, `IN`, `NOT_IN`, `EXISTS` |
  | `MULTI_SELECT` | `ANY`, `ALL`, `EXISTS` |
  | `TAGS` | `ANY`, `ALL`, `EXISTS` |

- `appliesToTypes[]` — bir xil kalit bir nechta turda bo'lsa **birlashtiriladi** (takrorlanmaydi).
  Foydalanuvchi turni torroq tanlaganda filtr yo'qolib qolsa, sababi shu.
- **Zaxira kalitlar** (`_regular`, `_phone`, `_gender`) hech qachon `attributes` da chiqmaydi —
  ular katalogda atribut sifatida e'lon qilinmagan. Klient ularni filtr sifatida ko'rsatmasligi kerak.

---

## 5. Xatolar

| HTTP | `error.code` | Qaysi endpoint | Qachon |
|---|---|---|---|
| `422` | `VALIDATION_ERROR` | uchalasi | DTO buzilgan: `groupKeys` bo'sh yoki >3, `radiusMeters` chegaradan chiqqan, noma'lum maydon yuborilgan, `types` >10, `categoryKeys` >30 |
| `422` | `UNKNOWN_GROUP` | `filter-schema` | `groupKeys` da katalogda yo'q guruh |
| `422` | `TYPE_GROUP_MISMATCH` | `filter-schema` | `types` da tanlangan guruhlarga kirmaydigan tur |
| `500` | `INTERNAL_ERROR` | uchalasi | Kutilmagan xato |

`422` da `error.fields` to'ldiriladi — kalit = maydon yo'li:

```jsonc
{
  "success": false, "status": 422, "result": null,
  "message": "Ma’lumotlar noto‘g‘ri",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Ma’lumotlar noto‘g‘ri",
    "fields": { "geo.radiusMeters": "radiusMeters must not be less than 100" }
  }
}
```

> **⚠️ Ikkita ogohlantirish:**
>
> 1. `fields` kalitida **nuqta bo'lishi mumkin** (`"geo.radiusMeters"`) — bu **yassi kalit**,
>    ichma-ich obyekt emas. Parslashda shuni hisobga oling.
> 2. `VALIDATION_ERROR` da `fields` **qiymatlari inglizcha** (class-validator matni) —
>    ularni foydalanuvchiga **ko'rsatmang**. Kalitdan qaysi maydon xato ekanini aniqlab,
>    o'zingizning o'zbekcha matningizni chiqaring. Foydalanuvchiga ko'rsatiladigan yagona
>    tayyor matn — yuqoridagi `message`.
>    (`UNKNOWN_GROUP` va `TYPE_GROUP_MISMATCH` da esa `fields` qiymati **o'zbekcha**.)

`UNKNOWN_GROUP` (`filter-schema`):

```jsonc
{
  "success": false, "status": 422, "result": null,
  "message": "Noma’lum katalog guruhi",
  "error": {
    "code": "UNKNOWN_GROUP",
    "message": "Noma’lum katalog guruhi",
    "fields": { "groupKeys": "Katalogda bunday guruh yo‘q: SPORTT" }
  }
}
```

`TYPE_GROUP_MISMATCH` (`filter-schema`):

```jsonc
{
  "success": false, "status": 422, "result": null,
  "message": "Tur va guruh mos kelmadi",
  "error": {
    "code": "TYPE_GROUP_MISMATCH",
    "message": "Tur va guruh mos kelmadi",
    "fields": { "types": "Tanlangan guruhlarga kirmaydigan tur: BARBERSHOP" }
  }
}
```

> Bu ikki kod **faqat `filter-schema`** da uchraydi. `/catalog/types` noma'lum guruh kalitiga
> `422` bermaydi — shunchaki **bo'sh massiv** qaytaradi. Ya'ni katalog kalitini tekshirish
> kerak bo'lsa, `filter-schema` javobiga suyaning.

**404 yo'q** — bu uchala endpoint hech qachon `404` qaytarmaydi.

---

## 6. Kafolatlar — klient shularga suyanishi mumkin

Bular e2e testlar bilan qulflangan:

1. **`/catalog/groups` doim 8 ta guruh**, `sortOrder` bo'yicha, ular jami **27 ta turni** qoplaydi.
2. **Guruhning `listingsCount` i = shu guruh turlarining `listingsCount` lari yig'indisi.**
   `gender` yuborilgan-yuborilmaganidan qat'i nazar.
3. **`gender` faqat ro'yxatni kesadi, sonlarni emas** (D16).
4. `filter-schema`: **`DISCOUNT + REGULAR = ALL = total`**.
5. `filter-schema`: qaytgan har bir qiymat **kamida bitta ko'rinadigan e'londa bor** →
   nol natijali filtr tanlab bo'lmaydi.
6. Bo'sh guruh **yo'qolmaydi**, `listingsCount: 0` bilan qaytadi.

### «Ko'rinadigan e'lon» ta'rifi (barcha `count` lar shunga tayanadi)

```
listing.status = ACTIVE
AND business.status = APPROVED
AND validFrom <= hozir <= validTo
AND (geo berilgan bo'lsa) radius ichida kamida bitta faol filial
```

Bir e'lonning radius ichida uchta filiali bo'lsa ham **bir marta** sanaladi.

### Keshlash — sonlar 5 daqiqagacha kechikishi mumkin

`listingsCount` va `filter-schema` facetlari **Redis'da 5 daqiqa** yashaydi. Koordinata kesh
kalitida ~1 km gacha yaxlitlanadi (yaqin turgan talabalar bitta keshni ulashadi).

**Oqibati:** yangi e'lon qo'shilgach son darhol o'zgarmasligi mumkin. Bu normal —
klientda «yangilash» tugmasi bilan majburan yangilab bo'lmaydi, kutish kerak.

---

## 7. Enumlar

```
Gender             MALE | FEMALE

PriceUnit          PER_ITEM | PER_HOUR | PER_KG | PER_MONTH | PER_COURSE
                   PER_LESSON | PER_TICKET | PER_PERSON | PER_SESSION

AttributeFieldType TEXT | NUMBER | BOOLEAN | SELECT | MULTI_SELECT | TAGS

DiscountType       PERCENT | FIXED_AMOUNT | SPECIAL_PRICE | FREE_ITEM

RedemptionMethod   QR | PROMO_CODE | STUDENT_ID | ONLINE_LINK

ListingKind        ALL | DISCOUNT | REGULAR

Sort               DISTANCE | PRICE_FINAL | DISCOUNT_PERCENT | NEWEST | ENDING_SOON | POPULAR
```

---

## 8. Ilova — 8 guruh → 27 tur

> Ma'lumot uchun. **Klientda hardcode qilmang** — moslama bazada, admin o'zgartirishi mumkin.

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

Har turning to'liq kategoriya + atribut katalogi (172 kategoriya + 18 jinsga xos, 120 atribut
ta'rifi) — `docs/api/provider/catalog-seed.json` (**yagona haqiqat manbai**).

---

## 9. Ekran oqimi

```
Bosh ekran
  └─ POST /catalog/groups  { geo? }
        → 8 kartochka. listingsCount = 0 bo'lsa xiralashtiriladi

Guruh bosildi
  └─ POST /catalog/types   { groupKeys: [tanlangan], gender?, geo? }
        → turlar ro'yxati

Filtr ekrani ochildi
  └─ POST /catalog/filter-schema { groupKeys, types?, categoryKeys?, geo? }
        → butun filtr ekrani shu javobdan chiziladi

Filtr qo'llandi
  └─ POST /discounts/search  (alohida section)
```

**Maslahatlar**

- `POST /catalog/groups` — ilova ochilganda bir marta. Javobni keshlang, lekin 5 daqiqadan
  uzoq emas (server keshi ham shuncha).
- Foydalanuvchi joylashuvni bergan/bermaganida `geo` bilan qayta so'rang — sonlar keskin
  o'zgaradi.
- `filter-schema` ni **filtr ekrani har ochilganda** so'rang: sonlar tirik ma'lumot,
  eskirgani foydalanuvchini nol natijaga olib boradi.
- Tanlov kengaysa (foydalanuvchi yana bir tur qo'shsa) — `filter-schema` ni **qayta** so'rang.

---

## 10. ⚠️ Spec'dan farqlar — diqqat

`STUDENT_FEED.md` §3 dagi misollarda javob `{"result": {"groups": [...]}}` va
`{"result": {"types": [...]}}` ko'rinishida yozilgan. **Amalda `result` ning o'zi massiv:**

```jsonc
// ❌ spec matnidagi eskirgan misol
{ "result": { "groups": [ … ] } }

// ✅ real javob
{ "result": [ … ] }
```

`filter-schema` esa spec'dagidek — `result` **obyekt**.

Boshqa nozik farqlar:

| | Izoh |
|---|---|
| `nameRu` | Faqat guruhlarda bor; hozircha `null` (seed to'ldirilmagan) |
| `types[].sortOrder` | Turlarda **yo'q** — alifbo tartibida keladi |
| `filter-schema.types[].listingsCount` | Shu turning **kategoriyalari yig'indisi**. Katalogda yorlig'i topilmagan kategoriya tushib qoladi, shuning uchun `sum(types.listingsCount)` `total` dan **kichik bo'lishi mumkin** |
| Facet massivlari tartibi | `categories`, `priceUnits`, `discountTypes`, `redemptionMethods`, `regions`, `districts`, `tradeCenters` — **tartib kafolatlanmagan**. Klient o'zi sortlasin. `attributes[].values` va `listingKind` tartibi esa kafolatlangan |

## 11. Nima qurilmagan (bu section'da)

| Nima | Sabab |
|---|---|
| `locale` parametri | Faqat `uz` xizmat qiladi |
| `attributes[].range.step` | Katalogda bunday maydon yo'q |
| Guruh/tur uchun rasm (`imageUrl`) | Spec'da yo'q — `emoji` + `icon` + `accentColor` bilan chiziladi |

---

## 12. Manba fayllar

**Mobil dev'ga beriladigan:**

| Fayl | Nima uchun |
|---|---|
| **shu fayl** | Section'ning to'liq tavsifi |
| `GET /docs/student/json` | OpenAPI JSON — codegen uchun |
| `docs/api/provider/catalog-seed.json` | 27 tur × kategoriya × atribut to'liq katalogi |
| `docs/api/client/STUDENT_FEED.md` §3, §9 | Kelishilgan spetsifikatsiya, qarorlar sababi (D1, D5, D16, Q2, Q6) |

**Backend tomondagi kod (ma'lumot uchun):**

| Qatlam | Fayl |
|---|---|
| Controller | `src/modules/catalog/presentation/catalog-groups.controller.ts` |
| | `src/modules/discounts/presentation/filter-schema.controller.ts` |
| DTO | `src/modules/catalog/presentation/dto/` (`catalog-group.dto.ts`, `catalog-type.dto.ts`, `geo-scope.dto.ts`, `catalog-*-request.dto.ts`) |
| | `src/modules/discounts/presentation/dto/filter-schema*.dto.ts` |
| Service | `src/modules/catalog/application/catalog-groups.service.ts` |
| | `src/modules/discounts/application/filter-schema.service.ts` · `attribute-facet.shaper.ts` |
| Repository / SQL | `src/modules/catalog/infrastructure/catalog.prisma.repository.ts` · `catalog-count.sql.ts` |
| | `src/modules/discounts/infrastructure/facet.prisma.repository.ts` · `facet.sql.ts` · `visible-scope.sql.ts` |
| E2E testlar | `test/catalog-groups.e2e-spec.ts` · `test/filter-schema.e2e-spec.ts` |
