# 03 — Business (biznes CRUD)

> Konvensiyalar (envelope, auth, guard'lar, scope belgilar, error) — [`00-overview.md`](./00-overview.md)da. Bu fayl faqat shu modulga xos mantiqni yozadi.

## 1. Maqsad

Biznes egasi (`business_owners`) o'z bizneslarini **yaratadi, ko'radi, tahrirlaydi va arxivlaydi**. Bir owner'da bir nechta biznes bo'lishi mumkin. Har biznes bitta **`type`** (katalogdan, masalan `NATIONAL_FOOD`) ga tegishli — bu tur yaratilgandan keyin **o'zgarmas** (immutable). Biznes filiallar (`branches`) va e'lonlar (`listings`) uchun "ota" obyekt.

Barcha endpointlar **`JwtAuthGuard` + `BusinessAccountGuard`** ostida: faqat biznes token ishlaydi (student token → **403**), va har amal **faqat chaqiruvchining o'z biznesi** ustidan (ownership tekshiruvi — begonaning biznesi → **403**).

> **MVP xatti-harakati (muhim):** biznes yaratilganda darrov **`status: APPROVED`** bo'ladi (`business.service.ts` — moderatsiyani kutmasdan e'lon chiqarish uchun). Submit/approve/reject/block oqimi **hali yo'q**. ⚠️ Kod ichida nomuvofiqlik: controller Swagger tavsifi "Created with status = DRAFT" deydi, lekin service aslida `APPROVED` beradi — haqiqiy holat **APPROVED**.

---

## 2. Endpointlar

