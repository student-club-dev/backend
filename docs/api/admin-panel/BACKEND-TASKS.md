# Backend task-list — admin panel to'liq ishlashi uchun

Bu ro'yxat — admin panel **to'liq** ishlashi uchun backend qurishi kerak bo'lgan ishlar. Sababi: mavjud endpointlar **owner/student-scoped** (faqat "o'zini" qaytaradi), shuning uchun admin ular orqali hamma ma'lumotni ko'ra/boshqara olmaydi (batafsil: har modul faylining "Admin panel eslatmasi" bo'limi).

**Prefiks:** yangi admin endpointlar `/v1/admin/*` da (mavjud `/v1/admin/business-types` bilan izchil). **Guard:** hammasi `AdminJwtGuard` (+ kerak joyda `@Roles`) bilan — Faza 0 dan keyin.

**Ustuvorlik:** fazalar tartibida. Faza 0 — hamma narsaning old sharti.

---

## 🗄️ Migratsiyalar (avval — ko'p task shularga bog'liq)

> **Admin auth uchun DB jadvali kerak EMAS** — admin login/parol **env**da (Faza 0). Faqat quyidagilar:

- [ ] **`AccountType`** enum'ga `ADMIN = "admin"` qo'shish (JWT `type`).
- [ ] **`students`** jadvaliga ban maydonlari: `status(StudentStatus: ACTIVE|BANNED, default ACTIVE)`, `bannedAt?`, `banReason?`.
- [ ] **`business_owners`** jadvaliga ban maydonlari: `status(BusinessOwnerStatus: ACTIVE|BANNED)`, `bannedAt?`, `banReason?`.

## 🔁 O'zgartirilishi kerak MVP xatti-harakatlari

- [ ] **Biznes create** hozir avto `status: APPROVED` beradi (`business.service.ts`) → owner `submit` qilganda `DRAFT → PENDING_REVIEW` bo'lsin (moderatsiya uchun).
- [ ] **E'lon submit** hozir to'g'ridan `ACTIVE`/`SCHEDULED`ga o'tadi (`listings.service.ts`) → `PENDING_REVIEW`ga o'tsin.
- [ ] **`AdminGuard` (X-Admin-Key)** placeholder'ni env-based `AdminJwtGuard`ga almashtirish; `admin/business-types` yangisiga o'tsin.

---

## Faza 0 — Admin auth (env-based) + RBAC (old shart) 🔴

> Admin login/parol **env**da — DB jadvali, register, forgot-password YO'Q. Bularsiz boshqa admin endpoint himoyalanmaydi.

- [ ] **Env config:** admin va moderator login/parol env'da — masalan `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` (rol `ADMIN`), `MODERATOR_EMAIL`/`MODERATOR_PASSWORD_HASH` (rol `MODERATOR`). Parollar **argon2 hash** (ochiq matn emas). Ko'p moderator kerak bo'lsa — env'da JSON ro'yxat yoki keyinroq kichik jadval.
- [ ] **`AdminRole`** — kod ichidagi TS enum (`ADMIN`, `MODERATOR`), DB emas.
- [ ] **Login:** `POST /v1/admin/auth/login` (email+parol → env bilan tekshiradi) → JWT (`type: "admin"`, `role`). `GET /v1/admin/auth/me`, `POST /v1/admin/auth/logout`. Refresh **ixtiyoriy** (qayta login ham yetadi).
- [ ] **Guard'lar:** `AdminJwtGuard` (token + `type === "admin"`) + `@Roles(...)` `AdminRoleGuard`.
- [ ] **YO'Q (ataylab):** admin uchun register / forgot-password / o'zini boshqarish endpointlari — creds env'da fiks.
- [ ] **Permission matrix:** `ADMIN` = hammasi (incl. delete, config, foydalanuvchi yaratish); `MODERATOR` = moderatsiya + o'qish + ban, lekin delete/config'ga ruxsatsiz.

## Faza 1 — Cross-user o'qish / ro'yxatlash ("hammasini ko'rish") 🔴

> Hozir hech bir endpoint bir nechta foydalanuvchi/biznesni qaytarmaydi. Havolalar: `02/03/04/06` fayllar.

