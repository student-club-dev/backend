# 10 — Redemptions (`/v1/listings/{listingId}/redeem...`)

> Konvensiyalar (envelope, pagination, guard'lar, scope belgilar) — [`00-overview.md`](./00-overview.md). Bu fayl faqat shu modul mantiqini yozadi.

## 1. Maqsad

Chegirmani **QR / promo-kod** orqali ishlatish (`DISCOUNTS_BUSINESS_API §5.6`). Oqim ikki tomonli:

- **Student** e'lonni ochib `start` chaqiradi — server bir martalik **kod** beradi (`PENDING`), ilova uni QR yoki matn ko'rinishida ko'rsatadi.
- **Kassir — biznes egasi** kodni avval `verify` qiladi (yumshoq tekshiruv), so'ng `confirm` qiladi: `PENDING → CONFIRMED` va e'lonning `usedCount` bittaga oshadi.

Barcha endpointlar `{listingId}` ga bog'langan. Kassir tomonidagi uchala endpoint (`verify`, `confirm`, `redemptions`) **owner-scoped**: e'lonning biznesi **chaqiruvchiga tegishli** bo'lishi shart, aks holda **403**. Student `start` esa faqat student token bilan ishlaydi (ownership yo'q — kod studentning o'ziniki).

Limitlar (`totalLimit`, `perUserLimit` + `perUserPeriod`) **ikki joyda** tekshiriladi: `start` da (kod berishdan oldin) va `confirm` da (yozishdan oldin).

---

## 2. Endpointlar

| METHOD + path | Scope | Maqsad |
|---|---|---|
| `POST /v1/listings/{listingId}/redeem/start` | 👤 Student | Bir martalik kod berish (`PENDING`) |
| `POST /v1/listings/{listingId}/redeem/verify` | 🏢 Business · 🔓 Owner-scoped | Kodni yumshoq tekshirish (doim 200) |
| `POST /v1/listings/{listingId}/redeem/confirm` | 🏢 Business · 🔓 Owner-scoped | Kodni ishlatilgan deb belgilash (`CONFIRMED`) |
| `GET /v1/listings/{listingId}/redemptions` | 🏢 Business · 🔓 Owner-scoped | E'lonning `CONFIRMED` tarixi (paginatsiya) |

**Guard'lar:** `start` → `JwtAuthGuard + StudentGuard`; qolgan uchtasi → `JwtAuthGuard + BusinessAccountGuard` + service ichida ownership tekshiruvi.

> **Swagger izohi (haqiqiy holat):** `start` controller `@ApiTags('Discounts (student feed)')` ostida, kassir controller esa `@ApiTags('Redemptions')` ostida hujjatlangan — Swagger UI'da bu ikkisi **alohida bo'limda** ko'rinadi.

---

## 3. `POST /v1/listings/{listingId}/redeem/start` — 👤 Student

E'lon uchun bir martalik `PENDING` kod beradi (yoki mavjud amaldagisini qaytaradi). **201 Created.**

**Request:** body yo'q. Faqat `Authorization: Bearer <accessToken>`.

**Response `result` (`StartRedemptionResponseDto`):**

| Maydon | Tur | Izoh |
|---|---|---|
| `code` | `string` | Bir martalik kod (12 belgi, uppercase-hex). Ilova QR yoki matn qilib ko'rsatadi |
| `expiresAt` | `string` (ISO-8601) | Kod muddati — `start` dan ~**10 daqiqa** keyin |

```jsonc
{
  "success": true, "status": 201, "code": null, "message": "OK",
  "result": { "code": "9F2A7C4B1E80", "expiresAt": "2026-07-28T10:40:00Z" },
  "error": null
}
```

**LOGIKA:**
- E'lon topilmasa → **404** `LISTING_NOT_FOUND`.
- E'lon `status !== ACTIVE` → **409** `LISTING_NOT_ACTIVE`.
- Limit tugagan bo'lsa (`totalLimit` yoki `perUserLimit`) → **409** `REDEMPTION_LIMIT_REACHED`.
- **Reuse:** shu `(student, listing)` juftligi uchun **muddati o'tmagan `PENDING`** kod bo'lsa — **o'sha kod qayta qaytariladi** (yangi kod yaratilmaydi). Yo'q bo'lsa — yangi `PENDING` yaratiladi (`TTL 10 daqiqa`).

**FILTRLAR:** yo'q.

---

## 4. `POST /v1/listings/{listingId}/redeem/verify` — 🏢 Business · 🔓 Owner-scoped

Kassir kodni **yumshoq** tekshiradi. **Doim 200** — hech qachon 4xx kod noto'g'ri deb tashlanmaydi; natija `isValid` + `invalidReason` orqali beriladi. (Owner/listing tekshiruvi 4xx tashlashi mumkin — pastga qarang.)

**Request body (`VerifyRedemptionRequestDto`):**

| Maydon | Tur / validatsiya | Izoh |
|---|---|---|
| `code` | `string`, `@IsNotEmpty` | Student ko'rsatgan kod (QR mazmuni yoki aytilgan matn) |

**Response `result` (`VerifyRedemptionResponseDto`):**

| Maydon | Tur | Izoh |
|---|---|---|
| `isValid` | `boolean` | Kod hozir `confirm` qilinishga yaroqlimi |
| `invalidReason` | `InvalidReason \| null` | Yaroqsiz bo'lsa sabab; yaroqli bo'lsa `null` |
| `student` | `RedemptionStudentDto \| null` | Yaroqli bo'lsa — kimning kodi; aks holda `null` |
| `discount` | `RedemptionDiscountDto \| null` | Yaroqli bo'lsa — kassir qo'llaydigan chegirma; aks holda `null` |

`RedemptionDiscountDto`: `type` (`DiscountType`) · `value` (`number`) · `finalPrice` (int64 so'm) · `originalPrice` (int64 so'm).

**BaseResponse (yaroqli kod):**
```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": {
    "isValid": true,
    "invalidReason": null,
    "student": { "id": "stu_01H...", "fullName": "Aziz Karimov", "username": "aziz", "universityId": "tuit" },
    "discount": { "type": "PERCENT", "value": 20, "finalPrice": 40000, "originalPrice": 50000 }
  },
  "error": null
}
```

**BaseResponse (yaroqsiz kod — muddati o'tgan):**
```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": { "isValid": false, "invalidReason": "EXPIRED", "student": null, "discount": null },
  "error": null
}
```

**LOGIKA (`invalidReason` tartibi bo'yicha):**
1. Kod topilmasa **yoki** boshqa e'longa tegishli bo'lsa → `INVALID_CODE`.
2. Status allaqachon `CONFIRMED` → `ALREADY_REDEEMED`.
3. Muddati o'tgan (`status === EXPIRED` yoki `expiresAt < now`) → `EXPIRED`.
4. Limit tugagan → `LIMIT_REACHED`.
5. Hech biri emas → `isValid: true`, `student` + `discount` to'ldiriladi.

> **Diqqat:** owner/listing tekshiruvi kod tekshiruvidan **oldin** ishlaydi — e'lon yo'q → **404** `LISTING_NOT_FOUND`; biznes topilmasa → **404** `BUSINESS_NOT_FOUND`; boshqa egaga tegishli → **403** `FORBIDDEN`. Bular yumshoq emas (haqiqiy 4xx).

**FILTRLAR:** yo'q.

---

## 5. `POST /v1/listings/{listingId}/redeem/confirm` — 🏢 Business · 🔓 Owner-scoped

Kodni ishlatilgan deb belgilaydi: `PENDING → CONFIRMED`, e'lonning `usedCount` bittaga oshadi. Bir tranzaksiyada, `PENDING` statusiga guard bilan (concurrency-safe). **200 OK.**

**Request body (`ConfirmRedemptionRequestDto`):**

| Maydon | Tur / validatsiya | Izoh |
|---|---|---|
| `code` | `string`, `@IsNotEmpty` | Tasdiqlanayotgan kod |
| `branchId` | `string`, ixtiyoriy | Qaysi filialda ishlatildi (biznesga tegishli bo'lishi shart) |
| `amount` | `number` (int), `@Min(0)`, ixtiyoriy | Kassada qo'llangan summa — butun **so'm** |

**Response `result` (`RedemptionDto`):** 6-bo'limga qarang.

**BaseResponse (muvaffaqiyat):**
```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": {
    "id": "rdm_01H...",
    "listingId": "lst_01H...",
    "branchId": "brn_01H...",
    "student": { "id": "stu_01H...", "fullName": "Aziz Karimov", "username": "aziz", "universityId": "tuit" },
    "amount": 40000,
    "redeemedAt": "2026-07-28T10:35:00Z"
  },
  "error": null
}
```

**LOGIKA:**
- Owner/listing tekshiruvi (404 `LISTING_NOT_FOUND` / 404 `BUSINESS_NOT_FOUND` / 403 `FORBIDDEN`).
- Kod topilmasa **yoki** `listingId` mos kelmasa → **404** `REDEMPTION_INVALID_CODE` (`Kod noto'g'ri`).
- Status `CONFIRMED` → **409** `ALREADY_REDEEMED`.
- Muddati o'tgan → **409** `REDEMPTION_INVALID_CODE` (`Kod muddati tugagan`).
  > ⚠️ **Bir xil `error.code`, boshqa HTTP status:** noma'lum kod → **404** `REDEMPTION_INVALID_CODE`; muddati o'tgan kod → **409** `REDEMPTION_INVALID_CODE`. Klient ikkalasini `status` bo'yicha ajratadi.
- Limit tugagan → **409** `REDEMPTION_LIMIT_REACHED`.
- `branchId` berilgan-u, u bu biznesga tegishli emas → **422** `VALIDATION_ERROR` (`fields.branchId`).
- **Race:** tranzaksiyada `PENDING → CONFIRMED` boshqa so'rov tomonidan yutib olingan bo'lsa → **409** `ALREADY_REDEEMED`.

**FILTRLAR:** yo'q.

---

## 6. `GET /v1/listings/{listingId}/redemptions` — 🏢 Business · 🔓 Owner-scoped

E'lonning **faqat `CONFIRMED`** redemption tarixi, eng yangisidan (`redeemedAt desc`). **1-based paginatsiya** (00-overview 1-tur).

**Query (`RedemptionsQueryDto`):**

| Param | Tur / validatsiya | Default | Izoh |
|---|---|---|---|
| `page` | int, `@Min(1)` | `1` | 1-based sahifa |
| `size` | int, `@Min(1)` `@Max(100)` | `20` | Sahifa hajmi |

**Response `result` (`RedemptionPageDto`):** `{ items: RedemptionDto[], page, size, total, hasNext }`. `hasNext = page * size < total`.

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": {
    "items": [
      {
        "id": "rdm_01H...", "listingId": "lst_01H...", "branchId": "brn_01H...",
        "student": { "id": "stu_01H...", "fullName": "Aziz Karimov", "username": "aziz", "universityId": "tuit" },
        "amount": 40000, "redeemedAt": "2026-07-28T10:35:00Z"
      }
    ],
    "page": 1, "size": 20, "total": 1, "hasNext": false
  },
  "error": null
}
```

**LOGIKA:** owner/listing tekshiruvi (404 `LISTING_NOT_FOUND` / 404 `BUSINESS_NOT_FOUND` / 403 `FORBIDDEN`), so'ng shu `listingId` bo'yicha `CONFIRMED` yozuvlar. `PENDING` va `EXPIRED` tarixda **ko'rinmaydi**.

**FILTRLAR:** faqat `page` / `size`. Sana oralig'i, filial, student yoki summa bo'yicha filtr **yo'q**.

### `RedemptionDto` (confirm + tarix, `elon-uz.json` `RedemptionDto`)

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `string` | Redemption id |
| `listingId` | `string` | |
| `branchId` | `string \| null` | `confirm` da berilgan filial (ixtiyoriy) |
| `student` | `RedemptionStudentDto` | `{ id, fullName, username, universityId }` — barchasi nullable (student maydonlariga qarab) |
| `amount` | `number \| null` (int64) | Kassada qo'llangan butun **so'm**; kassir kiritmasa `null` |
| `redeemedAt` | `string \| null` (ISO-8601) | Tasdiqlangan vaqt |

> `RedemptionDto` da `code` va `status` **yo'q** — tarix faqat `CONFIRMED` yozuvlar bo'lgani uchun status ortiqcha, kod esa bir martalik/maxfiy.

---

## 7. Enumlar

| Enum | Qiymatlar | Izoh |
|---|---|---|
| `RedemptionStatus` | `PENDING` · `CONFIRMED` · `EXPIRED` | `start` → `PENDING`; `confirm` → `CONFIRMED`; muddati o'tgan `PENDING` — `EXPIRED` deb qaraladi. Wire = Prisma `RedemptionStatus`. **Tashqi response'da bevosita ko'rsatilmaydi** (`RedemptionDto`da yo'q) |
| `InvalidReason` (verify) | `INVALID_CODE` · `ALREADY_REDEEMED` · `EXPIRED` · `LIMIT_REACHED` · `null` | Faqat `verify` javobidagi `invalidReason` |
| `DiscountType` (verify `discount`) | Listings modulidagi bilan bir xil (`PERCENT` · `FIXED` · …) | `RedemptionDiscountDto.type` |

---

## 8. Xatolar

| HTTP | `error.code` | Qachon | `message` (o'zbekcha) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token yo'q/yaroqsiz / muddati o'tgan | — (umumiy) |
| 403 | `FORBIDDEN` | Chaqiruvchi biznes emas, yoki e'lon boshqa egaga tegishli | — (umumiy) |
| 404 | `LISTING_NOT_FOUND` | E'lon topilmadi (`start`, `verify`, `confirm`, `list`) | `E'lon topilmadi` |
| 404 | `BUSINESS_NOT_FOUND` | E'lon biznesi topilmadi (defensiv, owner tekshiruvida) | `Biznes topilmadi` |
| 404 | `REDEMPTION_INVALID_CODE` | `confirm`: kod noma'lum yoki boshqa e'longa tegishli | `Kod noto'g'ri` |
| 409 | `LISTING_NOT_ACTIVE` | `start`: e'lon `ACTIVE` emas | `E'lon faol emas` |
| 409 | `ALREADY_REDEEMED` | `confirm`: kod allaqachon `CONFIRMED` (yoki race) | `Kod allaqachon ishlatilgan` |
| 409 | `REDEMPTION_INVALID_CODE` | `confirm`: kod muddati o'tgan (**404 bilan bir xil kod**) | `Kod muddati tugagan` |
| 409 | `REDEMPTION_LIMIT_REACHED` | `start`/`confirm`: `totalLimit` yoki `perUserLimit` tugagan | `Chegirma limiti tugagan` |
| 422 | `VALIDATION_ERROR` | DTO validatsiyasi; yoki `confirm`: `branchId` bu biznesga tegishli emas | `error.fields` bilan (`{ "branchId": "Filial ushbu biznesga tegishli emas" }`) |

> `verify` **hech qachon** kod holatiga qarab 4xx tashlamaydi (yumshoq — doim 200); yuqoridagi 401/403/404-listing/404-business esa `verify`da ham amal qiladi (owner/listing bosqichi).

---

## 9. Admin panel eslatmasi

🔓 **Owner-scoped — e'lonning biznesiga bog'langan.** Redemption tarixi (`GET /listings/{listingId}/redemptions`) **faqat o'z biznesining bitta e'loni** kesimida beriladi. Mavjud API'da:

- **Global redemption ko'rinishi YO'Q** — barcha bizneslar bo'yicha redemption'lar ro'yxati mumkin emas.
- **Student bo'yicha cross-business qidiruv YO'Q** — bitta student qayerda va nechta chegirma ishlatganini biznes chegarasidan tashqarida ko'rib bo'lmaydi.
- **Admin `verify` / `void` / `refund` YO'Q** — kod tekshirish/tasdiqlash faqat egasi (kassir) qo'lida; bekor qilish yoki qaytarish endpointi umuman yo'q.
- Tarix **faqat `CONFIRMED`** — `PENDING`/`EXPIRED` (ishlatilmagan yoki muddati o'tgan) kodlar audit uchun ko'rinmaydi.

**Natija:** redemptions-audit / firibgarlik (fraud) paneli uchun mavjud endpointlar **yetarli emas**. Backend permission bilan **cross-business redemption so'rovi**ni ochishi kerak, masalan:
- `GET /admin/redemptions` (barcha biznes/e'lon bo'yicha, filtr: sana oralig'i, `businessId`, `listingId`, `studentId`, `branchId`, `status` + paginatsiya),
- `GET /admin/students/:id/redemptions` (bitta student bo'yicha cross-business tarix),
- (agar kerak bo'lsa) admin `void`/`refund` — hozircha spec'da yo'q.

To'liq ro'yxat: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
