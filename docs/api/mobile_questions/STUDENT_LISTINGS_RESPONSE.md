# Talaba e'lonlari — backend javobi

`STUDENT_LISTINGS_BACKEND.md` bo'yicha bajarildi. Modul to'liq quriladi va ishlaydi:
**e'lon yaratish → e'lon qilish → qidiruv → xarita → muddati o'tishi.**

> ⚠️ **Bitta o'zgarish sizdan harakat talab qiladi:** yo'l `/v1/listings` emas,
> **`/v1/student-listings`**. Sababi §1 da. `student-club.json` ni yangilab qayta
> generatsiya qilish kerak — ilova kodi o'zgarmaydi, faqat yo'l.

Generatsiya uchun tayyor spetsifikatsiya: `docs/api/generated/student.json`
(nusxasi `docs/handoff/mobile/student-api.json`).

---

## 0. Qisqacha

| | |
|---|---|
| Endpoint'lar | 9 ta, hammasi `/v1/student-listings*` |
| Moderatsiya | **Yo'q** — `submit` darrov `ACTIVE` qiladi |
| Testlar | 300 unit + 52 e2e, hammasi yashil |
| Migratsiya | 3 ta yangi jadval, mavjud jadvallar o'zgarmagan |

### §9 "Definition of Done" bo'yicha

| # | Band | Holat |
|---|---|---|
| 1 | `PER_DAY` / `PER_PAGE` | ✅ |
| 2 | `ListingKind` + polimorf `details` | ✅ |
| 3 | `submit: false` → validatsiyasiz DRAFT | ✅ |
| 4 | `submit` → §5 qoidalari, `error.fields` | ✅ ¹ |
| 5 | Turga xos majburiy maydonlar | ✅ |
| 6 | `TASK` + `format != IN_PERSON` → manzil shart emas | ✅ |
| 7 | 100 m dublikat + O'zbekiston chegarasi | ✅ |
| 8 | `POST /search` va `GET ?...` | ✅ |
| 9 | `NEAREST` PostGIS + `distanceMeters` | ✅ |
| 10 | Kursorli **va** sahifa raqamli sahifalash | ✅ |
| 11 | Radius + `regionIds`/`districtIds` + `bbox` | ✅ |
| 12 | Universitet §7.2.4 | ⏳ Faza 2 |
| 13 | `GET /listings/catalog` §7.3 | ⏳ Faza 2 |
| 14 | Ko'rinish qoidalari §7.2.0 | ✅ |
| 15 | Cron: `EXPIRED` | ✅ |
| 16 | `Idempotency-Key` | ✅ |
| 17 | EXIF GPS tozalash + `PUBLIC_MEDIA_BASE_URL` | ✅ ² |
| 18 | Chat `Connections` ni chetlab o'tadi §7.5 | ⏳ Faza 2 |
| 19 | OpenAPI yangilandi | ✅ |

¹ `SERVICE` ning `fields.subject` va sohaga xos `required` maydonlari hali tekshirilmaydi —
`ServiceCatalog.kt` kerak (§6). `serviceType` tekshiriladi.
² Avvaldan bor edi (`image.processor.ts`), tekshirildi.

**16 ✅ · 3 ⏳ (kelishilgan holda Faza 2 ga)**

---

## 1. Yo'l o'zgarishi — nima uchun

Hujjatda "backendda hech narsa yo'q" deyilgan, lekin **`listings` jadvali va
`/v1/listings/*` yo'llari allaqachon band** — ular biznes chegirmalari uchun
(`DISCOUNTS_BUSINESS_API.md`) va `BusinessAccountGuard` orqasida turibdi:

```
POST   /v1/listings/{id}/submit      <- biznes egasi uchun, mavjud
DELETE /v1/listings/{id}             <- biznes egasi uchun, mavjud
POST   /v1/listings/{id}/pause|activate|withdraw|duplicate
GET    /v1/listings/{id}/stats
```

Ya'ni siz so'ragan `POST /v1/listings/{id}/submit` va `DELETE /v1/listings/{id}`
to'g'ridan-to'g'ri to'qnashadi. Talaba tokeni bilan chaqirilsa `403` qaytadi va
talaba e'lonlariga umuman yetib bormaydi.

Shuning uchun talaba e'lonlari **butunlay alohida**: o'z jadvallari, o'z prefiksi,
biznes tomoni bilan hech narsa umumiy emas.

**Sizga kerak:** `student-club.json` da yo'lni `/v1/student-listings` ga o'zgartirib,
`./gradlew generateAllApi` ni qayta ishga tushirish. DTO nomlari, maydon nomlari va
enum qiymatlari **o'zgarmagan**.

---

## 2. Endpoint'lar

Hammasi `Authorization: Bearer <talaba tokeni>` talab qiladi.

