# Talaba e'lonlari — backend javobi

`05-STUDENT_LISTINGS_INTEGRATION_BACKEND.md` dagi **1–4 bandlar bajarildi**. 5-band (Faza 2) —
javob berildi, kod yozilmadi.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.
> **`cleanSwagger` ning 12-qadamini endi olib tashlasangiz bo'ladi** — `details` tiplangan.

---

## 0. Muhim: siz ikkita to'qnashuvni topgansiz, aslida **to'rtta** edi

§1 va §2 — bitta sababning ikki ko'rinishi. Sxema nomlari **umumiy fazoda**, va `student-listings`
modulidagi to'rtta klass `discounts` modulidagi xuddi shu nomli klasslar bilan to'qnashgan:

| Nom | Spec'ga kim tushgan edi | Natija |
|---|---|---|
| `SearchFilterDto` | ❌ chegirmalarniki | Siz topdingiz — `groupKeys`, `businessIds`… |
| `SearchPageDto` | ❌ chegirmalarniki | Siz topdingiz — `cursor` yo'q |
| `SearchGeoDto` | ❌ chegirmalarniki | **Siz topmagansiz** — `onlineOnly` bor, `bbox` boshqacha |
| `GeoBoxDto` | ❌ chegirmalarniki | **Siz topmagansiz** |

Ya'ni `SearchListingsDto.geo` ham noto'g'ri sxemaga qarab turgan. Uni ham tuzatdik.

⚠️ **Runtime hech qachon noto'g'ri ishlamagan** — faqat undan generatsiya qilingan hujjat noto'g'ri
edi. `POST /search` bugun ham to'g'ri maydonlarni qabul qiladi; shunchaki spec boshqa narsani
tasvirlab turgan.

### Yangi nomlar

| Avval | Endi |
|---|---|
| `SearchFilterDto` | **`StudentListingFilterDto`** |
| `SearchPageDto` | **`ListingPageRequestDto`** |
| `SearchGeoDto` | `StudentListingGeoDto` |
| `GeoBoxDto` | `StudentListingBboxDto` |

Birinchi ikkitasi — siz taklif qilgan nomlar.

Endi spec'da:

```jsonc
"SearchListingsDto": {
  "properties": {
    "filter": { "$ref": "#/components/schemas/StudentListingFilterDto" },
    "page":   { "$ref": "#/components/schemas/ListingPageRequestDto" },
    "geo":    { "$ref": "#/components/schemas/StudentListingGeoDto" }
  }
}
```

`StudentListingFilterDto` — `gender`, `propertyType`, `minRooms`, `serviceType`, `serviceFormat`,
`employment`, `shift`, `taskCategory` va h.k. — §7.2.1 dagi 15 ta filtrning hammasi.

`ListingPageRequestDto` — **`{ size, cursor, number }`**. `cursor` bor, ya'ni §7.2.2 dagi asosiy
kursorli rejim endi ifodalanadi.

**Siz `POST` ga o'ta olasiz** — `bbox` (xarita ekrani) faqat o'sha yerda bor.

---

## 1. To'rtta `*DetailsDto` — endi spec'da

```
components.schemas.TaskDetailsDto     ✅
components.schemas.RentalDetailsDto   ✅
components.schemas.ServiceDetailsDto  ✅
components.schemas.JobDetailsDto      ✅
components.schemas.JobScheduleDto     ✅   (JobDetailsDto.schedule uchun)
```

Ajratgich — `kind`, shakl §4.1–§4.4 dagidek. `details` — `oneOf` shu to'rttasi ustida.

**Sabab shu edi:** klasslar hujjatga faqat `oneOf` ichidagi `$ref` orqali kirardi, Nest'ning
skaneri esa `$ref` ni **kuzatmaydi** — u havolani chiqaradi, havola ko'rsatayotgan komponentni esa
yo'q. Natijada `components.schemas` da to'rtta osilib qolgan havola qolgan va **har qanday
generator o'sha yerda to'xtagan**.

`@ApiExtraModels` ularni ro'yxatdan o'tkazadi. Runtime'da hech narsa qilmaydi — u faqat hujjat
API'ning har doim bo'lgan shaklini tasvirlashi uchun.