- [ ] **Studentlar:** `GET /v1/admin/students` (filtr: q, universityId, courseYear, gender, phoneVerified, status, createdFrom/To; pagination), `GET /v1/admin/students/:id`. (Havola `02-profile`, `11-connections`)
- [ ] **Biznes egalari:** `GET /v1/admin/business-owners` (filtr + pagination), `GET /:id`, `GET /:id/businesses`.
- [ ] **Bizneslar:** `GET /v1/admin/businesses` (filtr: q, ownerId, status, type, regionId, isOnlineOnly; pagination), `GET /:id` (owner-bypass — hozir `GET /business/:id` owner-only 403). (Havola `03-business`)
- [ ] **Do'konlar/filiallar:** `GET /v1/admin/branches` (filtr: q, businessId, ownerId, regionId, districtId, tradeCenterId, isActive, geo bbox/radius; pagination), `GET /:id`. (Havola `04-branches`)
- [ ] **E'lonlar:** `GET /v1/admin/listings` (filtr: status[] incl DRAFT/PENDING/REJECTED, businessId, ownerId, categoryKey, type, regionId, price, discount, sana; pagination), `GET /:id` (har status), `GET /:id/stats`. (Havola `06-listings`)
- [ ] **Dashboard:** `GET /v1/admin/dashboard/stats` (jami sonlar + status breakdown + pending navbatlar). (Ixtiyoriy: `/timeseries`)

## Faza 2 — Moderatsiya (status oqimlari) 🔴

> Enum'larda `REJECTED/BLOCKED/PENDING_REVIEW` bor, lekin hech qaysi endpoint ularni o'rnatmaydi.

- [ ] **Biznes:** `POST /v1/admin/businesses/:id/approve · /reject(reason) · /block(reason) · /unblock`, `DELETE /:id` (archive). (Havola `03-business`)
- [ ] **E'lon:** `POST /v1/admin/listings/:id/approve · /reject(reason)`, force `/pause · /activate · /archive`. (Havola `06-listings`)
- [ ] **Shikoyatlar navbati (reports):** `GET /v1/admin/reports` (filtr: status OPEN/REVIEWED/ACTIONED/DISMISSED, reason), `GET /:id` (target/message/note ko'rinsin), `POST /:id/transition` (status o'zgartirish). Hozir `POST /reports` bor, lekin **list/transition yo'q** — hamma `OPEN`da qotib qoladi. (Havola `11-connections`)

## Faza 3 — Foydalanuvchi boshqaruvi (yaratish / tahrirlash / ban / delete) 🔴

> Migratsiyalar (ban maydonlari) shart.

- [ ] **Yaratish (admin):** `POST /v1/admin/students`, `POST /v1/admin/business-owners` — admin yangi student/biznes-owner akkaunt yaratadi (parol beriladi yoki invite/OTP). Owner/student o'zi ham register qiladi; bu — admin paneldan qo'lda qo'shish uchun.
- [ ] **Tahrirlash (admin override):** `PUT /v1/admin/students/:id`, `PUT /v1/admin/business-owners/:id`, `PUT /v1/admin/businesses/:id`, `PUT /v1/admin/branches/:id`, `PUT /v1/admin/listings/:id`.
- [ ] **Ban/suspend:** `POST /v1/admin/students/:id/ban(reason) · /unban`, xuddi shu owners uchun. Ban → sessiyalarni bekor qilish; owner ban → bizneslar ko'rinishini yashirish.
- [ ] **Delete (`ADMIN`):** foydalanuvchi → soft/anonymize; biznes → archive.
- [ ] **Sessiyalar:** `GET /v1/admin/students/:id/sessions`, `DELETE /.../sessions` (force logout); owners uchun ham. `GET /:id/devices` (student). (Havola `02-profile`, `14-devices`, `01-auth`)

## Faza 4 — Reference data admin CRUD 🔶

> Hozir seed-managed / read-only.

- [ ] **Katalog:** groups & categories & attribute specs uchun CRUD (business-**types** CRUD allaqachon bor). (Havola `05-catalog`)
- [ ] **Geo:** regions & districts CRUD (nom, centerLat/Lng). (Havola `08-geo`)
- [ ] **Savdo markazlari:** trade centers + dinamik fields CRUD, INACTIVE'larni ko'rish. (Havola `09-trade-centers`)

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