| METHOD + path | Scope | Maqsad |
|---|---|---|
| `POST /v1/business` | 🏢 🔓 | Biznes yaratish (owner token'dan) |
| `GET /v1/business/my` | 🏢 🔓 | O'z bizneslari ro'yxati (**arxivlangansiz**, **paginatsiyasiz array**) |
| `GET /v1/business/:id` | 🏢 🔓 | Bitta biznes (faqat egasi) |
| `PUT /v1/business/:id` | 🏢 🔓 | Biznesni tahrirlash (faqat egasi) |
| `DELETE /v1/business/:id` | 🏢 🔓 | Biznesni arxivlash (soft-delete, HTTP 200) |

Scope: 🏢 **Business** (faqat biznes token) · 🔓 **Self-scoped** (faqat o'z biznesi; begonaniki → 403).

---

## 3. Har endpoint

### `POST /v1/business` — yaratish 🏢 🔓

**Request** — `CreateBusinessDto`:

| Field | Turi | Majburiy | Qoida |
|---|---|---|---|
| `type` | string | ✅ | Uzunlik 1–64; katalogda mavjud bo'lishi shart (`BUSINESS_TYPE_NOT_FOUND` 422). Yaratilgach **o'zgarmas** |
| `name` | string | ✅ | Uzunlik 2–80 |
| `phone` | string | ✅ | E.164 (`^\+[1-9]\d{1,14}$`), masalan `+998901234567` |
| `legalName` | string? | — | |
| `inn` | string? | — | 9 raqam (masalan `301234567`) |
| `description` | string? | — | max 1000 |
| `logoUrl` | string? | — | |
| `coverUrl` | string? | — | |
| `contacts` | object? | — | `{ telegram?, instagram?, website? }` |
| `isOnlineOnly` | boolean? | — | default `false` |

**Logika:**
- `ownerUserId` **token'dan** olinadi (`req.user.id`) — client yubormaydi.
- Katalog tekshiruvi: `type` mavjud bo'lmasa → **422 `BUSINESS_TYPE_NOT_FOUND`**.
- **Telefon tasdiqlangan bo'lishi shart (D1):** owner telefoni tasdiqlanmagan bo'lsa → **403 `PHONE_NOT_VERIFIED`** ("Avval telefoningizni tasdiqlang").
- Yaratilgan biznes **`status: APPROVED`** (MVP auto-approve).
- **Response:** `BusinessDto` (HTTP 201).

### `GET /v1/business/my` — o'z bizneslari 🏢 🔓

**Request:** yo'q (query yo'q).

**Logika:**
- Faqat token egasining bizneslari (`findManyByOwner`).
- **`ARCHIVED` bizneslar chiqmaydi** (soft-delete qilinganlar yashiriladi).
- **Response:** `BusinessDto[]` — **oddiy array, paginatsiya YO'Q** (`items/page/size/total/hasNext` **emas**). Bu modulda paginatsiya ishlatilmaydi.

### `GET /v1/business/:id` — bitta biznes 🏢 🔓

**Logika (`loadOwned`):**
- Biznes topilmasa **yoki** `ARCHIVED` bo'lsa → **404 `BUSINESS_NOT_FOUND`** ("Biznes topilmadi").
- `business.ownerId !== req.user.id` (begonaning biznesi) → **403 `FORBIDDEN`** (404 emas — mavjudligini oshkor qilmaydi, lekin egalik buzilsa 403 qaytadi).
- **Response:** `BusinessDto`.

### `PUT /v1/business/:id` — tahrirlash 🏢 🔓

**Request** — `UpdateBusinessDto` (barcha maydon ixtiyoriy; yo'q maydon o'zgarmaydi): `name`, `phone`, `legalName`, `inn`, `description`, `logoUrl`, `coverUrl`, `contacts`, `isOnlineOnly` — validatsiyasi create bilan bir xil.

**`type` maydoni:** spec DTO'sida yo'q; faqat **o'zgartirishga urinishni rad etish** uchun qabul qilinadi. Yuborilgan `type` joriy qiymatdan farq qilsa → **422 `BUSINESS_TYPE_IMMUTABLE`** ("Biznes turini o'zgartirib bo'lmaydi"). Bir xil qiymat yuborilsa — muammosiz.

**Logika:**
- Avval `loadOwned` (404 topilmasa/arxiv, 403 begona).
- **Response:** yangilangan `BusinessDto`.

### `DELETE /v1/business/:id` — arxivlash 🏢 🔓

**Logika:**
- `loadOwned` (404/403).
- **Soft-delete:** biznes → **`ARCHIVED`**, uning barcha e'lonlari ham `ARCHIVED`ga o'tadi (cascade). Baza'dan **o'chirilmaydi**.
- **HTTP 200** (204 emas), **`result: null`**.
- Arxivlangan biznes bundan keyin `GET /my`da chiqmaydi va `GET/:id`da **404** beradi.

---

### BusinessDto (response shape)

| Field | Turi | Izoh |
|---|---|---|
| `id` | string | cuid |
| `ownerUserId` | string | Token'dan hal qilingan egasi |
| `type` | string | Biznes turi kaliti (immutable) |
| `name` | string | |
| `legalName` | string \| null | |
| `inn` | string \| null | 9 raqam |
| `description` | string \| null | |
| `logoUrl` | string \| null | |
| `coverUrl` | string \| null | |
| `phone` | string | E.164 |
| `contacts` | object \| null | `{ telegram, instagram, website }` (har biri string \| null) |
| `isOnlineOnly` | boolean | true → filial/lokatsiya shart emas (masalan onlayn kurs) |
| `status` | `BusinessStatus` | Amalda faqat `APPROVED` (yoki arxivlangач `ARCHIVED`) |
| `rejectionReason` | string \| null | Hozir **doim `null`** (reject oqimi yo'q) |
| `rating` | number \| null | O'rtacha reyting (double) |
| `reviewsCount` | number | |
| `listingsCount` | number | |
| `createdAt` | string | ISO-8601 |

**Success (`GET /v1/business/:id`) — BaseResponse:**
```jsonc
{
  "success": true,
  "status": 200,
  "code": null,
  "message": "OK",
  "result": {
    "id": "biz_01H8X",
    "ownerUserId": "own_01H8Q",
    "type": "NATIONAL_FOOD",
    "name": "Navruz Cafe",
    "legalName": "Navruz Food MChJ",
    "inn": "301234567",
    "description": "Milliy taomlar",
    "logoUrl": "https://cdn.elon.uz/biz/logo.png",
    "coverUrl": null,
    "phone": "+998901234567",
    "contacts": { "telegram": "@navruz_cafe", "instagram": "navruz.cafe", "website": null },
    "isOnlineOnly": false,
    "status": "APPROVED",
    "rejectionReason": null,
    "rating": null,
    "reviewsCount": 0,
    "listingsCount": 3,
    "createdAt": "2026-07-16T10:30:00Z"
  },
  "error": null
}
```

**Error — begonaning biznesi (403):**
```jsonc
{
  "success": false,
  "status": 403,
  "code": null,
  "message": "Bu amal uchun ruxsat yo'q",
  "result": null,
  "error": { "code": "FORBIDDEN", "message": "Bu amal uchun ruxsat yo'q", "fields": {} }
}
```

---

## 4. Enumlar

### `BusinessStatus`

| Qiymat | Amalda erishiladimi? |
|---|---|
| `DRAFT` | ❌ yo'q (submit oqimi yo'q) |
| `PENDING_REVIEW` | ❌ yo'q (moderatsiya oqimi yo'q) |
| `APPROVED` | ✅ create'da avto-o'rnatiladi |
| `REJECTED` | ❌ yo'q (reject endpoint yo'q) |
| `BLOCKED` | ❌ yo'q (block endpoint yo'q) |
| `ARCHIVED` | ✅ DELETE (soft-delete) |

