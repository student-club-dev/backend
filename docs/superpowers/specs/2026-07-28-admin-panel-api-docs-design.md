# Admin Panel API hujjatlari — Design / Spec

- **Sana:** 2026-07-28
- **Holat:** Tasdiqlash kutilmoqda (user review)
- **Muallif:** Claude (brainstorming skill)
- **Deliverable:** `docs/api/admin/` ostidagi section-bo'yicha markdown hujjatlar to'plami (frontend admin panelni ketma-ket implement qilishi uchun).

---

## 1. Kontekst va reallik

Bu spec **admin panel frontend** uchun API hujjatlarini belgilaydi. Loyihada `elon-uz.json` swagger bor, lekin u **student + biznes mobil ilovalari** uchun. Admin uchun API **deyarli mavjud emas**:

- ✅ **Ma'lumot modellari** (Prisma) va **owner/student API'lari** to'liq bor: businesses, branches, listings, catalog, geo, redemptions, reports, chat.
- 🔴 **Admin-facing endpointlar deyarli yo'q.** Butun kodda yagona admin surface — `admin/business-types` (catalog CRUD), u ham placeholder `AdminGuard` (statik `X-Admin-Key` header) bilan. Boshqa har bir endpoint **owner-scoped** yoki **student-scoped** — hech kim boshqa foydalanuvchining ma'lumotini ko'ra olmaydi.
- 🔴 Moderatsiya holatlari (`BusinessStatus.REJECTED/BLOCKED`, `ListingStatus.REJECTED`, `ReportStatus.*`) enum'larda bor, lekin **hech qaysi endpoint ularni o'rnatmaydi** — MVP hammani avto-approve qiladi.
- 🔴 Admin identity yo'q: na `admins` jadvali, na role/isAdmin maydoni, na admin login.

**Shu sababli bu hujjatlar "mavjudni hujjatlash" emas — bu qurilishi kerak bo'lgan admin API uchun to'liq _contract / source of truth_.** Ular bir vaqtda (a) frontend implement qiladigan shartnoma, (b) backend quradigan spetsifikatsiya. Har endpoint **backend holati** belgisi bilan yoziladi.

### Backend holati belgilari (legend)
| Belgi | Ma'no |
|---|---|
| ✅ **MAVJUD** | Endpoint/logika hozir kodda bor (ehtimol boshqa scope'da), admin uchun qayta ishlatiladi. |
| 🔶 **KENGAYTIRISH** | Yaqin narsa bor (masalan read-only yoki owner-scoped), admin uchun kengaytirish/guard almashtirish kerak. |
| 🔴 **YANGI** | To'liq yangi qurilishi kerak (endpoint, ba'zan yangi model maydoni + migration). |

---

## 2. Umumiy konvensiyalar (barcha admin endpointlar uchun)

Loyihaning mavjud contract qoidalariga to'liq mos (`CLAUDE.md` → "API Contract & Response Envelope"):

- **Base URL:** `https://api.elon.uz/v1`. Barcha admin endpointlar **`/v1/admin/*`** prefiksida (mavjud `/v1/admin/business-types` bilan izchil).
- **Response envelope — `BaseResponse` har doim:**
  ```jsonc
  { "success": true,  "status": 200, "code": null, "message": "OK", "result": <payload>, "error": null }
  { "success": false, "status": 404, "code": null, "message": "<o'zbekcha>", "result": null,
    "error": { "code": "STUDENT_NOT_FOUND", "message": "<o'zbekcha>", "fields": {} } }
  ```
  HTTP status === `status` maydoni. `message` — doim o'zbekcha (user-facing). Validatsiya (422) → `error.fields: { "<field>": "<uzbek>" }`.
- **Pagination:** `result: { items, page, size, total, hasNext }` — aynan shu kalitlar. (Diqqat: mavjud kodda ikki xil paginatsiya bor — `discounts` feed `page` 0-based, boshqalar 1-based. **Admin API'da hammasi 1-based `page` (default 1), `size` default 20, max 100** — izchillik uchun.)
- **Pul:** butun so'm (`BigInt` → JSON'da `Number`), `currency: "UZS"`.
- **Sana:** ISO-8601 (`"2026-07-28T10:30:00Z"`).
- **Error codes:** `UNAUTHORIZED` `TOKEN_EXPIRED` (401) · `FORBIDDEN` (403) · `*_NOT_FOUND` (404) · `VALIDATION_ERROR` (422) · `INVALID_STATUS_TRANSITION` (409) · `RATE_LIMITED` (429) · `INTERNAL_ERROR` (500). Admin-spetsifik kodlar har section faylida.
- **Til:** izohlar o'zbekcha, endpoint/DTO/field nomlari va JSON misollar inglizcha.

### Admin ownership prinsipi
Admin token ownership tekshiruvini **bypass qiladi**: barcha bizneslar/e'lonlar/foydalanuvchilarni ko'radi va o'zgartiradi. Owner-scoped mobil endpointlar admin uchun ishlatilmaydi — o'rniga `/v1/admin/*` ostida cross-user variant beriladi (rol tekshiruvi bilan).

