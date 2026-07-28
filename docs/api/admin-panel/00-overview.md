# 00 — Overview (API reference for the admin panel)

Bu papka (`docs/api/admin-panel/`) — **loyihaning mavjud API'sining to'liq referensi**: har modul, har endpoint uchun maqsad, logika, request/response, **filtrlar** va **auth-scope**. Admin panel frontendi buni **Swagger** (`/docs`, `elon-uz.json`) bilan **birga** ishlatadi: Swagger — sxema (raw shape), bu doc — mantiq, filtrlar va "admin panelda qanday ishlatiladi" izohi.

> **Bu doc mavjud endpointlarni tasvirlaydi (yangi API emas).** Har endpoint yonida **auth-scope** va zarur joyda **"Admin panel eslatmasi"** bor — chunki ko'p endpoint owner/student-scoped (faqat "o'zini" qaytaradi), va admin panel hamma ma'lumotni boshqarishi uchun bu scope backend'da permission bilan ochilishi kerak (pastga qarang). Backend uchun to'liq ish ro'yxati: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).

---

## Base URL

```
https://api.studentclub.uz/v1
```

Barcha endpointlar yagona **`/v1`** prefiksida (provider ham, student ham — alohida `/provider/v1` yo'q). *(Ishlaydigan host — `api.studentclub.uz`; `api.elon.uz` faol emas.)*

---

## Auth model va guard'lar (mavjud)

Backend o'zi autentifikatsiya qiladi (Firebase emas). **Ikki account turi, alohida jadval:** `students` va `business_owners`. Token'da `type` (`student` | `business`) bo'ladi.

| Guard (kodda) | Nima qiladi |
|---|---|
| `JwtAuthGuard` | Bearer access token'ni tekshiradi, `req.user = { id, type }` beradi. Student/biznesni **o'zi ajratmaydi**. |
| `BusinessAccountGuard` | `JwtAuthGuard`dan keyin: `type !== business` bo'lsa **403**. |
| `StudentGuard` | `type !== student` bo'lsa **403**. |
| `OptionalJwtAuthGuard` | Public; token bo'lsa `user` biriktiradi (personalizatsiya uchun). |
| `AdminJwtGuard` | Admin panelning **o'z** Bearer JWT'sini tekshiradi (`POST /v1/admin/auth/login`'dan). Rollar `ADMIN`/`MODERATOR`, kerak joyda `@Roles`bilan cheklanadi. **Barcha** `/v1/admin/*` endpointlar shu guard ostida — → [`ADMIN-API.md`](./ADMIN-API.md). |
| `ThrottlerGuard` | Rate-limit (OTP, media, reports...). |

Har so'rovda: `Authorization: Bearer <accessToken>`. Token yo'q/yaroqsiz → **401** `UNAUTHORIZED`; muddati o'tgan → **401** `TOKEN_EXPIRED`.

### Scope belgilar (har endpoint yonida)
| Belgi | Ma'no |
|---|---|
| 🌐 **Public** | Token shart emas |
| 🔒 **Auth** | Har qanday login qilingan (student yoki biznes) |
| 👤 **Student** | Faqat student token (`StudentGuard`) |
| 🏢 **Business** | Faqat biznes token (`BusinessAccountGuard`) |
| 🔑 **Admin** | Admin panel JWT (`AdminJwtGuard`, rollar `ADMIN`/`MODERATOR`) — [`ADMIN-API.md`](./ADMIN-API.md) |
| 🔓 **Self-scoped** | Faqat **chaqiruvchining o'z** ma'lumotini qaytaradi/o'zgartiradi (ownership) |

---

## Response envelope — `BaseResponse` (har javob)

**Success:**
```jsonc
{ "success": true, "status": 200, "code": null, "message": "OK", "result": <payload>, "error": null }
```
**Error:**
```jsonc
{ "success": false, "status": 404, "code": null, "message": "<o'zbekcha>", "result": null,
  "error": { "code": "LISTING_NOT_FOUND", "message": "<o'zbekcha>", "fields": {} } }
```
- HTTP status **===** `status`. Success'da `error: null`; error'da `result: null`.
- `message` — doim o'zbekcha (user-facing). Validatsiya (422) → `error.fields: { "<field>": "<uzbek>" }`.

---

## Pagination — ⚠️ ikki xil (haqiqiy holat)

Mavjud kodda **ikki xil** paginatsiya bor — buni bilib turing:

1. **Standart (1-based)** — aksariyat ro'yxatlar (`listings`, `redemptions`, `connections`, `conversations`, `students`):
   ```jsonc
   { "items": [...], "page": 1, "size": 20, "total": 137, "hasNext": true }
   ```
   Query: `?page=1&size=20`. `page` **1-based**, `size` default 20 (max 100).

2. **Discounts feed (0-based)** — `POST /v1/discounts/search` va u bilan bog'liq feed:
   - Request'da `page: { number: 0, size: 20 }` — `number` **0-based** (default 0), `size` default 20 (**max 50**).
   - Response: `{ items, page, size, total, hasNext }`.

> Har modul faylida qaysi turdagi paginatsiya ekani ko'rsatiladi. (Chat xabar tarixi — cursor-based: `{ items, hasMore }`.)

---

## Umumiy formatlar

| Narsa | Qoida |
|---|---|
| **Pul** | Butun **so'm** (`BigInt` → JSON `Number`). `currency: "UZS"`. Kasr yo'q. |
| **Sana** | **ISO-8601** (`"2026-07-28T10:30:00Z"`). |
| **ID** | String (cuid). Geo/catalog kalitlari string (`"TOSHKENT_SHAHRI"`). |
| **Enum** | UPPER_SNAKE_CASE string. `CourseYear` wire qiymatlari: `"1","2","3","4","MASTER"`. |
| **`finalPrice`** | Server hisoblaydi (`discountType`+`discountValue`dan). Client yuborgani e'tiborsiz. |

---

## Umumiy error kodlari

| `error.code` | HTTP |
|---|---|
| `UNAUTHORIZED` / `TOKEN_EXPIRED` | 401 |
| `FORBIDDEN` | 403 |
| `*_NOT_FOUND` | 404 |
| `INVALID_STATUS_TRANSITION` / `ALREADY_*` / `*_LIMIT_REACHED` | 409 |
| `VALIDATION_ERROR` (+ `fields`) | 422 |
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |

Modul-spetsifik kodlar har faylning **Xatolar** bo'limida.

---

## 🎯 Admin panel — muhim scope eslatmasi

Ko'p endpoint **🔓 self-scoped** yoki **owner-scoped**:
- `GET /profile/me` → faqat **o'zi**. `GET /profile/:id` yoki barcha foydalanuvchilar ro'yxati **yo'q**.
- `GET /business/my` → faqat **o'z** bizneslari. Barcha bizneslar ro'yxati **yo'q**.
- `GET /business/:businessId/listings` → faqat **o'z biznesi** e'lonlari (ownership tekshiruvi).
- `discounts/search` → faqat **ko'rinadigan** (ACTIVE + APPROVED) e'lonlar; DRAFT/PENDING/REJECTED **ko'rinmaydi**.

**Natija:** yuqoridagi mobil (student/biznes) endpointlar hamon self/owner-scoped — ular **o'zgarmaydi**. Ammo admin panel uchun *hamma* foydalanuvchi/biznes/e'lonni ko'radigan **cross-user admin qatlami endi qurilgan**: alohida `/v1/admin/*` endpointlar (owner-bypass, filtr + paginatsiya) `AdminJwtGuard` ostida — ✅ built, qarang [`ADMIN-API.md`](./ADMIN-API.md). Har faylning **"Admin panel eslatmasi"** bo'limida qaysi admin imkoniyat qurilgani (va nima hali kutilayotgani) ko'rsatiladi. To'liq reja: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).

Fayllar ro'yxati va o'qish tartibi: [`README.md`](./README.md).