> Enum'da 6 qiymat bor, lekin **bugun faqat `APPROVED` va `ARCHIVED` erishiladi**. `DRAFT/PENDING_REVIEW/REJECTED/BLOCKED` va `rejectionReason` maydoni — moderatsiya oqimi qo'shilmaguncha **ishlatilmaydi** (o'lik enum qiymatlar). `ARCHIVED` wire'da ko'rinmaydi (list'dan chiqadi, read'da 404).

---

## 5. Xatolar

| `error.code` | HTTP | Qachon |
|---|---|---|
| `UNAUTHORIZED` / `TOKEN_EXPIRED` | 401 | Token yo'q/yaroqsiz / muddati o'tgan |
| `FORBIDDEN` | 403 | (a) student token (`BusinessAccountGuard`); (b) begona owner'ning biznesi (`loadOwned`) |
| `PHONE_NOT_VERIFIED` | 403 | Create'da owner telefoni tasdiqlanmagan (D1) |
| `BUSINESS_NOT_FOUND` | 404 | `:id` topilmadi yoki arxivlangan |
| `BUSINESS_TYPE_NOT_FOUND` | 422 | Create'da `type` katalogda yo'q (`fields.type`) |
| `BUSINESS_TYPE_IMMUTABLE` | 422 | Update'da `type` joriy qiymatdan farq qiladi (`fields.type`) |
| `VALIDATION_ERROR` | 422 | DTO validatsiyasi (masalan `name` 2–80 emas, `phone` E.164 emas) — `fields` bilan |

---

## 6. Admin panel eslatmasi

Bu modul (mobil) hamon **🔓 owner-scoped** — `GET /business/my` faqat token egasining bizneslari, `GET /business/:id` begona biznesda **403**. Bular o'zgarmaydi. Admin uchun esa alohida qatlam:

**a) Cross-owner ko'rish + tahrir — ✅ built.** [`ADMIN-API.md`](./ADMIN-API.md):
- `GET /v1/admin/businesses` — filtr (`q`, `ownerId`, `status[]`, `type`, `regionId`, `isOnlineOnly`, sana) + **paginatsiya** (Faza 1);
- `GET /v1/admin/businesses/:id` — **har qanday** biznesni ko'rish, ownership bypass (ARCHIVED ham) (Faza 1);
- `PUT /v1/admin/businesses/:id` — admin tahrir (owner-bypass, mavjud validatsiya qayta ishlatiladi; type immutable) (Faza 3).

**b) Moderatsiya oqimi — 🔴 hali yo'q (ataylab o'tkazib yuborilgan).** `BusinessStatus` enum'ida `PENDING_REVIEW/REJECTED/BLOCKED` bor, lekin **hech bir endpoint ularni o'rnatmaydi** — create avto `APPROVED`, `rejectionReason` doim `null`. Approve/reject/block/unblock oqimi hozircha kerak emas deb qoldirilgan. To'liq reja: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