---

## 3. Admin identity va RBAC

User qarori: **alohida `admins` jadvali + JWT + rollar** (students/business_owners kabi 3-chi account turi).

### Yangi Prisma modeli
```prisma
model Admin {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  firstName    String?
  lastName     String?
  role         AdminRole  @default(MODERATOR)
  isActive     Boolean    @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  refreshTokens AdminRefreshToken[]
  @@map("admins")
}

enum AdminRole { SUPER_ADMIN  MODERATOR }
```
(+ `AdminRefreshToken` — students/owners refresh-token modeliga o'xshash: `tokenHash`, `deviceName?`, `platform?`, `ipAddress?`, `expiresAt`, `revokedAt?`.)

### Auth
- JWT access + refresh. Access payload: `{ sub: adminId, type: "admin", role }`. `AccountType` enum'ga `ADMIN = "admin"` qo'shiladi.
- Yangi guard'lar: **`AdminJwtGuard`** (token'ni tekshiradi, `type === "admin"` shart) + **`@Roles(...)` bilan `AdminRoleGuard`** (rol tekshiradi). Bular hozirgi placeholder `AdminGuard` (`X-Admin-Key`)ni almashtiradi; `admin/business-types` ham yangi guard'ga o'tadi.

### Permission matrix
| Imkoniyat | SUPER_ADMIN | MODERATOR |
|---|:---:|:---:|
| Dashboard, hamma ro'yxatlarni o'qish | ✅ | ✅ |
| Listings/Businesses moderatsiya (approve/reject/block) | ✅ | ✅ |
| Reports (shikoyatlar) navbatini boshqarish | ✅ | ✅ |
| Foydalanuvchilarni tahrirlash / ban | ✅ | ✅ (ban/suspend) |
| Foydalanuvchi/biznesni **o'chirish** (delete) | ✅ | ❌ |
| Catalog / geo / trade-centers config CRUD | ✅ | ❌ |
| **Adminlarni** boshqarish (yaratish/rol berish) | ✅ | ❌ |
| Audit log ko'rish | ✅ | ❌ |

> Bu matrix boshlang'ich; har section faylida endpoint yonida aniq rol ko'rsatiladi.

---

## 4. Folder va fayllar (bu bosqich: 00–07)

Joylashuv: **`docs/api/admin/`**. Har section — alohida raqamlangan `.md` (implement tartibida). `README.md` — indeks.

| # | Fayl | Qamrov | Holat |
|---|---|---|---|
| — | `README.md` | Indeks, implement tartibi, umumiy havolalar | — |
| 00 | `00-overview.md` | Konvensiyalar, envelope, error codes, pagination, money/date, admin-ownership prinsipi, backend-status legend | asos |
| 01 | `01-auth-and-rbac.md` | Admin login/refresh/logout/me, `admins`/`AdminRole` modeli, guard'lar, permission matrix, adminlarni boshqarish (SUPER_ADMIN) | 🔴 |
| 02 | `02-dashboard.md` | KPI/statistika: sonlar, status bo'yicha breakdown, pending moderatsiya/report navbatlari | 🔴 |
| 03 | `03-students.md` | Studentlar list/filter/search, ko'rish, tahrirlash, ban/unban, delete, sessiyalar, qurilmalar | 🔴 |
| 04 | `04-business-owners.md` | Biznes egalari list/filter, ko'rish, tahrirlash, ban/unban, ularning bizneslari, sessiyalar | 🔴 |
| 05 | `05-businesses.md` | Hamma bizneslar (filtr: owner/status/type/region), ko'rish, tahrirlash, moderatsiya (approve/reject/block/unblock), archive; status lifecycle | 🔴 |
| 06 | `06-branches-stores.md` | Hamma do'konlar/manzillar globally, filtr (region/district/trade-center/isActive/geo), ko'rish, tahrirlash, activate/deactivate | 🔴 |
| 07 | `07-listings.md` | Hamma e'lonlar to'liq filtr bilan (status incl. DRAFT/PENDING/REJECTED, category, region, narx, geo, sana), ko'rish, tahrirlash, moderatsiya (approve/reject), force status, stats | 🔴 |

