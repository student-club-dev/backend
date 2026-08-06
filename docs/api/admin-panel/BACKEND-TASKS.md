# Backend task-list — admin panel to'liq ishlashi uchun

Bu ro'yxat — admin panel **to'liq** ishlashi uchun backend qurishi kerak bo'lgan ishlar. Sababi: mavjud endpointlar **owner/student-scoped** (faqat "o'zini" qaytaradi), shuning uchun admin ular orqali hamma ma'lumotni ko'ra/boshqara olmaydi (batafsil: har modul faylining "Admin panel eslatmasi" bo'limi).

**Prefiks:** yangi admin endpointlar `/v1/admin/*` da (mavjud `/v1/admin/business-types` bilan izchil). **Guard:** hammasi `AdminJwtGuard` (+ kerak joyda `@Roles`) bilan — Faza 0 dan keyin.

**Ustuvorlik:** fazalar tartibida. Faza 0 — hamma narsaning old sharti.

---

## 🗄️ Migratsiyalar (avval — ko'p task shularga bog'liq)

> **Admin auth uchun DB jadvali kerak EMAS** — admin login/parol **env**da (Faza 0). Faqat quyidagilar:

- [x] **`AccountType`** enum'ga `ADMIN = "admin"` qo'shish (JWT `type`). ✅
- [x] **`students`** jadvaliga ban maydonlari: `status(StudentStatus: ACTIVE|BANNED|DELETED)`, `bannedAt?`, `banReason?` + index. ✅ *(migration fayli yozildi — deploy'da `prisma migrate deploy` bilan qo'llang)*
- [x] **`business_owners`** jadvaliga ban maydonlari: `status(BusinessOwnerStatus: ACTIVE|BANNED|DELETED)`, `bannedAt?`, `banReason?` + index. ✅

## 🔁 O'zgartirilishi kerak MVP xatti-harakatlari

- [ ] **Biznes create** hozir avto `status: APPROVED` beradi (`business.service.ts`) → owner `submit` qilganda `DRAFT → PENDING_REVIEW` bo'lsin (moderatsiya uchun).
- [ ] **E'lon submit** hozir to'g'ridan `ACTIVE`/`SCHEDULED`ga o'tadi (`listings.service.ts`) → `PENDING_REVIEW`ga o'tsin.
- [x] **`AdminGuard` (X-Admin-Key)** placeholder'ni env-based `AdminJwtGuard`ga almashtirish; `admin/business-types` yangisiga o'tdi. Eski guard + `ADMIN_API_KEY` **o'chirildi**. ✅

---

## Faza 0 — Admin auth (env-based) + RBAC — ✅ BAJARILDI

> Admin login/parol **env**da — DB jadvali, register, forgot-password YO'Q. Bularsiz boshqa admin endpoint himoyalanmaydi. **Qurilgan endpointlar: [`ADMIN-API.md`](./ADMIN-API.md).**