| Metod | Yo'l | Vazifa |
|---|---|---|
| `POST` | `/v1/student-listings` | Yaratish (`submit: true` — darrov e'lon) |
| `POST` | `/v1/student-listings/search` | Qidiruv (§7.2.1 dagi to'liq body) |
| `GET` | `/v1/student-listings?kind=…` | Xuddi shu qidiruv, query bilan |
| `GET` | `/v1/student-listings/mine` | O'z e'lonlarim (barcha status) |
| `GET` | `/v1/student-listings/{id}` | Bitta e'lon (+ `viewsCount`) |
| `PATCH` | `/v1/student-listings/{id}` | Tahrirlash |
| `POST` | `/v1/student-listings/{id}/submit` | E'lon qilish |
| `POST` | `/v1/student-listings/{id}/status` | `ACTIVE`/`PAUSED`/`ARCHIVED` |
| `DELETE` | `/v1/student-listings/{id}` | O'chirish (soft delete, `204`) |

---

## 3. Moderatsiya yo'q — status oqimi

Mahsulot qarori: **admin tasdig'i kerak emas.** Validatsiyadan o'tgan `submit`
o'sha so'rovning o'zida jonli bo'ladi.

```
DRAFT ──submit──▶ validatsiya(§5) ──▶ anti-spam(§6) ──▶ ACTIVE
                                                     └▶ SCHEDULED   (validFrom kelajakda)

SCHEDULED ──cron──▶ ACTIVE          (validFrom keldi)
ACTIVE ⇄ PAUSED                     (egasi)
ACTIVE ──egasi──▶ ARCHIVED
ACTIVE ──cron──▶ EXPIRED            (validTo yoki TASK deadline o'tdi)
PATCH (ACTIVE) ──▶ qayta validatsiya ──▶ ACTIVE
```

- **`PENDING_REVIEW` va `REJECTED` hech qachon qaytmaydi.** Enum'da qoldirildi
  (klient ularni biladi), lekin backend ularni yozmaydi. `rejectionReason` doim `null`.
- `ACTIVE` e'lon tahrirlansa — qayta validatsiya qilinadi va `ACTIVE` bo'lib qoladi.
  §10 Q2 shu tarzda hal qilindi: bitta qoida, istisno ro'yxati yo'q.
- Ruxsat etilmagan o'tish → `409 LISTING_STATUS_INVALID` (masalan `EXPIRED → ACTIVE`).
- Cron har **10 daqiqada** ishlaydi.

**Anti-spam (§6) — yagona darvoza:**

| Limit | Qiymat | Xato |
|---|---|---|
| Bir vaqtda `ACTIVE` | 20 | `429 LISTING_LIMIT_REACHED` |
| Kuniga e'lon qilish | 10 | `429 LISTING_LIMIT_REACHED` |
| Bir xil `kind`+`title`+`price` 24 soatda | rad | `409 LISTING_DUPLICATE` |
| Amal muddati | ≤ 90 kun, `TASK` da `deadline` dan oshmasin | `422` (`VALIDITY`) |

> Oxirgi qatorga e'tibor bering: `TASK` da `validTo` **`deadline` dan keyin
> bo'lmasligi kerak**. Aks holda `VALIDITY: "E'lon muddati topshirish muddatidan
> oshmasin"`. Bu §6 dan kelib chiqadi va formada oson o'tkazib yuboriladi.

---

## 4. Validatsiya

DRAFT **hech qanday tekshiruvsiz** saqlanadi — `kind` va `details.kind` yetarli:

```jsonc
POST /v1/student-listings
{ "kind": "TASK", "details": { "kind": "TASK" } }
// → 201, status: "DRAFT"
```

`submit: true` bo'lganda §5 ning hamma qoidasi ishlaydi va xatolar aynan
`ListingField` kalitlari bilan qaytadi:

```jsonc
{ "success": false, "status": 422, "message": "E'lonni tekshiring", "result": null,
  "error": { "code": "LISTING_VALIDATION_FAILED", "message": "E'lonni tekshiring",
    "fields": {
      "GENDER": "Kim uchun ekanini tanlang — qiz yoki o'g'il",
      "TASK_DEADLINE": "Muddat hozirgi vaqtdan keyin bo'lsin"
    } } }
```

Xabarlar §5 dagi matnlar bilan **so'zma-so'z** bir xil — ilova ularni
o'zgartirmasdan ko'rsatishi mumkin.

**Katalog kalitlari tekshiriladi:** `TASK` `category`→`typeKey` (8 kategoriya,
26 tur + `OTHER`), `JOB` `categoryKey` (21 ta), `RENTAL` `amenities` (14 ta).
Noma'lum kalit → `422 CATALOG_KEY_UNKNOWN`.

`details.kind` tashqi `kind` bilan mos kelmasa → `422 LISTING_KIND_MISMATCH`.

---

## 5. Qidiruv

### 5.1 Ikkala yo'l bir xil ishlaydi

`POST /search` (murakkab so'rov) va `GET /student-listings?...` (tab, deep-link)
**bitta kod yo'lidan** o'tadi — natijalar farq qilmaydi. e2e testda ikkalasi
solishtiriladi.

`kind` majburiy; berilmasa `422`. **Boshqa turga tegishli filtr jimgina
e'tiborsiz qoldiriladi** — tab almashganda eski parametr qolib ketsa xato bo'lmaydi.

### 5.2 "Yumshoq moslik" — hammasi ishlaydi

| Filtr | Qoida |
|---|---|
| `gender` | `ANY` e'lon har qanday jins so'roviga mos |
| `serviceFormat` | `HYBRID` har qanday formatga mos |
| `shift` | `FLEXIBLE` har qanday smenaga mos |
| `taskFormat` | `ANY` har qanday formatga mos |
| `maxPrice` | `isNegotiable: true` e'lon **hech qachon tushib qolmaydi** |

### 5.3 Joylashuv

Uchala usul mustaqil, birga berilsa `AND` bilan kesishadi. **Hech biri
berilmasa — butun O'zbekiston.**

- Radius: `geo.lat` + `geo.lng` + `geo.radiusMeters` (maks. 200 km, kattasi qisqartiriladi)
- Hudud: `geo.regionIds[]`, `geo.districtIds[]` (bir nechta bo'lishi mumkin)
- To'rtburchak: `geo.bbox` (xarita ekrani)

`distanceMeters` — **eng yaqin manzilgacha** (PostGIS `ST_Distance`). Ko'p manzilli
e'lon ro'yxatda **bir marta** chiqadi (`EXISTS`, `JOIN` emas).

**Manzilsiz onlayn `TASK` geo-filtr berilganda ham tushib qolmaydi** —
`distanceMeters: null` bilan, ro'yxat oxirida. §7.2.3 dagi talab.

### 5.4 Saralash

`RELEVANCE` | `NEWEST` | `PRICE_ASC` | `PRICE_DESC` | `NEAREST` | `DEADLINE`

- Har bir saralash `id DESC` bilan tugaydi → sahifalar orasida sakrash yo'q.
- `NEAREST` koordinatasiz so'ralsa — **xato emas**, `NEWEST` ga tushadi.
- `RELEVANCE` hozircha `NEWEST` (universitet reytingi Faza 2 da).

### 5.5 Sahifalash — ikkala rejim

**Kursorli (asosiy, cheksiz skroll):**

```jsonc
// so'rov
"page": { "size": 20, "cursor": null }
// javob
{ "items": [...], "size": 20, "hasNext": true,
  "nextCursor": "eyJzb3J0…", "page": null, "total": null }
```

**Sahifa raqamli ("N-sahifaga o'tish"):**

```jsonc
// so'rov
"page": { "size": 20, "number": 2 }
// javob
{ "items": [...], "size": 20, "hasNext": true,
  "nextCursor": null, "page": 2, "total": 137 }
```

- `size` odatiy 20, maksimal **50** (kattasi qisqartiriladi, xato emas).
- Chegaradan oshgan sahifa → bo'sh `items`, `hasNext: false`.
- `total` faqat sahifa raqamli rejimda hisoblanadi — kursorli rejimda `COUNT(*)`
  eng qimmat qism bo'lardi va cheksiz skroll uni ko'rsatmaydi.
- **Filtr yoki `sort` o'zgargan kursor** → `422 PAGE_CURSOR_INVALID`,
  birinchi sahifadan boshlang.
- Ikkalasi birga kelsa **`cursor` ustun turadi**.

### 5.6 Kimga ko'rinadi (§7.2.0 — hammasi bajarildi)

Ro'yxatga faqat quyidagilar tushadi: `status = ACTIVE` · muddat ichida ·
`TASK` da `deadline` o'tmagan · egasi bloklanmagan · so'rovchi bilan **ikki
tomonlama** blok yo'q.

- O'z e'loningiz ro'yxatda chiqadi, `isMine: true` bilan.
- `GET /{id}` — begona odamga ko'rinmaydigan e'lon **`404`** (403 emas: e'lon
  borligini ham bilmasligi kerak).
- `contactPhone` **faqat `ACTIVE` e'londa** qaytadi, aks holda `null`.
- `viewsCount` faqat begona ochganda va **bir foydalanuvchi uchun 24 soatda
  1 marta** oshadi.

---

## 6. Sizdan kerak bo'lgan narsalar

1. **`ServiceCatalog.kt`** — `SERVICE` ning `fields.subject` va sohaga xos
   `required` maydonlarini tekshirish uchun (§5.5 ning 2–4-qatorlari). Hozircha
   `subject` qanday kelsa shunday saqlanadi, rad etilmaydi. `serviceType` esa
   tekshiriladi.

2. **`GeoCatalog.kt`** — bizdagi seed'da **14 viloyat** (mos ✅) lekin
   **210 tuman**, sizda 193. Ro'yxatingizni yuboring: bizniki ustki to'plammi yoki
   ba'zi slug'lar farq qiladimi? Slug farq qilsa saqlangan manzil filtrdan tushib
   qoladi. `GET /v1/regions` va `GET /v1/districts` allaqachon ASCII slug qaytaradi
   (`TOSHKENT_SHAHRI`, `MIRZO_ULUGBEK`).

3. **Yo'l o'zgarishi** — §1. `student-club.json` yangilanishi kerak.

4. **§10 Q4 (`apply` / `applicationsCount`)** — qilinmadi. Hozircha chat va telefon.
   Kerak bo'lsa alohida kelishamiz.

---

## 7. Faza 2 (kelishilgan holda qoldirilgan)

| Nima | Nima uchun keyinga |
|---|---|
| Universitet §7.2.4 — `universities` jadvali, `university_neighbors`, `audience` amalda, `RELEVANCE` reytingi | Koordinatali OTM ro'yxati kerak. Hozir `universityId` saqlanadi lekin tekshirilmaydi; `audience` ustuni bor lekin hamma e'lon `ALL` kabi ishlaydi; `universityRelation` — `null` |
| `GET /listings/catalog` §7.3 | Kataloglar hozircha klientda; kalitlar backendda tekshiriladi |
| Chat: `POST /v1/conversations` ga `listingId`, `Connections` ni chetlab o'tish §7.5 | Alohida ish |
| Sevimlilar, `POST /search/map` klasterlari, `POST /suggest` | Alohida ish |

> **Muhim:** `audience` hozir amalda emas. Ilova `MY_UNIVERSITY` yoki
> `NEARBY_UNIVERSITIES` yubormaslikni davom ettirsin — aks holda e'lon egasi
> mo'ljallaganidan **kengroq** ko'rinadi. Faza 2 da amalga oshiriladi.

---

## 8. Xatolar

| `error.code` | HTTP | Qachon |
|---|---|---|
| `LISTING_VALIDATION_FAILED` | 422 | §5 buzilgan (`fields` to'ldiriladi) |
| `LISTING_KIND_MISMATCH` | 422 | `details.kind != kind` |
| `LISTING_KIND_IMMUTABLE` | 409 | `PATCH` da `kind` o'zgartirilmoqchi |
| `LISTING_NOT_FOUND` | 404 | Yo'q, o'chirilgan yoki sizga ko'rinmaydi |
| `LISTING_FORBIDDEN` | 403 | Egasi emas (yozish amallarida) |
| `LISTING_STATUS_INVALID` | 409 | Ruxsat etilmagan status o'tishi |
| `LISTING_LIMIT_REACHED` | 429 | Faol e'lon yoki kunlik limit |
| `LISTING_DUPLICATE` | 409 | 24 soatda bir xil e'lon |
| `CATALOG_KEY_UNKNOWN` | 422 | Noma'lum katalog kaliti |
| `PAGE_CURSOR_INVALID` | 422 | Kursor eskirgan |
| `GEO_OUT_OF_BOUNDS` | 422 | Koordinata O'zbekistondan tashqarida |

Hammasi `BaseResponse` konvertida, `message` — o'zbekcha.

---

## 9. Kichik texnik izohlar

- **`Idempotency-Key`** sarlavhasi qo'llab-quvvatlanadi. Takroriy so'rov
  o'sha e'lonni qaytaradi, dublikat yaratmaydi. Sarlavha nomi katta-kichik
  harfga sezgir emas.
- **Narx** — butun so'm, JSON'da `integer` (Kotlin'da `Long`/`Int`, `Double` emas).
- **Sana** — ISO-8601 UTC string.
- **`PriceUnit`** — talaba e'lonlari uchun alohida enum (11 qiymat, `PER_DAY` va
  `PER_PAGE` bilan). Wire qiymatlari bir xil, shuning uchun sizga farqi yo'q;
  biznes tomonining kontrakti kengaymasligi uchun shunday qilindi.
- **Rasm** — mavjud `POST /v1/media/upload`, `purpose=LISTING` allaqachon qabul
  qilinadi. EXIF (GPS ham) tozalanadi, havola `PUBLIC_MEDIA_BASE_URL` dan quriladi.
- **`branches[].regionId`/`districtId`** hozircha `regions`/`districts` jadvaliga
  qarab tekshirilmaydi (2-band hal bo'lgach qo'shiladi). Koordinata esa
  O'zbekiston chegarasi bo'yicha tekshiriladi.