Ya'ni siz sxemani **taxmin qilib yozmagan ekansiz** — u to'g'ri edi, shunchaki chiqarilmagan.
Endi `StudentListingApiMappers.kt` dagi qo'lda o'qish/yozishni tiplangan variantga almashtira olasiz.

---

## 2. Narx — `int64`

`price`, `priceMax`, `minPrice`, `maxPrice` — hammasi endi `{"type":"integer","format":"int64"}`.

Bazada `BigInt` edi, spec'da esa formatsiz `integer` — ya'ni generator uchun `int32`. Sizning
`0..2_147_483_647` ga kesishingiz endi **umuman kerak emas**.

---

## 3. ✅ Tasdiqlayman: `lat`/`lng` o'zi radius filtrini qo'llamaydi

Siz so'ragan tasdiq — kodda tekshirildi (`search.sql.ts:168`):

```ts
if (geo.lat !== null && geo.lng !== null && geo.radiusMeters !== null) {
  // ST_DWithin — faqat uchalasi ham berilganda
}
```

**Koordinata — tartib haqidagi ko'rsatma, a'zolik haqida emas.** `NEAREST` uchun `lat`/`lng`
yuborsangiz, natija **torayamaydi** — faqat masofa bo'yicha saralanadi.

Siz aytgan xavf («uzoqdagi e'lonlar jimgina tushib qoladi va buni hech kim sezmaydi») aynan shuning
uchun endi **test bilan mahkamlangan**:

```
✓ does NOT narrow the result when lat/lng arrive without a radius (§4)
✓ still ignores a radius that arrives without a coordinate to centre it on
```

Kimdir kelajakda buni buzsa, test yiqiladi.

---

## 4. Faza 2 (§5) — hali yo'q, va bu ataylab

| Kerak | Holat |
|---|---|
| `universityRelation`, `universityName` | ❌ |
| `universityIds[]`, `onlyMyUniversity`, `includeNearbyUniversities` | ❌ |
| `GET /listings/catalog?kind=…` | ❌ |
| `POST /v1/conversations` da `listingId` | ❌ |
| Sevimlilar, `POST /search/map`, `POST /suggest` | ❌ |

⚠️ **Asosiy to'siq — universitetlar jadvali umuman yo'q.** `Student.universityId` va
`StudentListing.universityId` — oddiy string, FK emas (`schema.prisma` da shunday yozilgan:
*"Phase 1 stores both but enforces neither — no universities table exists yet"*).

Ya'ni `universityRelation` (`SAME`/`NEAREST`/`OTHER`) ni hisoblab bo'lmaydi: `SAME` uchun satrlarni
solishtirish yetarli, lekin `NEAREST` uchun universitetning **koordinatasi** kerak, u esa hech
qayerda yo'q. Bu alohida ish — universitetlar katalogi (nom, viloyat, koordinata) + seed.

**Yaxshi xabar:** `02-PUSH_CATALOG` ishi bilan `Student` ga `regionId`/`districtId` qo'shildi, ya'ni
geo yarmi allaqachon bor. Universitetlar katalogi qo'shilsa `universityRelation` bir necha kunlik ish.

Aytsangiz — rejalashtiramiz.

---

## 5. Sizdan kutilayotgani

| # | Ish |
|---|---|
| 1 | `student-club.json` ni yangilash |
| 2 | `cleanSwagger` ning **12-qadamini olib tashlash** — `details` endi tiplangan |
| 3 | `StudentListingApiMappers.kt` dagi qo'lda `details` o'qish/yozishni generatsiya qilinganiga almashtirish |
| 4 | Narxdagi `0..2_147_483_647` kesishni olib tashlash |
| 5 | `POST /v1/student-listings/search` ga o'tish (`bbox` uchun) |
| 6 | Javob: universitetlar katalogi kerakmi? |

---

## 6. Testlar

288 ta test o'tdi (14 suite), ikkitasi shu ish uchun yangi — ikkalasi ham §4 dagi radius
semantikasini qo'riqlaydi.

Qolgan o'zgarishlar sxema nomlari va `format` — runtime'ga tegmaydi, shuning uchun mavjud testlar
o'zgarishsiz o'tdi. Bu, aslida, o'zgarish xavfsizligining isboti: **kod emas, faqat hujjat
tuzatildi**.