- [x] **Env config:** admin va moderator login/parol env'da — `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` (rol `ADMIN`), `MODERATOR_EMAIL`/`MODERATOR_PASSWORD_HASH` (rol `MODERATOR`). Parollar **argon2 hash**. ✅
- [x] **`AdminRole`** — kod ichidagi TS enum (`ADMIN`, `MODERATOR`), DB emas. ✅
- [x] **Login:** `POST /v1/admin/auth/login` → JWT (`type:"admin"`, `role`). `GET /v1/admin/auth/me`, `POST /v1/admin/auth/logout`. ✅
- [x] **Guard'lar:** `AdminJwtGuard` (token + `type === "admin"`) + `@Roles(...)` `AdminRoleGuard`. ✅
- [x] **YO'Q (ataylab):** admin uchun register / forgot-password endpointlari — creds env'da fiks. ✅
- [x] **Permission matrix:** `ADMIN` = hammasi; `MODERATOR` = moderatsiya + o'qish + ban, config/delete'siz. (RBAC guard tayyor; rol-cheklovlar keyingi fazalarda qo'llanadi.) ✅

## Faza 1 — Cross-user o'qish / ro'yxatlash ("hammasini ko'rish") — ✅ BAJARILDI

> Barcha read endpointlar qurildi. Qurilgan endpointlar: [`ADMIN-API.md`](./ADMIN-API.md).

- [x] **Studentlar:** `GET /v1/admin/students` (filtr: q, universityId, courseYear, gender, phoneVerified, createdFrom/To; pagination), `GET /v1/admin/students/:id`. ✅ *(status filtri Faza 3'da — ban maydoni qo'shilgach)*
- [x] **Biznes egalari:** `GET /v1/admin/business-owners` (filtr + pagination), `GET /:id`, `GET /:id/businesses`. ✅
- [x] **Bizneslar:** `GET /v1/admin/businesses` (filtr: q, ownerId, status[], type, regionId, isOnlineOnly; pagination), `GET /:id` (owner-bypass). ✅
- [x] **Do'konlar/filiallar:** `GET /v1/admin/branches` (filtr: q, businessId, ownerId, regionId, districtId, tradeCenterId, isActive, hasDelivery, geo bbox/radius; pagination), `GET /:id`. ✅ *(geo — PostGIS ST_DWithin)*
- [x] **E'lonlar:** `GET /v1/admin/listings` (filtr: status[] incl DRAFT/PENDING/REJECTED, businessId, ownerId, categoryKey, type, groupKey, regionId, districtId, price+basis, discountType, listingKind, redemptionMethod, sana; pagination), `GET /:id` (har status), `GET /:id/stats`. ✅
- [x] **Dashboard:** `GET /v1/admin/dashboard/stats` (jami sonlar + status breakdown + pending navbatlar). ✅ *(`/timeseries` — ixtiyoriy, hali yo'q)*

## Faza 2 — Moderatsiya (status oqimlari) 🔴

> Enum'larda `REJECTED/BLOCKED/PENDING_REVIEW` bor, lekin hech qaysi endpoint ularni o'rnatmaydi.

- [ ] **Biznes:** `POST /v1/admin/businesses/:id/approve · /reject(reason) · /block(reason) · /unblock`, `DELETE /:id` (archive). (Havola `03-business`)
- [ ] **E'lon:** `POST /v1/admin/listings/:id/approve · /reject(reason)`, force `/pause · /activate · /archive`. (Havola `06-listings`)
- [ ] **Shikoyatlar navbati (reports):** `GET /v1/admin/reports` (filtr: status OPEN/REVIEWED/ACTIONED/DISMISSED, reason), `GET /:id` (target/message/note ko'rinsin), `POST /:id/transition` (status o'zgartirish). Hozir `POST /reports` bor, lekin **list/transition yo'q** — hamma `OPEN`da qotib qoladi. (Havola `11-connections`)

## Faza 3 — Foydalanuvchi boshqaruvi (yaratish / tahrirlash / ban / delete) — ✅ BAJARILDI (sessiyalar bundan mustasno)

> Migratsiyalar (ban maydonlari) shart.

- [x] **Yaratish (ADMIN only):** `POST /v1/admin/students`, `POST /v1/admin/business-owners` — argon2 parol bilan yangi akkaunt. ✅
- [x] **Tahrirlash (admin override):** `PUT /v1/admin/students/:id`, `/business-owners/:id`, `/businesses/:id`, `/branches/:id`, `/listings/:id` — mavjud validatsiyani qayta ishlatib, ownership bypass. ✅
- [x] **Ban/suspend:** `POST /v1/admin/students/:id/ban(reason) · /unban` (+ owners). Ban → status=BANNED + sessiyalar bekor + **auth login/refresh/oauth bloklanadi** (403 `ACCOUNT_BANNED`). ✅ *(owner ban → e'lonlari feed/qidiruv/xaritadan yo'qoladi — ✅ **bajarildi**, `VISIBLE_LISTING` predikatida; qatorlar o'zgarmaydi, shuning uchun `unban` to'liq qaytaradi)*
- [x] **Delete** ✅ **BAJARILDI — hard delete** (mahsulot qarori bilan qayta yozildi): [`15-deletion.md`](./15-deletion.md). ⚠️ Qator bazadan o'chadi va **tiklab bo'lmaydi**: `students` ga 25 ta bog'lanish `onDelete: Cascade` — jumladan `Message` (boshqa odamning suhbat tarixi) va `Report` (o'sha odam yozgan shikoyatlar). Qaytariladigan variant — `ban`.
  - [x] `DELETE /v1/admin/students/:id` (`ADMIN`) — `prisma.student.delete()`; javob `result: null`. 409 endi yo'q, ikkinchi urinish 404.
  - [x] `DELETE /v1/admin/business-owners/:id` (`ADMIN`) — `prisma.businessOwner.delete()`; kaskad `businesses → listings → redemptions` va `branches` ni ham oladi.
  - [x] `DELETE /v1/admin/listings/:id` (`ADMIN`+`MODERATOR`) — owner tomondagi `ARCHIVED` mantiqini ownership'siz qayta ishlatish.
  - [x] **`/v1/admin/student-listings/*`** — `GET` ro'yxat (q/kind/status/ownerId/includeDeleted/page/size) + `GET :id` + `DELETE :id`. Talaba e'lonlari moderatsiyadan o'tmaydi (`student-listings.service.ts:23`), shuning uchun `approve`/`reject` yo'q — o'chirish yagona chora.
- [ ] **Sessiyalar:** `GET /v1/admin/students/:id/sessions`, `DELETE /.../sessions` (force logout); owners uchun ham. `GET /:id/devices` (student). (Havola `02-profile`, `14-devices`, `01-auth`)

## Faza 4 — Reference data admin CRUD — ✅ BAJARILDI

> Hammasi qurildi (ADMIN only). Qurilgan endpointlar: [`ADMIN-API.md`](./ADMIN-API.md).

- [x] **Katalog:** groups & categories & attribute specs uchun CRUD + business-types (guard yangilandi). ✅
- [x] **Geo:** regions & districts CRUD (nom, centerLat/Lng) + referential-integrity. ✅
- [x] **Savdo markazlari:** trade centers + dinamik fields CRUD, INACTIVE'larni ko'rish + referential-integrity. ✅

## Faza 5 — Audit / nazorat (ixtiyoriy) 🔴

- [ ] **Redemptions:** cross-business global ko'rinish + per-student qidiruv (firibgarlik/audit). (Havola `10-redemptions`)
- [ ] **Chat:** shikoyat qilingan xabarни ko'rish uchun admin message-view. (Havola `12-chat`)
- [ ] **Media:** takedown/o'chirish endpoint (hozir yo'q). (Havola `13-media`)
- [ ] **Audit log:** har admin harakatini yozish (kim/nima/qachon).

---

## Tavsiya etilgan tartib

```
Migratsiyalar + Faza 0 (admin auth)
        ↓
Faza 1 (hammasini ko'rish — ro'yxatlar)   ← panel "ko'rinadigan" bo'ladi
        ↓
Faza 2 (moderatsiya)                       ← panel "ish qiladigan" bo'ladi
        ↓
Faza 3 (user boshqaruvi)
        ↓
Faza 4 (reference CRUD) → Faza 5 (audit)
```

Faza 0 + 1 + 2 — admin panelning **yadrosi**. Faza 3–5 — kengaytmalar.

> Har endpointning aniq DTO/filtr/xato shakli tegishli modul faylida (`03`–`14`) "Admin panel eslatmasi" + asosiy endpoint tavsifidan olinadi.
