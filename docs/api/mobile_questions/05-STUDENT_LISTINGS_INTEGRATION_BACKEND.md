# Talaba e'lonlari — **qolgan ishlar**

Bu hujjat 2026-08-05 da qisqartirildi: bajarilgan bandlar va sizga bergan kataloglarimiz
(GeoCatalog — 14 viloyat / 193 tuman, ServiceCatalog, klient kelishuvlari jadvali,
`audience`, `/v1/stories/archive`) olib tashlandi. To'liq asl nusxa git tarixida.

Ilova `/v1/student-listings` ga to'liq ulangan: yaratish → e'lon qilish → qidiruv →
sahifalash → status → o'chirish. Quyidagilar **sizdan** kutilmoqda.

Tekshirildi: `dev/api-client-generator/student-club.json`, 2026-08-04.

---

## 1. ⚠️ Spec'da 4 ta sxema YO'Q — generatsiya yiqiladi

`CreateStudentListingDto.details`, `UpdateStudentListingDto.details` va
`StudentListingDto.details` quyidagilarga `$ref` qiladi:

```
#/components/schemas/TaskDetailsDto
#/components/schemas/RentalDetailsDto
#/components/schemas/ServiceDetailsDto
#/components/schemas/JobDetailsDto
```

`components.schemas` da bu to'rttasining **birortasi ham yo'q** — havolalar bo'shliqqa
qaraydi. Har qanday kod generatori shu yerda to'xtaydi.

Hozircha bizda ular `cleanSwagger` ning 12-qadamida erkin JSON obyektiga (`JsonObject`)
aylantiriladi va `details` **qo'lda** — `StudentListingApiMappers.kt` da,
`STUDENT_LISTINGS_BACKEND.md` §4 bo'yicha — o'qiladi/yoziladi. Ya'ni ishlayapti, lekin
kontrakt hujjatlashtirilmagan va sxemani biz taxmin qilib yozdik.

**Iltimos:** to'rttasini `components.schemas` ga qo'shing. Ajratgich — `kind`, shakl esa
aynan §4.1–§4.4 dagidek. Shundan keyin biz 12-qadamni olib tashlab, tiplangan variantga
o'tamiz.

---

## 2. ⚠️ `POST /v1/student-listings/search` tanasi noto'g'ri sxemaga qarab turibdi

`SearchListingsDto` ikkita begona sxemani ishlatadi:

| Maydon | Spec'dagi `$ref` | Nima uchun yaramaydi |
|---|---|---|
| `filter` | `SearchFilterDto` | Bu **biznes chegirmalarining** filtri: `groupKeys`, `businessIds`, `discount`, `redemption`, `attributes`… Sizning §7.2.1 dagi `gender` / `propertyType` / `minRooms` / `serviceType` / `shift` / `taskCategory` maydonlarining **birortasi ham yo'q** |
| `page` | `SearchPageDto` | `{ number, size }` — **`cursor` yo'q**, ya'ni §7.2.2 dagi asosiy (kursorli) rejimni ifodalab bo'lmaydi |

`GET /v1/student-listings` da esa hammasi joyida: 15 ta turga xos filtr, `sort`, `size`,
`cursor`, `page`. Shu sabab ilova **hozircha `GET` bilan ishlaydi**.

**Iltimos:** `SearchListingsDto` uchun o'z sxemalaringizni bering
(`StudentListingFilterDto` + `cursor` li `ListingPageRequestDto`). Biz `POST` ga o'tamiz —
bu bir necha qatorlik ish, lekin `bbox` (xarita ekrani) faqat `POST` da bor va u bizga
kerak bo'ladi.

---

## 3. Kichik nomuvofiqlik: narx `int64` mi, `int32` mi?

`STUDENT_LISTINGS_BACKEND.md` §2.2 da `price` / `priceMax` — **`int64`**, spec'da esa
formatsiz `integer`, ya'ni generator uchun `int32`. Klientda narx `Long`, simga
chiqarishda `0..2_147_483_647` oralig'iga kesiladi (aks holda `toInt()` manfiy songa
aylanib, e'lon "−2 mlrd so'm" bo'lib ketardi).

Talaba e'lonlarida 2.1 mlrd so'mlik narx amalda uchramaydi, shuning uchun shoshilinch
emas. Lekin `"format": "int64"` qo'yib qo'ysangiz kesish umuman kerak bo'lmaydi.

---

## 4. Bitta tasdiq kerak: `radiusMeters`

Klient `lat`/`lng` ni **faqat `NEAREST` tartibi tanlanganda** yuboradi, `radiusMeters` ni
esa umuman yubormaydi (foydalanuvchi aniq so'ramaguncha).

**Tasdiqlang:** `lat`/`lng` ning o'zi berilganda radius filtri **qo'llanmaydi**. Aks holda
uzoqdagi e'lonlar jimgina tushib qoladi va buni hech kim sezmaydi.

---

## 5. Faza 2 — spec'da hali yo'q

| Kerak | Spec'dagi holat (2026-08-04) |
|---|---|
| `universityRelation` (`SAME`/`NEAREST`/`OTHER`), `universityName` | `StudentListingDto` da **yo'q** |
| `universityIds[]`, `onlyMyUniversity`, `includeNearbyUniversities` filtrlari | `GET /v1/student-listings` query'sida **yo'q** (`sort=RELEVANCE` bor, lekin uni hisoblaydigan signal yo'q) |
| `GET /listings/catalog?kind=…` | **yo'q** — `/v1/catalog/*` faqat biznes chegirmalari uchun; talaba e'lonlari kataloglari hali ilovada hardcode |
| `POST /v1/conversations` da `listingId` | `OpenDirectDto` da faqat `studentId` |
| Sevimlilar (`/favorite/toggle`), `POST /search/map`, `POST /suggest` | faqat **chegirmalar** tomonida bor (`/v1/discounts/*`), talaba e'lonlarida yo'q |

Bular chiqqanda ilova tomonidagi ish kam: `universityRelation` ni kartada ko'rsatish va
filtr oynasiga "Faqat universitetim" tugmasini qo'shish.

`apply` / `applicationsCount` — hozircha kerak emas, chat va telefon yetarli.
