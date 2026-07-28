# 08 — Geo (`/v1/regions`, `/v1/districts`, `/v1/geo`)

> Konvensiyalar (envelope, pagination, guard'lar, scope belgilar) — [`00-overview.md`](./00-overview.md). Bu fayl faqat shu modul mantiqini yozadi.

## 1. Maqsad

Geo modul ikki xil vazifani bajaradi:

1. **Statik reference data (viloyat/tuman)** — `regions` va `districts`. Bular **seed'dan** keladi (`catalog-seed.json` uslubida), **🌐 public** (token shart emas) va **read-only**. Branch/e'lon formalari va discounts feed filtrlarida hudud tanlash uchun ishlatiladi. ID'lar — inson o'qiy oladigan **string kalitlar** (`"TOSHKENT_SHAHRI"`, `"CHILONZOR"`), cuid emas.
2. **Geokodlash (Yandex proxy)** — `geo/geocode` (manzil → koordinata) va `geo/reverse-geocode` (koordinata → manzil). Bular **🔒 Auth** (`JwtAuthGuard`): kalit server tomonda qoladi va ochiq geokodlash proxy'siga aylanmaydi. Provider javobi **bizning** region/district'imiz bilan boyitiladi (eng yaqin tuman markazi bo'yicha) — provider'ning ma'muriy nomlariga ishonilmaydi.

---

## 2. Endpointlar

| METHOD + path | Scope | Maqsad |
|---|---|---|
| `GET /v1/regions` | 🌐 Public | Barcha viloyatlar (14 ta), `nameUz` bo'yicha tartiblangan |
| `GET /v1/districts` | 🌐 Public | Barcha tumanlar yoki bitta viloyatning tumanlari (`?regionId=`) |
| `POST /v1/geo/geocode` | 🔒 Auth | Manzil matnini koordinataga aylantirish (Yandex proxy) |
| `POST /v1/geo/reverse-geocode` | 🔒 Auth | Koordinatani manzilga aylantirish (Yandex proxy) |

`regions`/`districts` — hech qanday guard yo'q (public). `geo/*` — faqat `JwtAuthGuard` (student ham, biznes ham chaqira oladi). Ikkala `geo/*` `POST` ham **`@HttpCode(200)`** — resurs yaratmaydi, faqat so'rov-javob (query), shuning uchun 200, 201 emas.

---

## 3. `GET /v1/regions`  🌐 Public

Barcha viloyatlarni qaytaradi.

**Request:** body yo'q, query yo'q, auth yo'q.

**Response `result` (`RegionDto[]`):**

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `string` | String kalit, masalan `"TOSHKENT_SHAHRI"` |
| `nameUz` | `string` | O'zbekcha nomi |
| `nameRu` | `string \| null` | Ruscha nomi (bo'lmasligi mumkin) |
| `centerLat` | `number \| null` | Markaz kenglik (double) |
| `centerLng` | `number \| null` | Markaz uzunlik (double) |

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": [
    {
      "id": "ANDIJON",
      "nameUz": "Andijon viloyati", "nameRu": "Андижанская область",
      "centerLat": 40.7821, "centerLng": 72.3442
    },
    {
      "id": "TOSHKENT_SHAHRI",
      "nameUz": "Toshkent shahri", "nameRu": "город Ташкент",
      "centerLat": 41.311081, "centerLng": 69.240562
    }
  ],
  "error": null
}
```

**LOGIKA:** `geoRepository.findRegions()` — `orderBy: { nameUz: 'asc' }`. Jami **14 ta** (12 viloyat + Toshkent shahri + Qoraqalpog'iston). Ma'lumot seed'dan, o'zgarmaydi.

**FILTRLAR:** yo'q (to'liq ro'yxat, paginatsiyasiz).

---

## 4. `GET /v1/districts`  🌐 Public

Barcha tumanlar yoki bitta viloyatning tumanlarini qaytaradi.

**Request query (`DistrictQueryDto`):**

| Query | Tur | Izoh |
|---|---|---|
| `regionId` | `string` (ixtiyoriy) | Berilsa — shu viloyat tumanlari. Tashlab yuborilsa — **barcha** tumanlar |

**Response `result` (`DistrictDto[]`):**

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `string` | String kalit, masalan `"CHILONZOR"` |
| `regionId` | `string` | Tegishli viloyat kaliti |
| `nameUz` | `string` | O'zbekcha nomi |
| `nameRu` | `string \| null` | Ruscha nomi |
| `centerLat` | `number \| null` | Markaz kenglik (double) |
| `centerLng` | `number \| null` | Markaz uzunlik (double) |

**LOGIKA:**
- `regionId` **berilmasa** → `findDistricts()` (hammasi, `nameUz asc`).
- `regionId` **berilsa** → avval `regionExists(regionId)` tekshiriladi; mavjud bo'lmasa → **404** `NOT_FOUND` (`message: "Viloyat topilmadi"`). Mavjud bo'lsa → `findDistrictsByRegion(regionId)` (`nameUz asc`).

**FILTRLAR:** faqat `regionId` (aniq mos kelish). Paginatsiya yo'q — to'liq ro'yxat qaytadi.

---

## 5. `POST /v1/geo/geocode`  🔒 Auth

Erkin matnli manzilni koordinata(lar)ga aylantiradi (Yandex proxy). Biznes egasi branch formasida manzilni izlash uchun ishlatadi.

**Request body (`GeocodeRequestDto`):**

| Maydon | Tur / validatsiya | Izoh |
|---|---|---|
| `query` | `string`, `1..200` belgi | Izlanadigan manzil matni |
| `regionId` | `string` (ixtiyoriy) | Izlashni shu viloyatga cheklaydi (bias + filtr) |

**Response `result` (`GeocodeResultDto[]`)** — nomzodlar, eng yuqori ishonch birinchi:

| Maydon | Tur | Izoh |
|---|---|---|
| `lat` | `number` | Kenglik (double) — provider'dan |
| `lng` | `number` | Uzunlik (double) — provider'dan |
| `regionId` | `string \| null` | **Bizning** eng yaqin tuman markazidan hosil qilingan |
| `districtId` | `string \| null` | **Bizning** eng yaqin tuman |
| `formattedAddress` | `string` | Provider bergan to'liq manzil matni |
| `confidence` | `number \| null` | `0..1` ishonch darajasi |

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": [
    {
      "lat": 41.311081, "lng": 69.240562,
      "regionId": "TOSHKENT_SHAHRI", "districtId": "CHILONZOR",
      "formattedAddress": "Toshkent, Chilonzor 9-kvartal, 42",
      "confidence": 0.9
    }
  ],
  "error": null
}
```

**LOGIKA:**
- `regionId` **berilsa** — avval mavjudligi tekshiriladi; yo'q bo'lsa → **422** `VALIDATION_ERROR` (`fields.regionId: "Viloyat topilmadi"`). Mavjud bo'lsa: query oldiga viloyat nomi qo'shiladi (bias) **va** natijalar faqat shu `regionId` bilan cheklanadi.
- Provider'ga so'rov yuboriladi; **hech nima topilmasa** → `[]` (bo'sh massiv, **404 emas**).
- Har match uchun `regionId`/`districtId` **bizning district markazlaridan** (eng yaqin, haversine) hisoblanadi — provider'ning ma'muriy nomlariga tayanmaydi.
- Provider ishlamasa (down/timeout) → **503** `GEOCODER_UNAVAILABLE`.

**FILTRLAR:** `regionId` (ixtiyoriy) — natijalarni shu viloyat bilan cheklaydi.

---

## 6. `POST /v1/geo/reverse-geocode`  🔒 Auth

Koordinatani manzilga aylantiradi (Yandex proxy).

**Request body (`ReverseGeocodeRequestDto`):**

| Maydon | Tur / validatsiya | Izoh |
|---|---|---|
| `lat` | `number`, `-90..90` | Global sanity (haqiqiy koordinata) |
| `lng` | `number`, `-180..180` | Global sanity |

> DTO chegaralari faqat "koordinata haqiqatan koordinata" ekanini tekshiradi. **O'zbekiston chegarasi** — alohida service tekshiruvi (pastga qarang), shuning uchun mamlakat tashqarisidagi nuqta umumiy validatsiya emas, aniq **422 `LOCATION_OUT_OF_BOUNDS`** beradi.

**Response `result` (`ReverseGeocodeResponseDto`):**

| Maydon | Tur | Izoh |
|---|---|---|
| `regionId` | `string \| null` | Eng yaqin tuman markazidan |
| `districtId` | `string \| null` | Eng yaqin tuman |
| `address` | `string \| null` | Provider bergan manzil |
| `nearestMetro` | `string \| null` | **Level-1 da doim `null`** (faqat Toshkent uchun rejalashtirilgan) |

**LOGIKA:**
- **Avval** `isWithinUzbekistan(lat, lng)` tekshiriladi; chegaradan tashqarida bo'lsa → **422** `LOCATION_OUT_OF_BOUNDS` (`message: "Koordinata O'zbekiston chegarasidan tashqarida"`) — **provider chaqirilmaydi**.
- `regionId`/`districtId` bizning district markazlaridan (eng yaqin) aniqlanadi.
- `address` provider'dan olinadi. `nearestMetro` doim `null` (Level-1).
- Provider ishlamasa → **503** `GEOCODER_UNAVAILABLE`.

**FILTRLAR:** yo'q.

---

## 7. Enumlar

Bu modulda **enum yo'q**. `id`/`regionId`/`districtId` — seed'dan kelgan **string kalitlar** (`UPPER_SNAKE_CASE`: `"TOSHKENT_SHAHRI"`, `"CHILONZOR"`), tugallangan enum emas — yangi hudud qo'shilsa yangi kalit paydo bo'ladi. Frontend ularni `GET /regions` + `GET /districts` dan dinamik oladi (hardcode qilmaydi).

---

## 8. Xatolar

| HTTP | `error.code` | Qachon | `message` (o'zbekcha) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | `geo/*` da token yo'q/yaroqsiz / muddati o'tgan | — (umumiy) |
| 404 | `NOT_FOUND` | `GET /districts?regionId=` noma'lum viloyat | `Viloyat topilmadi` |
| 422 | `VALIDATION_ERROR` | `geocode` `regionId` mavjud emas; yoki DTO validatsiyasi (`query` uzunligi, koordinata chegarasi) | `error.fields` bilan (`regionId: "Viloyat topilmadi"`) |
| 422 | `LOCATION_OUT_OF_BOUNDS` | `reverse-geocode` nuqtasi O'zbekiston tashqarisida | `Koordinata O'zbekiston chegarasidan tashqarida` |
| 503 | `GEOCODER_UNAVAILABLE` | Geokodlash provideri vaqtincha ishlamayapti | `Geokodlash xizmati vaqtincha ishlamayapti, keyinroq urinib ko'ring` |

> `regions`/`districts` public bo'lgani uchun ularda 401 bo'lmaydi. `404 NOT_FOUND` bu yerda **generic** kod (geo-spetsifik `*_NOT_FOUND` emas).

---

## 9. Admin panel eslatmasi

🌐 **Read-only (public), seed-managed.** `regions` va `districts` public **o'qish** endpointlari o'zgarmaydi.

Geo-boshqaruv paneli (yangi viloyat/tuman qo'shish, nom/markaz tahrirlash) uchun admin CRUD endi **qurilgan** — ✅ built, `AdminJwtGuard` + `@Roles(ADMIN)` ostida ([`ADMIN-API.md`](./ADMIN-API.md) Faza 4):
- `POST · PUT · DELETE /v1/admin/regions` (`/:id`),
- `POST · PUT · DELETE /v1/admin/districts` (`/:id`, `regionId` mavjud bo'lishi shart).

Delete'lar referential-integrity bilan (ishlatilayotgan bo'lsa **409** `REGION_IN_USE`/`DISTRICT_IN_USE`).

`geo/geocode` va `geo/reverse-geocode` — bu **JWT bilan himoyalangan Yandex proxy** (server kaliti bilan). Admin panelda ular **shundayligicha** (login qilingan holatda) ishlatiladi; alohida admin-scope shart emas. Provider kaliti va limitlar backend env'ida boshqariladi.

To'liq reja: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
