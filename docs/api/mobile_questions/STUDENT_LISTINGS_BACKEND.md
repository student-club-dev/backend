# Talaba e'lonlari — "E'lon yaratish" (Backend spetsifikatsiyasi)

Bu hujjat **Student Club** ilovasidagi **"E'lon yaratish"** oqimining backend qismini
tavsiflaydi. E'lonni **talabaning o'zi** qo'yadi (biznes emas) va u to'rt turda bo'ladi:

| Tur (`kind`) | UI nomi | Mazmuni |
|---|---|---|
| `TASK` | 📚 Fanlardan yordam | Bir martalik topshiriq **so'rovi**: "12 ta masala, ertaga 18:00 gacha" |
| `RENTAL` | 🏠 Ijara — turarjoy | Kvartira/xona/koyka, ko'pincha **sherik izlash** |
| `SERVICE` | 🛠️ Xizmatlar | Doimiy **taklif**: repetitor, chop etish, dizayn, ta'mirlash |
| `JOB` | 💼 Ish e'loni | Kunlik yoki doimiy ish o'rni |

> **Beshinchi tur — `DISCOUNT` (biznes chegirmasi) — bu hujjatga KIRMAYDI.** U
> `DISCOUNTS_BUSINESS_API.md` da alohida tavsiflangan. Bu yerdagi to'rt turning egasi
> biznes emas, **talabaning o'zi**.

> ⚠️ **Backendda bu modul bo'yicha hech narsa yo'q — noldan quriladi:** jadval ham,
> endpoint ham, katalog ham. Mavjud kodga bog'lanish shart emas; faqat ikkita narsa
> qayta ishlatiladi — **javob konverti** (`BaseResponseDto`) va **rasm yuklash**
> (`POST /v1/media/upload`).
>
> **Asosiy ikki vazifa:**
> 1. **E'lonni qabul qilish** — `POST /v1/listings` (yaratish, qoralama, moderatsiyaga
>    yuborish, tahrirlash) — §5, §7.1.
> 2. **E'lonlarni filtrlar bilan qaytarish** — `POST /v1/listings/search` (tur, narx,
>    joylashuv, turga xos filtrlar, saralash, sahifalash) — §7.2.
>
> Qolgan bo'limlar (moderatsiya, kataloglar, anti-spam) — shu ikkitasini to'g'ri
> ishlatish uchun kerak bo'lgan minimal atrof.

Yakuniy API kontrakti — `dev/api-client-generator/student-club.json` (OpenAPI v1).
**U yagona manba**: Kotlin klienti o'sha yerdan generatsiya qilinadi.

---

## 0. Vazifa (qisqacha prompt)

> Student Club backendiga **talaba e'lonlari** modulini qo'sh. Talaba to'rt turdagi e'lon
> yarata olsin (`TASK`, `RENTAL`, `SERVICE`, `JOB`), uni qoralama sifatida saqlasin,
> moderatsiyaga yuborsin, to'xtatsin/arxivlasin va o'chirsin. Boshqa talabalar bu
> e'lonlarni **tur bo'yicha alohida ro'yxatlarda** ko'rsin, filtrlasin, qidirsin va
> xaritada eng yaqinini topsin. E'lon egasiga chat orqali bog'lanish mumkin bo'lsin.
>
> E'lonning umumiy qismi hamma turda bir xil (sarlavha, rasm, narx, manzil, telefon,
> amal muddati, status), **turga xos qismi** esa `details` obyektida polimorf saqlanadi —
> `kind` ajratgichi bilan. Enum nomlari, katalog kalitlari va validatsiya qoidalari
> quyida **aynan** berilgan: klient allaqachon shu nomlar bilan ishlaydi, ularni
> o'zgartirish ilovani buzadi.