**Keyingi bosqich (bu pass'da emas):** `08-catalog`, `09-geo`, `10-trade-centers`, `11-redemptions`, `12-reports-complaints`, `13-audit-log`.

### Endpoint inventari (yuqori daraja — to'liq DTO'lar section fayllarida)

**01 — Auth & RBAC**
- `POST /v1/admin/auth/login` (public) · `POST /v1/admin/auth/refresh` (public) · `POST /v1/admin/auth/logout` (admin) · `GET /v1/admin/auth/me` (admin)
- `GET/POST /v1/admin/admins`, `GET/PUT /v1/admin/admins/:id`, `POST /v1/admin/admins/:id/deactivate`, `POST /v1/admin/admins/:id/reset-password` — **SUPER_ADMIN**

**02 — Dashboard**
- `GET /v1/admin/dashboard/stats` — jami sonlar + status breakdown + pending navbatlar
- `GET /v1/admin/dashboard/timeseries?metric=&range=` — signups/listings vaqt bo'yicha (ixtiyoriy)

**03 — Students** (yangi maydon kerak: `Student.status`/`bannedAt`/`banReason` → migration)
- `GET /v1/admin/students` (filtr) · `GET /v1/admin/students/:id` · `PUT /v1/admin/students/:id`
- `POST /v1/admin/students/:id/ban` · `POST /v1/admin/students/:id/unban` · `DELETE /v1/admin/students/:id` (SUPER_ADMIN)
- `GET /v1/admin/students/:id/sessions` · `DELETE /v1/admin/students/:id/sessions` · `GET /v1/admin/students/:id/devices`

**04 — Business owners** (yangi maydon: `BusinessOwner.status`/`bannedAt`/`banReason`)
- `GET /v1/admin/business-owners` · `GET/:id` · `PUT/:id` · `POST/:id/ban` · `POST/:id/unban`
- `GET /v1/admin/business-owners/:id/businesses` · `GET /v1/admin/business-owners/:id/sessions`

**05 — Businesses**
- `GET /v1/admin/businesses` (filtr) · `GET/:id` · `PUT/:id`
- `POST/:id/approve` · `POST/:id/reject` (reason) · `POST/:id/block` (reason) · `POST/:id/unblock` · `DELETE/:id` (archive)

**06 — Branches / stores**
- `GET /v1/admin/branches` (filtr: businessId, regionId, districtId, tradeCenterId, isActive, geo) · `GET/:id` · `PUT/:id`
- `POST/:id/activate` · `POST/:id/deactivate` · `DELETE/:id`

**07 — Listings**
- `GET /v1/admin/listings` (to'liq filtr) · `GET/:id` · `PUT/:id`
- `POST/:id/approve` · `POST/:id/reject` (reason) · `POST/:id/pause` · `POST/:id/activate` · `POST/:id/archive` (force) · `GET/:id/stats`

---

## 5. Har section faylining shabloni

Har fayl quyidagi bo'limlardan iborat (izchil):

1. **Maqsad** — bu admin bo'limi nima qiladi (o'zbekcha, 2–4 jumla).
2. **Ruxsat** — qaysi rol(lar) kira oladi (permission matrix'dan).
3. **Endpointlar** — jadval: `METHOD + path` · maqsad · rol · request DTO · response · **backend holati** (✅/🔶/🔴).
4. **DTO ta'riflari** — har request/response uchun field jadvali: `field` · `type` · `required` · `izoh`. Field nomlari inglizcha, real Prisma modeliga mos.
5. **Filtrlar** — list endpointlar uchun barcha query params (nom, type, misol).
6. **Status / lifecycle** — tegishli enum'lar + ruxsat etilgan o'tishlar (kerak bo'lsa diagramma).
7. **Xatolar** — bu section'ning error kodlari (kod · HTTP · o'zbekcha message).
8. **Backend holati / eslatmalar** — nima mavjud, nima qurilishi kerak, qaysi migration talab qilinadi.
9. **Namuna** — real request + response JSON, to'liq `BaseResponse` envelope'da.

---

## 6. Taxminlar va ochiq nuqtalar

Docs "source of truth" bo'lgani uchun quyidagilarni **men belgilayman** (backend keyin shu bo'yicha quradi):

- **Ban/suspend** uchun `Student` va `BusinessOwner` modellariga `status` (yoki `isActive` + `bannedAt` + `banReason`) qo'shiladi → migration kerak. Docs buni 🔴 deb belgilaydi.
- **Business/Listing moderatsiya** endpointlari `status` + `rejectionReason` maydonlarini o'rnatadi (hozir enum bor, endpoint yo'q).
- **Region bo'yicha filtr** studentlarda emas — studentlarda region maydoni yo'q (universitet/kurs/gender bor). Region/district filtri **branches (do'konlar)** va **listings** da qo'llanadi.
- **O'chirish (delete)** — foydalanuvchilar uchun soft/anonymize afzal (bog'liq ma'lumotlar cascade); docs har joyda aniq belgilaydi. Faqat SUPER_ADMIN.
- **Chat oversight / media takedown / audit log** — bu bosqichda emas; audit log 13-faylga qoldiriladi (lekin har yozuv admin harakatini log qilishi tavsiya sifatida 00/01 da eslatiladi).

---

## 7. Keyingi qadamlar

1. Ushbu spec'ni user ko'rib chiqadi/tasdiqlaydi.
2. Tasdiqdan keyin `docs/api/admin/` ichida 00–07 fayllar yoziladi (shablon + inventar bo'yicha, izchil). Fayllar mustaqil bo'lgani uchun bir qismi parallel yoziladi.
3. Har fayl yozilgach mini self-review (envelope to'g'ri, field nomlari real modelga mos, backend-holati belgilangan).