**Klientdagi tayyor manbalar (yagona haqiqat — shulardan ko'chiring):**

| Nima | Fayl |
|---|---|
| Umumiy model, enum'lar | `dev/feature/listings/domain/src/commonMain/kotlin/dev/feature/listings/domain/model/Listing.kt` |
| Turga xos qism (`details`) | `.../model/ListingDetails.kt` |
| Validatsiya qoidalari | `.../model/ListingValidator.kt` |
| Filtrlar | `.../model/ListingFilters.kt` |
| Topshiriq katalogi | `.../model/TaskCatalog.kt` |
| Xizmat katalogi (soha → yo'nalish → maydonlar) | `.../model/ServiceCatalog.kt` |
| Ish katalogi | `.../model/JobCatalog.kt` |
| Ijara katalogi | `.../model/RentalCatalog.kt` |
| Viloyat/tuman | `.../model/GeoCatalog.kt` |
| Saqlanadigan JSON shakli (aynan shu shakl) | `dev/feature/listings/data/.../mapper/ListingMappers.kt` |

---

## 1. Hozirgi holat — hammasi noldan

| Kerak | Backend holati |
|---|---|
| **`listings` jadvali (talaba e'loni)** | ❌ yo'q — §3 dagi migratsiya bilan yaratiladi |
| `kind` (`TASK`/`RENTAL`/`SERVICE`/`JOB`) | ❌ yo'q |
| Turga xos `details` (JSONB) | ❌ yo'q |
| Qoralama saqlash (validatsiyasiz) | ❌ yo'q |
| `POST /v1/listings` — **e'lonni qabul qilish** | ❌ yo'q |
| `POST /v1/listings/search` — **filtrlar bilan olish** | ❌ yo'q |
| Kataloglar (`TaskCatalog`, `ServiceCatalog`...) | ❌ yo'q — hozir klientda hardcode (§7.3) |
| `PriceUnit` da `PER_DAY`, `PER_PAGE` | ❌ **yo'q — qo'shilishi shart** (§2.3) |
| Javob konverti (`BaseResponseDto`) | ✅ bor — qayta ishlatiladi |
| Rasm yuklash (`POST /v1/media/upload`) | ✅ bor — qayta ishlatiladi |
| Viloyat/tuman (`/v1/regions`, `/v1/districts`) | ✅ bor — id'lari `GeoCatalog.kt` bilan mos bo'lsin |

Ilova tomoni **to'liq tayyor**: forma, validator, offline saqlash (SQLDelight), ro'yxat,
filtr, xarita. Hozir `LocalListingRemoteDataSource` ishlaydi (e'lon telefonda qoladi).
Backend tayyor bo'lgach `ApiListingRemoteDataSource` yoqiladi va **ilova kodi o'zgarmaydi** —
shuning uchun enum nomlari va katalog kalitlari aynan mos bo'lishi kerak.

**Ishni shu tartibda bajarish tavsiya etiladi:**

1. §3 migratsiyasi (`listings` + `listing_branches`).
2. `POST /v1/listings` + `PATCH` + `POST /submit` — qabul qilish va validatsiya (§5).
3. `POST /v1/listings/search` + `GET /v1/listings/{id}` + `GET /v1/listings/mine` — filtrlar (§7.2).
4. Status cron'i (`EXPIRED`), anti-spam limitlari (§6).
5. Kataloglar endpoint'i (§7.3) — oxirida, chunki klientda hozircha o'z nusxasi bor.

Ilova tomoni **to'liq tayyor**: forma, validator, offline saqlash (SQLDelight), ro'yxat,
filtr, xarita. Hozir `LocalListingRemoteDataSource` ishlaydi (e'lon telefonda qoladi).
Backend tayyor bo'lgach `ApiListingRemoteDataSource` yoqiladi va **ilova kodi o'zgarmaydi** —
shuning uchun nomlar aynan mos bo'lishi kerak.

---

## 2. Modellar

### 2.1 Umumiy javob konverti

Hamma endpoint mavjud konvertni ishlatadi (`BaseResponseDto`):

```jsonc
{ "success": true, "status": 200, "code": null, "message": "OK",
  "result": <payload>, "error": null }
```

Pul — **butun so'm** (tiyinsiz), `currency: "UZS"`. Sana/vaqt — **ISO-8601 UTC**
(`2026-08-14T18:00:00Z`). Klient ichida epoch millis ishlatiladi, konvertatsiya mapperda.

### 2.2 `StudentListingDto` — umumiy qism

```jsonc
{
  "id": "lst_01H8XZ...",
  "ownerId": "usr_01H8...",            // server: Bearer token'dan
  "kind": "RENTAL",                     // O'ZGARMAS (yaratilgandan keyin tahrirlanmaydi)
  "title": "Chilonzorda 3 xonali kvartiraga sherik kerak",
  "description": "Metrodan 5 daqiqa, mebel bor...",
  "images": ["https://cdn.../1.jpg"],   // birinchisi — muqova
  "priceUnit": "PER_MONTH",
  "price": 1500000,                     // butun so'm
  "priceMax": null,                     // oraliq (ish maoshi "3–5 mln") uchun
  "currency": "UZS",
  "isNegotiable": false,                // "kelishilgan holda"
  "contactPhone": "+998901234567",
  "universityId": "univ_tatu",          // §7.2.4 — odatiy: egasining universiteti
  "audience": "ALL",                    // ALL | NEARBY_UNIVERSITIES | MY_UNIVERSITY
  "branches": [ /* §2.4 */ ],
  "validFrom": "2026-08-01T00:00:00Z",
  "validTo":   "2026-09-01T00:00:00Z",
  "attributes": { },                    // erkin string→string
  "optionGroups": [ ],                  // §2.5 — asosan SERVICE uchun
  "details": { "kind": "RENTAL", "...": "..." },  // §4
  "status": "ACTIVE",
  "rejectionReason": null,
  "viewsCount": 128,
  "createdAt": "2026-07-30T09:12:00Z",
  "updatedAt": "2026-07-30T09:12:00Z",

  // — faqat o'qishda (ro'yxat/detal javobida) —
  "owner": { "id": "usr_...", "name": "Aziz", "avatarUrl": "...", "universityName": "TATU" },
  "distanceMeters": 640,                // so'rovda lat/lng berilgan bo'lsa
  "isMine": false,                      // so'rovchi — egasimi (§7.2.0)
  "isFavorite": false
}
```

| Maydon | Tur | Majburiy | Izoh |
|---|---|---|---|
| `id` | string | server | ULID |
| `ownerId` | string | server | Token'dan; **klient yuborgan qiymat e'tiborsiz qoldiriladi** |
| `kind` | `ListingKind` | ✅ | Yaratishda beriladi, keyin **o'zgarmaydi** |
| `title` | string(3..120) | ✅ | |
| `description` | string(0..2000) | ❌ | `TASK` da ✅ (topshiriq sharti) |
| `images` | string[] | ≤5 | `RENTAL`/`SERVICE` da kamida 1 ta; `JOB`/`TASK` da ixtiyoriy |
| `priceUnit` | `PriceUnit` | ✅ | §2.3 |
| `price` | int64 ≥ 0 | ✅* | `isNegotiable = true` bo'lsa 0 bo'lishi mumkin |
| `priceMax` | int64 | ❌ | Berilsa `> price` bo'lsin |
| `isNegotiable` | bool | ❌ | |
| `contactPhone` | string | ✅ | E.164 (`+998XXXXXXXXX`) |
| `branches` | `ListingBranch[]` | shartli | §2.4 va §5 |
| `validFrom`/`validTo` | date-time | ✅ | `validTo > validFrom`, ko'pi bilan +1 yil |
| `details` | polimorf | ✅ | §4 |
| `status` | `ListingStatus` | server | §6 |
| `viewsCount` | int | server | |

### 2.3 Enum'lar (aynan shu nomlar)

```
ListingKind:      DISCOUNT | RENTAL | SERVICE | JOB | TASK

ListingStatus:    DRAFT | PENDING_REVIEW | REJECTED | SCHEDULED | ACTIVE
                  | PAUSED | EXPIRED | SOLD_OUT | ARCHIVED

PriceUnit:        PER_ITEM | PER_HOUR | PER_KG | PER_DAY | PER_MONTH | PER_COURSE
                  | PER_LESSON | PER_TICKET | PER_PERSON | PER_SESSION | PER_PAGE
                  ⚠️ OpenAPI'dagi PriceUnitDto da PER_DAY va PER_PAGE YO'Q — qo'shilsin
                     (ijara kunlik narxi va chop etish "sahifasiga" narxi shularsiz ifodalanmaydi)

TenantGender:     MALE | FEMALE | ANY          // ijarada majburiy, ishda ixtiyoriy
PropertyType:     APARTMENT | ROOM | HOUSE | DORMITORY | BED_SPACE
RentPeriod:       MONTHLY | DAILY

ServiceType:      TUTOR | PRINTING | IT_DEV | DESIGN | PHOTO_VIDEO | TRANSLATION
                  | REPAIR | BEAUTY | TRANSPORT | EVENT | CLEANING | OTHER
ServiceFormat:    OFFLINE | ONLINE | HYBRID

EmploymentType:   DAILY | PERMANENT
WorkShift:        MORNING | DAY | EVENING | NIGHT | SHIFT_2_2 | SHIFT_1_2 | FLEXIBLE
PayPeriod:        HOURLY | DAILY | WEEKLY | MONTHLY | PER_TASK
ExperienceLevel:  NONE | LESS_THAN_YEAR | ONE_TO_THREE | MORE_THAN_THREE
WeekDay:          MONDAY | TUESDAY | WEDNESDAY | THURSDAY | FRIDAY | SATURDAY | SUNDAY

TaskCategory:     WRITTEN | PRESENTATION | EXACT | IT | DRAWING | HANDWRITING
                  | TRANSLATION | CALC
TaskFormat:       ONLINE | IN_PERSON | ANY

SelectionType:    SINGLE | MULTIPLE
```

### 2.4 `ListingBranch` — manzil

Manzil **xaritada tanlangan nuqta**, shuning uchun koordinata majburiy:

```jsonc
{
  "id": "br_01H8...",
  "lat": 41.2856, "lng": 69.2034,
  "address": "Chilonzor 9-kvartal, 42-uy",   // teskari geokodlashdan avtomatik
  "name": "Chilonzor filiali",               // ixtiyoriy
  "landmark": "Korzinka ro'parasida",        // ixtiyoriy
  "regionId": "TOSHKENT_SHAHRI",             // GeoCatalog id'lari
  "districtId": "CHILONZOR"
}
```

- `lat ∈ [37.0, 46.0]`, `lng ∈ [55.0, 74.0]` (O'zbekiston chegarasi) — tashqarisi rad etiladi.
- Bitta e'londa ≤ **20** manzil.
- Ikki manzil orasidagi masofa < **100 m** bo'lsa — dublikat, rad etiladi.
- `regionId`/`districtId` — `GeoCatalog.kt` dagi ASCII slug'lar (`MIRZO_ULUGBEK`).
  Backend `GET /v1/regions`/`/v1/districts` da **aynan shu id'larni** qaytarishi shart.
- Masofa hisobi PostGIS (`ST_DistanceSphere`) bilan; klientda ekvivalent haversine bor.

### 2.5 `OptionGroup` — qo'shimchalar

Asosan `SERVICE` uchun ("Dars davomiyligi: 60 daq +0 / 90 daq +30 000"):

```jsonc
{ "name": "Dars davomiyligi", "selectionType": "SINGLE", "isRequired": true,
  "options": [ { "name": "60 daqiqa", "priceDelta": 0, "isAvailable": true },
               { "name": "90 daqiqa", "priceDelta": 30000, "isAvailable": true } ] }
```

Limitlar: ≤ **10** guruh, har guruhda ≤ **30** variant, guruh nomi bo'sh emas,
har guruhda kamida 1 variant. `priceDelta` manfiy ham bo'lishi mumkin.

---

## 3. Ma'lumotlar bazasi (noldan)

Bu jadvallar hali yo'q — birinchi migratsiya aynan shu. Mavjud biznes/chegirma
jadvallariga bog'lanish shart emas: yagona tashqi kalit — `users(id)`.

`details` ni **JSONB** ustunda saqlash tavsiya etiladi — har yangi tur qo'shilganda sxema
o'zgarmaydi (klient ham aynan shunday qiladi):

```sql
CREATE TABLE listings (
    id              TEXT PRIMARY KEY,
    owner_id        TEXT NOT NULL REFERENCES users(id),
    kind            TEXT NOT NULL,                          -- ListingKind
    title           TEXT NOT NULL,
    description     TEXT NULL,
    images          JSONB NOT NULL DEFAULT '[]',
    price_unit      TEXT NOT NULL,
    price           BIGINT NOT NULL DEFAULT 0,
    price_max       BIGINT NULL,
    currency        TEXT NOT NULL DEFAULT 'UZS',
    is_negotiable   BOOLEAN NOT NULL DEFAULT FALSE,
    final_price     BIGINT NOT NULL,        -- saralash uchun oldindan hisoblangan
    contact_phone   TEXT NULL,
    university_id   TEXT NULL REFERENCES universities(id),  -- §7.2.4
    audience        TEXT NOT NULL DEFAULT 'ALL',            -- ALL | NEARBY_UNIVERSITIES | MY_UNIVERSITY
    valid_from      TIMESTAMPTZ NOT NULL,
    valid_to        TIMESTAMPTZ NOT NULL,
    attributes      JSONB NOT NULL DEFAULT '{}',
    option_groups   JSONB NOT NULL DEFAULT '[]',
    details         JSONB NOT NULL,          -- §4, ichida "kind" ajratgichi
    status          TEXT NOT NULL DEFAULT 'DRAFT',
    rejection_reason TEXT NULL,
    views_count     INTEGER NOT NULL DEFAULT 0,
    search_vector   tsvector,                -- title + description + katalog yorliqlari
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE listing_branches (
    id          TEXT PRIMARY KEY,
    listing_id  TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    geom        geography(Point, 4326) NOT NULL,
    address     TEXT NOT NULL,
    name        TEXT NULL,
    landmark    TEXT NULL,
    region_id   TEXT NULL,
    district_id TEXT NULL
);

CREATE INDEX ON listings (kind, status, valid_to DESC);
CREATE INDEX ON listings (owner_id, updated_at DESC);
CREATE INDEX ON listings (university_id, kind, status);
CREATE INDEX ON listings USING GIN (details jsonb_path_ops);
CREATE INDEX ON listings USING GIN (search_vector);
CREATE INDEX ON listing_branches USING GIST (geom);
```

**Muhim indekslar** — filtrlar aynan `details` ichidagi maydonlar bo'yicha ishlaydi,
shuning uchun eng ko'p ishlatiladiganlarga generated column + b-tree qo'yilsin:

```sql
ALTER TABLE listings
  ADD COLUMN rental_gender TEXT GENERATED ALWAYS AS (details->>'gender') STORED,
  ADD COLUMN job_category  TEXT GENERATED ALWAYS AS (details->>'categoryKey') STORED,
  ADD COLUMN task_deadline TIMESTAMPTZ GENERATED ALWAYS AS ((details->>'deadline')::timestamptz) STORED;
```

---

## 4. Turga xos qism — `details`

`details` **polimorf**: ajratgich maydoni — `kind` (klientdagi `classDiscriminator = "kind"`
bilan bir xil). Ya'ni `details.kind` doim tashqi `listing.kind` ga teng bo'ladi;
mos kelmasa — `422 LISTING_KIND_MISMATCH`.

### 4.1 `TASK` — Fanlardan yordam

Talaba **bajarilishi kerak bo'lgan ishni** e'lon qiladi (so'rov, taklif emas).

```jsonc
"details": {
  "kind": "TASK",
  "category": "WRITTEN",          // TaskCategory — MAJBURIY
  "typeKey": "REFERAT",           // kategoriya ichidagi tur — MAJBURIY
  "customTypeName": null,         // typeKey = "OTHER" bo'lsa MAJBURIY
  "deadline": "2026-08-14T18:00:00Z",  // MAJBURIY, hozirdan keyin
  "format": "ONLINE",             // TaskFormat
  "volume": "20 bet"              // ixtiyoriy, lekin juda foydali
}
```

**Kategoriya → tur kalitlari** (har kategoriyada qo'shimcha `OTHER` = "Boshqa"):

| `category` | `typeKey` lar |
|---|---|
| `WRITTEN` — Yozma ishlar | `REFERAT`, `MUSTAQIL`, `KURS`, `DIPLOM`, `MAGISTR`, `TAQRIZ` |
| `PRESENTATION` — Prezentatsiya | `SLIDES`, `POSTER` |
| `EXACT` — Aniq fanlar | `MATH`, `PHYSICS`, `CHEMISTRY`, `STATS` |
| `IT` — Dasturlash va IT | `WEB`, `CODE`, `SQL`, `CODE_REPORT` |
| `DRAWING` — Chizmachilik | `CAD`, `MAP`, `DIAGRAM` |
| `HANDWRITING` — Qo'lyozma | `HW_TEXT`, `HW_DIARY` |
| `TRANSLATION` — Tarjima | `ARTICLE`, `ANNOTATION` |
| `CALC` — Hisob-kitob | `GPA`, `DOCX`, `BIBLIO` |

To'liq yorliqlar — `TaskCatalog.kt`. Backend seed'i **aynan shu kalitlarni** yozsin.

### 4.2 `RENTAL` — Ijara, turarjoy

```jsonc
"details": {
  "kind": "RENTAL",
  "propertyType": "APARTMENT",    // MAJBURIY
  "roomCount": 3,                 // MAJBURIY, 1..20
  "currentTenants": 2,            // MAJBURIY, 0..30 (0 — uy bo'sh)
  "neededTenants": 2,             // MAJBURIY, 1..30
  "gender": "MALE",               // MAJBURIY — talaba uchun birinchi filtr
  "period": "MONTHLY",            // RentPeriod
  "utilitiesIncluded": false,
  "depositMonths": 1,             // null — depozit yo'q
  "floor": 4, "totalFloors": 9,
  "amenities": ["WIFI", "FURNITURE", "NEAR_METRO"],
  "availableFrom": "2026-08-15T00:00:00Z"   // null — hoziroq
}
```

**Qulaylik kalitlari (`amenities`):** `WIFI`, `FURNITURE`, `CONDITIONER`, `WASHER`,
`FRIDGE`, `KITCHEN`, `HOT_WATER`, `HEATING`, `SEPARATE_ROOM`, `BALCONY`, `PARKING`,
`ELEVATOR`, `NEAR_METRO`, `NEAR_UNIVERSITY`.

### 4.3 `SERVICE` — Xizmatlar

Xizmat sohalari o'sib boradi, shuning uchun **sohaga xos maydonlar kodda emas,
katalogda**: forma spetsifikatsiyadan dinamik quriladi, qiymatlar `fields` ga tushadi.

```jsonc
"details": {
  "kind": "SERVICE",
  "serviceType": "TUTOR",          // MAJBURIY
  "fields": {                      // string → string
    "subject": "IELTS",            // yo'nalish — hasSubjects=true bo'lgan sohalarda MAJBURIY
    "customSubject": null,         // subject = "OTHER" bo'lsa MAJBURIY
    "level": "Talaba",
    "lessonMode": "Yakka tartibda",
    "lessonMinutes": "60",
    "targetBand": "7.0"            // yo'nalishga xos maydon (IELTS)
  },
  "format": "OFFLINE",             // ServiceFormat
  "experienceYears": 3,            // 0..60
  "workingHours": "09:00 — 21:00",
  "hasHomeVisit": false,
  "hasFreeTrial": true             // "birinchi dars bepul" — talabalar filtri
}
```

Sohalarning yo'nalishlari va maydonlari (`AttributeSpec`: `key`, `label`, `kind`,
`options`, `required`, `hint`, `suffix`) — **`ServiceCatalog.kt` dan bir-bir ko'chirilsin**.
Hajmi: 12 soha, ~90 yo'nalish, ~60 maydon. Maydon turlari: `TEXT`, `NUMBER`, `BOOLEAN`,
`SELECT`, `TAGS` (vergul bilan ajratilgan ro'yxat).

`OTHER` sohasida `serviceName` maydoni majburiy.

### 4.4 `JOB` — Ish e'loni

```jsonc
"details": {
  "kind": "JOB",
  "employment": "DAILY",           // EmploymentType
  "categoryKey": "COURIER",        // MAJBURIY
  "companyName": "Express Delivery", // MAJBURIY
  "shift": "MORNING",              // MAJBURIY
  "schedule": {
    "days": ["MONDAY", "TUESDAY"], // PERMANENT da MAJBURIY (§5.5 dagi istisnolardan tashqari)
    "startTime": "08:00",          // "HH:mm" matn
    "endTime": "17:00",
    "hoursPerDay": 8               // 1..24
  },
  "payPeriod": "DAILY",            // PayPeriod
  "vacancies": 3,                  // MAJBURIY, 1..100
  "gender": null,                  // TenantGender, null — farqi yo'q
  "experience": "NONE",            // ExperienceLevel
  "ageFrom": 18, "ageTo": 30,
  "requirements": ["Haydovchilik guvohnomasi"],
  "benefits": ["Tushlik bepul"],
  "workDate": "2026-08-05T00:00:00Z",   // DAILY da MAJBURIY, PERMANENT da null
  "payoutNote": "Ish kuni oxirida"
}
```

**Ish kategoriyalari (`categoryKey`):** `COURIER`, `WAITER`, `BARISTA`, `COOK_HELPER`,
`CASHIER`, `SALES`, `PROMOTER`, `CALL_CENTER`, `LOADER`, `WAREHOUSE`, `CLEANER`,
`ANIMATOR`, `TUTOR_JOB`, `ADMIN`, `SMM`, `IT`, `DESIGNER`, `DRIVER`, `SECURITY`,
`BUILDER`, `OTHER`.

Ish turiga bog'liq cheklovlar:

- `DAILY` da mumkin bo'lgan smenalar: `MORNING`, `DAY`, `EVENING`, `NIGHT`, `FLEXIBLE`
  (`SHIFT_2_2`/`SHIFT_1_2` — faqat `PERMANENT`).
- `DAILY` uchun `payPeriod ∈ {DAILY, HOURLY, PER_TASK}`;
  `PERMANENT` uchun `{MONTHLY, DAILY, HOURLY, WEEKLY}`.
- `payPeriod` → `priceUnit` mosligi: `HOURLY→PER_HOUR`, `DAILY|WEEKLY→PER_DAY`,
  `MONTHLY→PER_MONTH`, `PER_TASK→PER_ITEM`.

---

## 5. Validatsiya (publish paytida)

Klientda `ListingValidator.kt` **aynan shu qoidalarni** tekshiradi, lekin backend
**mustaqil ravishda qaytadan tekshirishi shart** — klientga ishonib bo'lmaydi.

Xatolar `422` bilan qaytadi va `error.fields` ichida **maydon kaliti → xabar** bo'ladi.
Kalitlar klientdagi `ListingField` enum'i bilan bir xil bo'lsin, shunda ilova xatoni
kerakli maydon ostida ko'rsatadi:

```
TITLE, IMAGES, PRICE, LOCATION, VALIDITY, CONTACT, ATTRIBUTES, OPTIONS, CATEGORY,
PROPERTY_TYPE, ROOMS, TENANTS, GENDER,
SERVICE_TYPE, SERVICE_SUBJECT,
TASK_SUBJECT, TASK_BRIEF, TASK_DEADLINE,
JOB_CATEGORY, JOB_SHIFT, JOB_SCHEDULE, JOB_PAY, BUSINESS_NAME
```

```jsonc
{ "success": false, "status": 422, "message": "E'lonni tekshiring",
  "error": { "code": "LISTING_VALIDATION_FAILED", "message": "E'lonni tekshiring",
    "fields": {
      "GENDER": "Kim uchun ekanini tanlang — qiz yoki o'g'il",
      "TASK_DEADLINE": "Muddat hozirgi vaqtdan keyin bo'lsin"
    } } }
```

### 5.1 Umumiy (hamma tur)

| Qoida | Xabar |
|---|---|
| `title` bo'sh emas | "Sarlavhani kiriting" |
| `title.length ≥ 3` | "Sarlavha juda qisqa" |
| `title.length ≤ 120` | "Sarlavha 120 belgidan oshmasin" |
| `RENTAL`/`SERVICE` da `images ≥ 1` | "Kamida 1 ta rasm qo'shing" |
| `images ≤ 5` | "Maksimal 5 ta rasm" |
| `price > 0` yoki `isNegotiable` | "Narxni kiriting yoki \"kelishilgan\" ni belgilang" |
| `priceMax > price` (berilsa) | "Yuqori chegara quyi chegaradan katta bo'lsin" |
| `contactPhone` bo'sh emas | "Telefon raqamini kiriting" |
| `validTo > validFrom` | "Tugash sanasi boshlanishdan keyin bo'lsin" |
| Manzil (§5.2) | pastda |
| Qo'shimchalar: ≤10 guruh, guruh nomi bor, har guruhda 1..30 variant | — |

> `JOB` va `TASK` da rasm **majburiy emas**: ish o'rnining surati odatda bo'lmaydi,
> topshiriqda shart matn bilan beriladi.

### 5.2 Manzil

- Kamida 1 ta manzil majburiy — **`TASK` dan tashqari**: `format != IN_PERSON` bo'lsa
  manzil umuman so'ralmaydi (onlayn topshiriqning joyi yo'q).
- Bo'sh bo'lsa xabar turga qarab: `RENTAL` → "Uy joyini xaritadan belgilang",
  `SERVICE` → "Xizmat ko'rsatiladigan joyni xaritadan belgilang",
  `JOB` → "Ish joyini xaritadan belgilang",
  `TASK` → "Ish topshiriladigan joyni xaritadan belgilang".
- Koordinata O'zbekistondan tashqarida → "Nuqta O'zbekiston hududidan tashqarida".
- Ikki manzil 100 m dan yaqin → "Ikkita manzil bir joyda belgilangan".

### 5.3 `TASK`

| Qoida | Maydon | Xabar |
|---|---|---|
| `category != null` | `TASK_SUBJECT` | "Ish yo'nalishini tanlang" |
| `typeKey` bo'sh emas | `TASK_SUBJECT` | "Ish turini tanlang" |
| `typeKey = OTHER` → `customTypeName` bor | `TASK_SUBJECT` | "Ish turini yozing" |
| `description` bo'sh emas | `TASK_BRIEF` | "Topshiriq shartini yozing" |
| `deadline != null` | `TASK_DEADLINE` | "Topshirish muddatini belgilang" |
| `deadline > now` | `TASK_DEADLINE` | "Muddat hozirgi vaqtdan keyin bo'lsin" |

### 5.4 `RENTAL`

| Qoida | Maydon | Xabar |
|---|---|---|
| `propertyType != null` | `PROPERTY_TYPE` | "Turarjoy turini tanlang" |
| `roomCount ∈ 1..20` | `ROOMS` | "Nechi xonaligini kiriting" / "Xonalar soni 1 dan 20 gacha bo'lsin" |
| `currentTenants ∈ 0..30` | `TENANTS` | "Hozir nechi kishi yashashini kiriting" |
| `neededTenants ∈ 1..30` | `TENANTS` | "Nechi kishi kerakligini kiriting" |
| `currentTenants + neededTenants ≤ roomCount × 4` | `TENANTS` | "{rooms} xonaga {total} kishi ko'p — sonlarni tekshiring" |
| `gender != null` | `GENDER` | "Kim uchun ekanini tanlang — qiz yoki o'g'il" |
| `floor ≤ totalFloors` | `ATTRIBUTES` | "Qavat binoning qavatlar sonidan katta" |

### 5.5 `SERVICE`

| Qoida | Maydon | Xabar |
|---|---|---|
| `serviceType != null` | `SERVICE_TYPE` | "Xizmat sohasini tanlang" (tanlanmagan bo'lsa qolgan tekshiruvlar o'tkazilmaydi) |
| Soha `hasSubjects` bo'lsa `fields.subject` bor | `SERVICE_SUBJECT` | "{Fan yoki yo'nalish}ni tanlang" |
| `subject = OTHER` → `fields.customSubject` bor | `SERVICE_SUBJECT` | "\"Boshqa\" tanlandi — nomini yozing" |
| Katalogdagi `required = true` maydonlar to'ldirilgan (soha + yo'nalish) | `ATTRIBUTES` | "\"{label}\" to'ldirilmagan" |
| `experienceYears ∈ 0..60` | `ATTRIBUTES` | "Tajriba yillari noto'g'ri" |

### 5.6 `JOB`

| Qoida | Maydon | Xabar |
|---|---|---|
| `categoryKey` bo'sh emas | `JOB_CATEGORY` | "Ish turini tanlang" |
| `companyName` bo'sh emas | `BUSINESS_NAME` | "Tashkilot yoki ish beruvchi nomini kiriting" |
| `shift != null` | `JOB_SHIFT` | "Ish smenasini tanlang" |
| `shift != FLEXIBLE` → `startTime` va `endTime` bor | `JOB_SCHEDULE` | "Ish vaqti oralig'ini kiriting" |
| `DAILY` → `workDate != null` | `JOB_SCHEDULE` | "Ish qaysi kuni ekanini belgilang" |
| `PERMANENT` → `schedule.days` bo'sh emas (`SHIFT_2_2`, `SHIFT_1_2`, `FLEXIBLE` dan tashqari) | `JOB_SCHEDULE` | "Ish kunlarini tanlang" |
| `hoursPerDay ∈ 1..24` | `JOB_SCHEDULE` | "Kunlik soat 1 dan 24 gacha bo'lsin" |
| `vacancies ∈ 1..100` | `JOB_PAY` | "Nechta odam kerakligini kiriting" |
| `ageFrom ≤ ageTo` | `ATTRIBUTES` | "Yosh oralig'i noto'g'ri" |

---

## 6. Status oqimi va moderatsiya

```
DRAFT ──submit──> PENDING_REVIEW ──approve──> ACTIVE ⇄ PAUSED
                        │                        │
                        └──reject──> REJECTED    ├── validTo o'tdi ──> EXPIRED
                                                 └── owner ──> ARCHIVED
                        SCHEDULED — validFrom kelajakda bo'lsa, keyin ACTIVE
```

Qoidalar:

1. **`DRAFT` validatsiyasiz saqlanadi.** Yarim to'ldirilgan forma ham saqlanishi kerak —
   faqat `kind` va `title` (bo'sh bo'lsa ham) yetarli. Turga xos majburiy maydonlar
   `null` bo'lishi mumkin.
2. `POST /submit` — **to'liq validatsiya** (§5). O'tsa `PENDING_REVIEW`;
   `validFrom > now` bo'lsa tasdiqlangandan keyin `SCHEDULED` → keyin `ACTIVE`.
3. Faqat `ACTIVE` e'lon boshqa talabalarga ko'rinadi.
4. `REJECTED` da `rejectionReason` majburiy to'ldiriladi va ilovada ko'rsatiladi.
   Tahrirlab qayta `submit` qilish mumkin.
5. `EXPIRED` — cron: `valid_to < now()` bo'lgan `ACTIVE` e'lonlar har 10 daqiqada
   `EXPIRED` ga o'tkaziladi. `TASK` uchun qo'shimcha: `deadline < now()` ham `EXPIRED`.
6. `ARCHIVED` va o'chirish — faqat egasi (yoki admin).
7. **Moderatsiya avtomatik bo'lishi mumkin** (birinchi bosqichda): stop-so'zlar,
   telefon/havola tekshiruvi, rasm moderatsiyasi. Muhimi — status oqimi o'zgarmasin,
   shunda keyinchalik qo'lda moderatsiyaga o'tish klientni buzmaydi.

**Anti-spam limitlari (taklif):**

| Limit | Qiymat |
|---|---|
| Bir talabada bir vaqtda faol e'lon | 20 |
| Kuniga `submit` | 10 |
| Bir xil `kind` + `title` + `price` takrori | 24 soat ichida rad etiladi (`LISTING_DUPLICATE`) |
| E'lon amal muddati | ko'pi bilan **90 kun** (`TASK` uchun — `deadline` dan oshmasin) |

---

## 7. Endpoint'lar

Hammasi `Authorization: Bearer <token>` talab qiladi (o'qish uchun ham — ilova faqat
ro'yxatdan o'tgan talabalar uchun).

### 7.1 Yaratish va tahrirlash

| Metod | Yo'l | Vazifa |
|---|---|---|
| `POST` | `/v1/listings` | Yaratish (`DRAFT` yoki darrov `submit`) |
| `PATCH` | `/v1/listings/{id}` | Tahrirlash (`kind` o'zgarmaydi) |
| `POST` | `/v1/listings/{id}/submit` | Moderatsiyaga yuborish (to'liq validatsiya) |
| `POST` | `/v1/listings/{id}/status` | `PAUSED` / `ACTIVE` / `ARCHIVED` |
| `DELETE` | `/v1/listings/{id}` | O'chirish (soft delete) |
| `GET` | `/v1/listings/mine` | O'z e'lonlarim (barcha status va turlar) |
| `GET` | `/v1/listings/{id}` | Bitta e'lon (ko'rish + `viewsCount++`) |

**`POST /v1/listings`** so'rovi:

```jsonc
{
  "kind": "TASK",
  "submit": true,              // false/yo'q — DRAFT bo'lib qoladi, validatsiya yumshoq
  "title": "Matematikadan 12 ta masala yechib berish kerak",
  "description": "Analiz, aniqmas integrallar. Qo'lda yozilgan bo'lsa ham bo'ladi.",
  "images": [],
  "priceUnit": "PER_ITEM",
  "price": 50000,
  "isNegotiable": false,
  "contactPhone": "+998901234567",
  "branches": [],
  "validFrom": "2026-08-01T00:00:00Z",
  "validTo": "2026-08-15T00:00:00Z",
  "details": {
    "kind": "TASK", "category": "EXACT", "typeKey": "MATH",
    "deadline": "2026-08-14T18:00:00Z", "format": "ONLINE", "volume": "12 ta masala"
  }
}
```

Javob — `StudentListingDto` (§2.2), `status`: `DRAFT` yoki `PENDING_REVIEW`.

**`PATCH`** — qisman yangilash. `kind` yuborilsa va mavjudidan farq qilsa →
`409 LISTING_KIND_IMMUTABLE`. `ACTIVE` e'lon tahrirlansa — `PENDING_REVIEW` ga qaytadi
(narx/tavsif kabi "yengil" o'zgarishlar uchun bundan istisno qilish mumkin, lekin
qaror bitta bo'lsin va hujjatlashtirilsin).

**Idempotentlik:** `POST /v1/listings` `Idempotency-Key` sarlavhasini qabul qilsin —
tarmoq uzilganda ilova qayta yuboradi va **dublikat e'lon paydo bo'lmasligi kerak**.

### 7.2 Ro'yxat va qidiruv

#### 7.2.0 Kimga ko'rinadi (ko'rinish qoidalari)

E'lon **hamma talabaga ochiq** — universitet, viloyat yoki do'stlik bo'yicha cheklov
**yo'q**. Lekin faqat quyidagi shartlarning **hammasi** bajarilganda ro'yxatga tushadi:

| Shart | Izoh |
|---|---|
| `status = ACTIVE` | `DRAFT`, `PENDING_REVIEW`, `REJECTED`, `PAUSED`, `EXPIRED`, `ARCHIVED` — **faqat egasiga** (`GET /v1/listings/mine`) |
| `validFrom ≤ now < validTo` | Muddati o'tgani chiqmaydi |
| `TASK` uchun `deadline > now` | Muddati o'tgan topshiriq bajaruvchi uchun foydasiz |
| Egasi bloklanmagan/o'chirilmagan | Ban olgan foydalanuvchi e'lonlari darrov yashiriladi |
| So'rovchi bilan o'zaro blok yo'q | `blocks` jadvali: bloklangan foydalanuvchining e'loni ko'rinmasin (ikki tomonlama) |
| `audience` doirasiga tushadi | `ALL` — hammaga; `NEARBY_UNIVERSITIES` / `MY_UNIVERSITY` — §7.2.4 |

Qo'shimcha:

- **O'z e'loning umumiy ro'yxatda ham chiqadi**, lekin javobda `isMine: true` bo'ladi —
  ilova unga "Bog'lanish" o'rniga "Tahrirlash" tugmasini ko'rsatadi.
- `GET /v1/listings/{id}` — **`ACTIVE` bo'lmagan e'lon egasidan boshqasiga `404`**
  (`403` emas: begona odam e'lon borligini ham bilmasligi kerak).
- Ko'rish soni (`viewsCount`) faqat begona foydalanuvchi ochganda oshsin va bir
  foydalanuvchi uchun 24 soatda 1 marta sanalsin.
- `contactPhone` faqat `ACTIVE` e'londa qaytariladi — arxivlangan e'londan raqam
  yig'ib olinmasin.

#### 7.2.1 Qidiruv so'rovi

```
POST /v1/listings/search
```

```jsonc
{
  "kind": "RENTAL",                 // MAJBURIY — turlar aralashmaydi
  "query": "Chilonzor",             // sarlavha, tavsif, manzil, katalog yorliqlari bo'ylab
  "geo": {                          // §7.2.3 — hammasi ixtiyoriy
    "lat": 41.31, "lng": 69.24, "radiusMeters": 5000,
    "regionIds": ["TOSHKENT_SHAHRI"],
    "districtIds": ["CHILONZOR", "UCHTEPA"],
    "bbox": null                    // xarita uchun: { "minLat":…, "minLng":…, "maxLat":…, "maxLng":… }
  },
  "university": {                   // §7.2.4 — ixtiyoriy
    "universityIds": [],
    "onlyMyUniversity": false,
    "includeNearbyUniversities": true
  },
  "minPrice": null,
  "maxPrice": 2000000,
  "filter": {                       // faqat shu turga tegishlilari o'qiladi
    "gender": "FEMALE",
    "propertyType": "APARTMENT",
    "minRooms": 2,
    "onlyAvailable": true
  },
  "sort": "NEAREST",                // RELEVANCE | NEWEST | PRICE_ASC | PRICE_DESC | NEAREST | DEADLINE
  "page": { "size": 20, "cursor": null }   // §7.2.2
}
```

Javob — `ListingPageDto` (§7.2.2).

**Turlar bo'yicha filtrlar** (klientdagi `ListingFilters.kt`):

| `kind` | Filtrlar |
|---|---|
| `RENTAL` | `gender`, `propertyType`, `minRooms`, `onlyAvailable` (neededTenants > 0) |
| `SERVICE` | `serviceType`, `serviceFormat`, `onlyFreeTrial` |
| `JOB` | `employment`, `jobCategoryKey`, `shift`, `noExperienceOnly` |
| `TASK` | `taskCategory`, `taskTypeKey`, `taskFormat`, `onlyOpenDeadline` |
| Umumiy | `maxPrice` |

**Moslik qoidalari (klient bilan bir xil bo'lishi shart):**

- `gender`: izlanayotgan jins yoki `ANY` bo'lgan e'lonlar mos keladi
  ("qizlar uchun" izlaganga "farqi yo'q" e'loni ham to'g'ri keladi).
- `serviceFormat`: `HYBRID` xizmat har qanday format so'roviga mos.
- `shift`: `FLEXIBLE` ish har qanday smena so'roviga mos.
- `taskFormat`: `ANY` topshiriq har qanday formatga mos.
- `maxPrice`: `isNegotiable = true` e'lonlar **filtrdan tushib qolmaydi**.

#### 7.2.2 Sahifalash (paging)

Ro'yxat **cheksiz skroll** bilan o'qiladi, shuning uchun ikkala usul ham qo'llab-quvvatlansin:

**A) Kursorli (asosiy usul — cheksiz skroll uchun).** Sahifa raqami bilan skroll
qilinganda yangi e'lon qo'shilsa ro'yxat siljiydi va foydalanuvchi bir e'lonni ikki
marta ko'radi yoki bittasini umuman ko'rmaydi. Kursor bu muammoni yopadi:

```jsonc
// So'rov
"page": { "size": 20, "cursor": null }          // birinchi sahifa
"page": { "size": 20, "cursor": "eyJzIjoxNzU0..." }  // keyingisi

// Javob
{
  "items": [ /* StudentListingDto[] */ ],
  "size": 20,
  "hasNext": true,
  "nextCursor": "eyJzIjoxNzU0...",   // hasNext=false bo'lsa null
  "total": 137                        // ixtiyoriy, §pastda
}
```

**B) Sahifa raqami bilan** (`GET` varianti va "N-sahifaga o'tish" uchun):
`?page=1&size=20` → javobda `page`, `size`, `total`, `hasNext`.

Qoidalar:

| Qoida | Qiymat |
|---|---|
| `size` odatiy | 20 |
| `size` maksimal | **50** (kattasi so'ralsa 50 ga qisqartirilsin, xato emas) |
| `page` minimal | 1 |
| Chegaradan oshgan sahifa | Bo'sh `items` + `hasNext: false` (xato emas) |
| `total` | Kursorli rejimda **ixtiyoriy**: katta jadvalda `COUNT(*)` qimmat. Berilmasa `null` yoki taxminiy (`totalApprox`) bo'lsin — ilova `hasNext` ga qarab ishlaydi |

**Saralash barqaror bo'lishi shart.** Har bir `sort` uchun oxirgi mezon sifatida
`id` qo'shilsin, aks holda teng qiymatli qatorlar sahifalar orasida sakraydi:

| `sort` | `ORDER BY` | Kursor kaliti |
|---|---|---|
| `RELEVANCE` (universitet bo'yicha, §7.2.4) | `university_rank ASC, created_at DESC, id DESC` | `(rank, created_at, id)` |
| `NEWEST` | `created_at DESC, id DESC` | `(created_at, id)` |
| `PRICE_ASC` | `final_price ASC, id DESC` | `(final_price, id)` |
| `PRICE_DESC` | `final_price DESC, id DESC` | `(final_price, id)` |
| `NEAREST` | `distance ASC, id DESC` (faqat `geo.lat/lng` berilganda) | `(distance, id)` |
| `DEADLINE` | `(details->>'deadline') ASC, id DESC` (faqat `TASK`) | `(deadline, id)` |

- Kursor — **shifrlangan/base64** `(sort qiymati, id, filtr xeshi)`. Filtr yoki `sort`
  o'zgargan bo'lsa kursor eskiradi → `422 PAGE_CURSOR_INVALID`, ilova birinchi
  sahifadan boshlaydi.
- `NEAREST` so'ralgan-u, koordinata berilmagan bo'lsa — `NEWEST` ga tushirilsin
  (xato qaytarilmasin).
- `GET /v1/listings/mine` ham xuddi shu sahifalashni qo'llab-quvvatlasin
  (odatiy saralash: `updated_at DESC, id DESC`).

#### 7.2.3 Joylashuv bo'yicha filtr

Uchta mustaqil usul — **birga ishlatilsa `AND` bilan kesishadi**:

| Usul | Maydon | Qachon ishlatiladi |
|---|---|---|
| Radius | `geo.lat`, `geo.lng`, `geo.radiusMeters` | "Yaqinimdagi" — `NEAREST` saralashi bilan |
| Ma'muriy hudud | `geo.regionIds[]`, `geo.districtIds[]` | Foydalanuvchi viloyat/tuman tanlaganda |
| To'rtburchak (bbox) | `geo.bbox` | Xarita ekrani — ko'rinib turgan hudud |

Qoidalar:

- **Hech biri berilmasa — butun O'zbekiston bo'yicha qidiriladi.** Joylashuv
  majburiy filtr emas.
- `regionIds` va `districtIds` — **ro'yxat** (bir nechta tuman tanlanishi mumkin,
  masalan "Chilonzor + Uchtepa"). `districtIds` berilsa `regionIds` shart emas.
- E'londa bir nechta manzil bo'lishi mumkin (≤20): **kamida bittasi** shartga tushsa
  e'lon ro'yxatga kiradi (`EXISTS` bo'yicha), lekin **takrorlanmasin** —
  `DISTINCT`/`EXISTS` ishlatilsin, `JOIN` dublikat bermasin.
- `distanceMeters` javobda **eng yaqin manzilgacha** bo'lgan masofa
  (`MIN(ST_DistanceSphere(...))`) — klientdagi `Listing.nearestBranch()` bilan bir xil.
- `radiusMeters` maksimal **200 000** (200 km); kattasi shu qiymatga qisqartirilsin.
- Manzilsiz e'lonlar (`TASK`, `format != IN_PERSON`) **geo-filtr berilganda ham
  ro'yxatdan tushib qolmasin**: onlayn topshiriqning joyi yo'q, lekin talaba uni
  baribir bajara oladi. Ular ro'yxat oxirida, `distanceMeters: null` bilan chiqsin.
  (Qolgan turlarda manzil majburiy, shuning uchun bu istisno faqat `TASK` ga tegishli.)

**Hududlar ro'yxati to'liq — 14 ta viloyat/respublika, 193 ta tuman-shahar**
(`GeoCatalog.kt`; backend `GET /v1/regions` va `GET /v1/districts` da **aynan shu
id'larni** qaytarishi shart):

| Hudud (`regionId`) | Tuman/shahar |
|---|---|
| `TOSHKENT_SHAHRI` | 12 |
| `TOSHKENT_VILOYATI` | 18 |
| `ANDIJON_VILOYATI` | 16 |
| `BUXORO_VILOYATI` | 12 |
| `FARGONA_VILOYATI` | 18 |
| `JIZZAX_VILOYATI` | 12 |
| `NAMANGAN_VILOYATI` | 12 |
| `NAVOIY_VILOYATI` | 10 |
| `QASHQADARYO_VILOYATI` | 13 |
| `QORAQALPOGISTON_RESPUBLIKASI` | 16 |
| `SAMARQAND_VILOYATI` | 16 |
| `SIRDARYO_VILOYATI` | 11 |
| `SURXONDARYO_VILOYATI` | 15 |
| `XORAZM_VILOYATI` | 12 |

> `id` — nomdan olingan barqaror ASCII slug: harf/raqamdan boshqasi tashlanadi,
> probel `_` ga aylanadi, apostroflar (`o'`, `g'`) olib tashlanadi —
> "Mirzo Ulug'bek" → `MIRZO_ULUGBEK`. **Id hech qachon o'zgarmasin** (saqlangan
> e'lonlar shunga bog'langan); nomi (`name`) o'zgarishi mumkin.

#### 7.2.4 Universitetga bog'lash

E'lon **universitetga bog'lanadi** — talaba uchun eng muhim moslik shu: kvartira
sherigi, repetitor yoki kunlik ish odatda **o'z universiteti atrofida** izlanadi.

**Modeldagi qo'shimcha maydonlar** (`StudentListingDto` va `POST /v1/listings`):

```jsonc
{
  "universityId": "univ_tatu",       // null bo'lishi mumkin
  "audience": "ALL",                 // ALL | MY_UNIVERSITY | NEARBY_UNIVERSITIES

  // — faqat o'qishda —
  "universityName": "TATU",
  "universityRelation": "SAME"       // SAME | NEAREST | OTHER — so'rovchiga nisbatan
}
```

- `universityId` odatiy qiymati — **e'lon egasining universiteti** (`UserProfileDto.universityId`).
  Foydalanuvchi uni o'zgartira oladi (masalan uy TATU yonida, lekin o'zi boshqa OTMda o'qiydi)
  yoki bo'shatib qo'yishi mumkin.
- `universityId` **noma'lum bo'lsa `422 UNIVERSITY_NOT_FOUND`** — id'lar
  `GET /v1/universities` ro'yxatidan (profil bilan bir xil id maydoni).

**`audience` — ko'rinish doirasi:**

| Qiymat | Kimga ko'rinadi |
|---|---|
| `ALL` (odatiy) | **Hammaga.** O'sha universitet va yaqin universitet talabalariga ro'yxat **boshida** chiqadi (§pastdagi saralash) |
| `NEARBY_UNIVERSITIES` | Faqat shu universitet **va unga yaqin** universitetlar talabalariga |
| `MY_UNIVERSITY` | Faqat shu universitet talabalariga (yopiq e'lon: "yotoqxonamizga sherik") |

> Odatiy qiymat **`ALL`** bo'lsin: cheklov qo'ygan e'lon kamroq odamga yetadi va
> ko'pchilik foydalanuvchi bunday sozlamani ataylab tanlamaydi. Universitet — avvalo
> **tartiblash signali**, cheklov emas.

**"Yaqin universitet" nima:**

Universitetlar jadvalida koordinata bo'lishi shart:

```sql
CREATE TABLE universities (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    city  TEXT NOT NULL,
    lat   DOUBLE PRECISION NOT NULL,
    lng   DOUBLE PRECISION NOT NULL,
    geom  geography(Point, 4326) NOT NULL
);
```

Yaqinlik ikki mezon bilan (ikkalasidan **kattarog'i** olinadi):

1. **Masofa:** universitetlar orasi ≤ **5 km** (Toshkentda ko'p OTM bir-biriga yaqin).
2. **Bir xil shahar/tuman:** kichik shaharda 5 km yetmaydi — o'sha `districtId` dagi
   barcha OTMlar yaqin hisoblansin.

Natija oldindan hisoblanib jadvalga yozilsin (kuniga bir marta yangilanadigan
materialized view yetarli) — har so'rovda geo-hisob qilinmasin:

```sql
CREATE TABLE university_neighbors (
    university_id  TEXT NOT NULL,
    neighbor_id    TEXT NOT NULL,
    distance_meters INTEGER NOT NULL,
    PRIMARY KEY (university_id, neighbor_id)
);
```

**Filtrlar va saralash:**

| Parametr | Ma'nosi |
|---|---|
| `universityIds: []` | Aniq universitet(lar) bo'yicha filtr (bir nechta bo'lishi mumkin) |
| `onlyMyUniversity: true` | Faqat o'z universitetim e'lonlari |
| `includeNearbyUniversities: true` | `onlyMyUniversity` bilan birga: yaqin OTMlar ham qo'shilsin (odatiy — `true`) |

Yangi saralash turi — **`RELEVANCE`** (universitet bo'lgan ro'yxatlar uchun odatiy
qilib qo'yish tavsiya etiladi):

```sql
ORDER BY
  CASE
    WHEN l.university_id = :myUniversityId                          THEN 0   -- o'z OTM
    WHEN l.university_id IN (SELECT neighbor_id FROM university_neighbors
                             WHERE university_id = :myUniversityId) THEN 1   -- yaqin OTM
    WHEN l.university_id IS NULL                                    THEN 2   -- OTMga bog'lanmagan
    ELSE 3                                                                    -- boshqa OTM
  END,
  l.created_at DESC, l.id DESC
```

- Javobdagi `universityRelation` shu tartibni aks ettiradi (`SAME` / `NEAREST` / `OTHER`) —
  ilova kartochkada "Sizning universitetingiz" yorlig'ini ko'rsatadi.
- Foydalanuvchining universiteti belgilanmagan bo'lsa (`profile.universityId = null`),
  `RELEVANCE` → `NEWEST` ga tushadi va `audience != ALL` e'lonlar ko'rsatilmaydi.
- Universitet filtri **geo-filtrdan mustaqil**: ikkalasi berilsa `AND` bilan kesishadi.

#### 7.2.5 Oddiy `GET` varianti

Bir xil mantiq, query-parametrlar orqali (ilovaning tab almashishi va deep-link uchun
qulay; murakkab so'rovlarda yuqoridagi `POST` ishlatiladi):

```
GET /v1/listings?kind=JOB&query=kuryer&employment=DAILY&jobCategoryKey=COURIER
    &shift=MORNING&noExperienceOnly=true&maxPrice=500000
    &lat=41.31&lng=69.24&radiusMeters=5000
    &regionIds=TOSHKENT_SHAHRI&districtIds=CHILONZOR,UCHTEPA
    &universityIds=univ_tatu&onlyMyUniversity=false&includeNearbyUniversities=true
    &sort=RELEVANCE&size=20&cursor=eyJzIjoxNzU0...
```

- `kind` — **majburiy**. Berilmasa `422` (turlar aralashib ketmasligi kerak).
- Turga tegishli bo'lmagan parametr **jimgina e'tiborsiz qoldirilsin** (masalan `JOB`
  so'rovida `propertyType`) — xato qaytarilmasin, klient tab almashtirganda eski
  parametr qolib ketishi mumkin.
- Ikkala endpoint ham bir xil `ListingPageDto` qaytaradi va bir xil kod yo'lini
  ishlatsin (`GET` → filtr obyektiga aylantirib, `POST` bilan bir xil servisga bersin).

Qo'shimcha (ixtiyoriy, lekin foydali): `POST /v1/listings/search/map` — xaritada
klasterlar (chegirmalardagi `SearchMapResponseDto` kabi) va `POST /v1/listings/suggest`.

### 7.3 Kataloglar

Klientdagi hardcode kataloglarni serverdan berish — shunda yangi soha/kategoriya
qo'shish uchun ilova yangilanmaydi:

| Metod | Yo'l | Qaytaradi |
|---|---|---|
| `GET` | `/v1/listings/catalog?kind=TASK` | Kategoriyalar → turlar (`TaskCatalog`) |
| `GET` | `/v1/listings/catalog?kind=SERVICE` | Sohalar → yo'nalishlar → maydon spetsifikatsiyasi |
| `GET` | `/v1/listings/catalog?kind=JOB` | Ish kategoriyalari, tayyor talab/sharoit chiplari |
| `GET` | `/v1/listings/catalog?kind=RENTAL` | Qulayliklar, xona/depozit variantlari |

Javobda `version` (yoki `ETag`) bo'lsin — ilova keshni shunga qarab yangilaydi:

```jsonc
{ "kind": "SERVICE", "version": 3,
  "types": [
    { "key": "TUTOR", "label": "Repetitor", "emoji": "📖", "hasSubjects": true,
      "defaultPriceUnit": "PER_LESSON",
      "priceUnits": ["PER_LESSON","PER_HOUR","PER_MONTH","PER_COURSE"],
      "subjectLabel": "Fan yoki yo'nalish",
      "subjects": [ { "key": "IELTS", "label": "IELTS" } ],
      "fields": [
        { "key": "level", "label": "Qaysi daraja uchun", "kind": "SELECT",
          "options": ["Boshlang'ich sinf","5–9 sinf","10–11 sinf","Abituriyent","Talaba","Kattalar"],
          "required": true }
      ],
      "subjectFields": { "IELTS": [ { "key": "targetBand", "label": "Maqsad ball",
          "kind": "SELECT", "options": ["5.5","6.0","6.5","7.0","7.5","8.0+"], "required": true } ] } }
  ] }
```

**Muhim:** katalog kalitlari (`TUTOR`, `IELTS`, `targetBand`, `REFERAT`, `WIFI`, `COURIER`...)
**hech qachon o'zgarmasin** — saqlangan e'lonlar shu kalitlarga bog'langan. Yorliq
(`label`) o'zgarishi mumkin.

### 7.4 Rasm yuklash

Mavjud `POST /v1/media/upload` ishlatiladi (`multipart/form-data`). Talablar:

- E'lon rasmi uchun `purpose=LISTING` qiymati qabul qilinsin.
- JPEG/PNG/WebP/HEIC, ≤ 10 MB, uzun tomoni 2048 px ga siqilsin, EXIF tozalansin
  (**GPS teglari olib tashlansin** — foydalanuvchi uyining koordinatasi rasm ichida
  qolib ketmasin).
- Javobdagi havola `PUBLIC_MEDIA_BASE_URL` dan qurilsin — `localhost` emas
  (`STORY_AND_PROFILE_BACKEND.md` §0.1 dagi muammo takrorlanmasin).

### 7.5 E'lon egasiga bog'lanish

E'lonning butun ma'nosi — bog'lanish. Ikki yo'l:

1. **Telefon** — `contactPhone` javobda bor (egasi o'zi kiritgan, maxfiylik sozlamasi
   shart emas).
2. **Chat** — `POST /v1/conversations` (mavjud `OpenDirectDto`) ga `listingId` qo'shilsin:
   suhbat ochilganda birinchi xabarda e'lon kartochkasi ko'rinadi.
   Bu **`Connections` talabini chetlab o'tishi kerak**: e'longa javob berish uchun
   avval do'stlashish shart emas (aks holda e'lon ishlamaydi). Suhbat "e'lon suhbati"
   deb belgilansin va spamdan himoya uchun: bir talaba bir e'longa kuniga 1 marta
   yozishi mumkin.

Sevimlilar (ixtiyoriy): `POST /v1/listings/{id}/favorite/toggle` — chegirmalardagi
`FavoriteToggleDto` kabi.

---

## 8. Xatolar

| `error.code` | HTTP | Qachon |
|---|---|---|
| `LISTING_VALIDATION_FAILED` | 422 | §5 qoidalari buzilgan (`fields` to'ldiriladi) |
| `LISTING_KIND_MISMATCH` | 422 | `details.kind != listing.kind` |
| `LISTING_KIND_IMMUTABLE` | 409 | `PATCH` da `kind` o'zgartirilmoqchi |
| `LISTING_NOT_FOUND` | 404 | Yo'q yoki o'chirilgan |
| `LISTING_FORBIDDEN` | 403 | Egasi emas |
| `LISTING_STATUS_INVALID` | 409 | Ruxsat etilmagan status o'tishi (`EXPIRED → ACTIVE`) |
| `LISTING_LIMIT_REACHED` | 429 | Faol e'lon yoki kunlik `submit` limiti |
| `LISTING_DUPLICATE` | 409 | 24 soat ichida bir xil e'lon |
| `CATALOG_KEY_UNKNOWN` | 422 | Noma'lum `categoryKey`/`typeKey`/`subject`/`amenities` kaliti |
| `UNIVERSITY_NOT_FOUND` | 422 | Noma'lum `universityId` |
| `PAGE_CURSOR_INVALID` | 422 | Kursor eskirgan (filtr/sort o'zgargan) — birinchi sahifadan boshlansin |
| `GEO_OUT_OF_BOUNDS` | 422 | Koordinata O'zbekistondan tashqarida |
| `MEDIA_TOO_LARGE` / `MEDIA_TYPE_UNSUPPORTED` | 422 | Rasm yuklashda |

`message` — **o'zbekcha, foydalanuvchiga ko'rsatiladigan matn**.

---

## 9. Tekshirish ro'yxati (Definition of Done)

- [ ] `PriceUnitDto` ga `PER_DAY` va `PER_PAGE` qo'shildi.
- [ ] `ListingKind` (`RENTAL`/`SERVICE`/`JOB`/`TASK`) va polimorf `details` OpenAPI'da.
- [ ] `POST /v1/listings` — `submit: false` bilan **validatsiyasiz** qoralama saqlanadi.
- [ ] `POST /v1/listings/{id}/submit` — §5 dagi **hamma** qoida tekshiriladi va
      xatolar `error.fields` da `ListingField` kalitlari bilan qaytadi.
- [ ] Turga xos majburiy maydonlar ishlaydi: `RENTAL.gender`, `TASK.deadline` (kelajakda),
      `TASK` da `description`, `JOB.workDate` (DAILY), `SERVICE` katalogining
      `required` maydonlari.
- [ ] `TASK` da `format != IN_PERSON` bo'lsa manzil so'ralmaydi; qolgan turlarda majburiy.
- [ ] 100 m dan yaqin ikki manzil rad etiladi; O'zbekiston chegarasi tekshiriladi.
- [ ] `POST /v1/listings/search` va `GET /v1/listings?...` — `kind` bo'yicha ajratilgan
      ro'yxat, §7.2 dagi barcha filtrlar va "yumshoq moslik" qoidalari
      (`ANY`/`HYBRID`/`FLEXIBLE`, `isNegotiable`); begona parametr xato bermaydi.
- [ ] `NEAREST` saralash PostGIS bilan; javobda `distanceMeters` (eng yaqin manzilgacha).
- [ ] Sahifalash (§7.2.2): kursorli **va** sahifa raqamli rejim, `size ≤ 50`, barqaror
      saralash (`id` bilan yakunlanadi), `hasNext`/`nextCursor`, eskirgan kursorda `422`.
- [ ] Joylashuv (§7.2.3): radius + `regionIds[]`/`districtIds[]` (ko'p tanlov) + `bbox`;
      hech biri berilmasa butun O'zbekiston; ko'p manzilli e'lon dublikat bermaydi;
      `GET /v1/regions`/`/v1/districts` id'lari `GeoCatalog.kt` bilan **bir-bir mos**
      (14 hudud, 193 tuman).
- [ ] Universitet (§7.2.4): `universityId` + `audience`, `university_neighbors` jadvali
      (≤5 km yoki bir xil tuman), `RELEVANCE` saralashi, javobda `universityRelation`;
      universiteti belgilanmagan foydalanuvchiga `MY_UNIVERSITY` e'lonlari ko'rinmaydi.
- [ ] `GET /v1/listings/catalog?kind=...` — barcha kalitlar `*Catalog.kt` bilan **bir-bir mos**
      (avtomatik test: klientdagi enum/kalitlar ro'yxati backend javobiga teng).
- [ ] Ko'rinish qoidalari (§7.2.0): faqat `ACTIVE` + muddati o'tmagan e'lon hammaga
      ko'rinadi; egasining qoralamasi begonaga `404`; bloklangan foydalanuvchi e'loni
      ikki tomonlama yashiriladi; javobda `isMine`.
- [ ] Cron: `validTo`/`deadline` o'tgan e'lonlar `EXPIRED`.
- [ ] `Idempotency-Key` qo'llab-quvvatlanadi.
- [ ] Rasm EXIF (GPS) tozalanadi, havola `PUBLIC_MEDIA_BASE_URL` dan.
- [ ] E'lon egasiga chat ochish `Connections` talabini chetlab o'tadi.
- [ ] OpenAPI (`student-club.json`) yangilandi → `./gradlew generateAllApi` ishlaydi.

---

## 10. Ochiq savollar (backend qaror qilsin, klientga aytilsin)

1. **Moderatsiya avtomatikmi yoki qo'lda?** Birinchi bosqichda avtomatik tavsiya etiladi
   (aks holda e'lon soatlab `PENDING_REVIEW` da turadi va talaba ilovadan voz kechadi).
2. **`ACTIVE` e'lon tahrirlanganda qayta moderatsiya bo'ladimi?** Narx/tavsif uchun
   istisno qilinsa — qaysi maydonlar "yengil" ekani ro'yxati kerak.
3. **Kataloglar serverdan keladimi yoki hozircha klientda qoladimi?** Qolsa ham §7.3
   endpoint'i kelajak uchun rejalashtirilsin — ilovada kesh mexanizmi tayyor.
4. **`TASK` uchun "javob berish" (otklik) kerakmi?** Hozir faqat chat/telefon.
   Kerak bo'lsa alohida `POST /v1/listings/{id}/apply` + `applicationsCount` bo'ladi
   va bu klientda yangi ekran demakdir — alohida kelishilsin.
