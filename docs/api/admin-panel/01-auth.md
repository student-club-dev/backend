# 01 — Auth (student + biznes)

> Konvensiyalar (base URL, envelope, scope belgilar, pagination, umumiy error) — [`00-overview.md`](./00-overview.md). Bu fayl **mavjud** auth endpointlarini tasvirlaydi.

## 1. Maqsad

Backend o'zi autentifikatsiya qiladi (Firebase emas). **Ikki account turi, alohida jadval:** `students` va `business_owners` (D6). Har turning **o'z parallel endpointlari** bor — bir xil shape, ikki base:

```
/v1/auth/student/*     → students jadvali
/v1/auth/business/*    → business_owners jadvali
```

Kodda bitta `AuthService` / `OtpService` klassi ikkala turga xizmat qiladi — modul DI orqali mos repository + `ACCOUNT_TYPE` biriktiradi (copy-paste yo'q). Shu sabab quyida shape **bir marta** tavsiflanadi; `{type}` ni `student` yoki `business` bilan almashtiring.

Token modeli (D2): **access** — qisqa umrli JWT (`sub`=account id, `type`=`student|business`, ~15m); **refresh** — opaque random string, faqat SHA-256 hash saqlanadi (revoke qilinadi, har refresh'da rotatsiya bo'ladi). Refresh/logout access header'siz, token'ni **body**da yuboradi.

---

## 2. Endpointlar

Barchasi ikkala base uchun mavjud (`/v1/auth/student/...` **va** `/v1/auth/business/...`).

| METHOD + path | scope | Maqsad |
|---|---|---|
| `POST /v1/auth/{type}/register` | 🌐 | Email yoki telefon + parol bilan ro'yxatdan o'tish → token juftligi |
| `POST /v1/auth/{type}/login` | 🌐 | Email yoki telefon + parol bilan kirish |
| `POST /v1/auth/{type}/oauth/google` | 🌐 | Google ID token bilan kirish (server tekshiradi) |
| `POST /v1/auth/{type}/oauth/apple` | 🌐 | Apple ID token bilan kirish (server tekshiradi) |
| `POST /v1/auth/{type}/refresh` | 🌐 | Refresh token rotatsiyasi (yangi access+refresh) |
| `POST /v1/auth/{type}/logout` | 🌐 | Bitta refresh token(sessiya)ni bekor qilish (idempotent) |
| `POST /v1/auth/{type}/otp/request` | 🔒 🔓 | Telefonni tasdiqlash uchun SMS OTP so'rash |
| `POST /v1/auth/{type}/otp/verify` | 🔒 🔓 | OTP'ni tekshirib account telefonini `verified` qilish |
| `POST /v1/auth/{type}/password/set` | 🔒 🔓 | Parol o'rnatish yoki o'zgartirish |
| `POST /v1/auth/{type}/password/forgot` | 🌐 | Parolni tiklash uchun SMS OTP so'rash (doim muvaffaqiyat) |
| `POST /v1/auth/{type}/password/reset` | 🌐 | SMS OTP bilan parolni tiklash |
| `GET /v1/auth/{type}/sessions` | 🔒 🔓 | O'z faol qurilma-sessiyalari ro'yxati |
| `DELETE /v1/auth/{type}/sessions/:id` | 🔒 🔓 | O'z bitta sessiyasini bekor qilish |
| `POST /v1/auth/{type}/sessions/logout-all` | 🔒 🔓 | Barcha o'z sessiyalarini bekor qilish |

> 🔒 = har qanday login qilingan token (guard: `JwtAuthGuard`). 🔓 = **self-scoped**: doim **chaqiruvchining o'z** account'i (`user.id` token'dan). Guard turni ajratmaydi, lekin har base o'z jadvaliga bog'langan. OTP endpointlarida qo'shimcha `ThrottlerGuard` (IP rate-limit).

---

## 3. Endpointlar (batafsil)

### `POST /register` — 🌐 · 201

**Request — `RegisterDto`:**

| Field | Type | Required | Izoh |
|---|---|---|---|
| `email` | string (email) | ❌* | `email` yoki `phoneNumber` — **kamida bittasi** shart |
| `phoneNumber` | string | ❌* | E.164 (`^\+[1-9]\d{1,14}$`), masalan `+998901234567` |
| `password` | string | ✅ | `minLength: 8` |
| `deviceName` | string | ❌ | Sessiya metadatasi, masalan `"iPhone 15"` |
| `platform` | string | ❌ | Erkin matn, masalan `"iOS"` / `"Android"` (enum emas) |

**Response — `AuthTokensDto`:** `{ accessToken, refreshToken }`.

**LOGIKA:** `email`/`phoneNumber` bo'yicha bandlikni tekshiradi (ikkisidan biri egallangan bo'lsa → `ACCOUNT_EXISTS`); parolni **argon2** bilan hash qiladi; account yaratadi; sessiya ochadi (access JWT + opaque refresh; refresh hash + device metadata saqlanadi). Ro'yxatdan o'tish telefonni **avtomatik verified qilmaydi** — buni `otp/verify` bajaradi.

### `POST /login` — 🌐 · 200

**Request — `LoginDto`:** `email?`, `phoneNumber?` (kamida biri), `password` (bo'sh bo'lmasin), ixtiyoriy `deviceName`, `platform`.

**Response — `AuthTokensDto`.**

**LOGIKA:** avval `email`, so'ng `phoneNumber` bo'yicha qidiradi; sessiya ochadi. **Anti-enumeration:** account topilmasa, account **OAuth-only** (parol yo'q) bo'lsa, yoki parol xato bo'lsa — **hammasi bir xil** `INVALID_CREDENTIALS` 401 qaytaradi. Parol argon2 bilan solishtiriladi.

**BaseResponse — muvaffaqiyat (200):**
```jsonc
{
  "success": true,
  "status": 200,
  "code": null,
  "message": "OK",
  "result": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbHh...",
    "refreshToken": "9f2c1a7b4e...d3"
  },
  "error": null
}
```

**BaseResponse — xato (401, noto'g'ri login/parol):**
```jsonc
{
  "success": false,
  "status": 401,
  "code": null,
  "message": "Login yoki parol xato",
  "result": null,
  "error": { "code": "INVALID_CREDENTIALS", "message": "Login yoki parol xato", "fields": {} }
}
```

> Bir xil envelope `register` (201) va `refresh` (200) uchun ham amal qiladi (`result` = `{ accessToken, refreshToken }`). `logout` / `password/set` / `sessions` DELETE·logout-all uchun `result: null`.

### `POST /oauth/google` · `POST /oauth/apple` — 🌐 · 200

**Request — `OAuthLoginDto`:**

| Field | Type | Required | Izoh |
|---|---|---|---|
| `idToken` | string | ✅ | Provayder bergan ID token (server tekshiradi) |
| `deviceName` | string | ❌ | Sessiya metadatasi |
| `platform` | string | ❌ | Erkin matn |

**Response — `AuthTokensDto`.**

**LOGIKA (D4):** ID token server tomonda tekshiriladi (imzo/issuer/audience/expiry). So'ng account **shu account turi**ning jadvallarida hal qilinadi:
1. **(a)** provider id oldin bog'langan → o'sha account'ga kirish.
2. **(b)** aks holda, `email` mavjud **va verified** bo'lib, o'sha email'li account bor → bu provider identity'ni ulash (link) + kirish.
3. **(c)** aks holda → identity'dan yangi account yaratish + link + kirish.

Token tekshiruvi muvaffaqiyatsiz → `INVALID_OAUTH_TOKEN` 401. Provayder sozlanmagan bo'lsa → `INTERNAL_ERROR` 500.

### `POST /refresh` — 🌐 · 200

**Request — `RefreshDto`:** `refreshToken` (✅, body'da — header emas), ixtiyoriy `deviceName`, `platform`.

**Response — `AuthTokensDto`** (yangi juftlik).

**LOGIKA:** token SHA-256 hash qilinadi → faol (revoke qilinmagan, muddati o'tmagan) sessiya qidiriladi; topilmasa → `INVALID_REFRESH_TOKEN` 401. Topilsa: yangi access JWT imzolanadi, yangi opaque refresh generatsiya qilinadi, eski sessiya **rotatsiya** qilinadi (eski hash o'rniga yangisi, device metadata yangilanadi). Ya'ni har refresh eski refresh token'ni bekor qiladi.

### `POST /logout` — 🌐 · 200

**Request — `LogoutDto`:** `refreshToken` (✅, body'da).

**Response:** `result: null`.

**LOGIKA:** token hash qilinadi va bekor qilinadi. **Idempotent** — token topilmasa ham xato bermaydi.

### `POST /otp/request` — 🔒 🔓 · 200

Guard: `JwtAuthGuard` + `ThrottlerGuard` (IP: **5 / 60s**).

**Request — `OtpRequestDto`:** `phoneNumber` (✅, E.164).

**Response — `OtpRequestResultDto`:** `{ sent: boolean, expiresInSeconds: number, resendCooldownSeconds: number }`.

**LOGIKA (D1/D8):** telefon E.164'ga normallashtiriladi (UZ: `+998…`, `998…`, 9-xonali milliy qabul qilinadi); **cooldown** tekshiriladi (`OTP_COOLDOWN` 429); **soatlik resend cap** tekshiriladi (~5/soat oyna — oshsa `OTP_RESEND_LIMIT` 429); 6-xonali kod generatsiya qilinadi (non-prod: qat'iy dev kod `OTP_DEV_CODE` yoki `111111`; prod: xavfsiz random); kod **hashlab** Redis'ga TTL bilan saqlanadi (`attempts=0`); SMS kanali orqali yuboriladi; SMS qabul qilingandan **keyin** cooldown boshlanadi (yuborish muvaffaqiyatsiz bo'lsa qayta urinish bloklanmaydi). Redis kaliti account-turi **va** maqsad bo'yicha namespacelanadi (`phone_verify` ↔ `password_reset` mustaqil).

### `POST /otp/verify` — 🔒 🔓 · 200

Guard: `JwtAuthGuard` + `ThrottlerGuard` (IP: **10 / 60s**).

**Request — `OtpVerifyDto`:** `phoneNumber` (✅, E.164), `code` (✅, `^\d{6}$`).

**Response — `OtpVerifyResultDto`:** `{ verified: true }`.

**LOGIKA:** kodni tekshirib **iste'mol** qiladi (single-use): saqlangan kod yo'q → `OTP_EXPIRED` 410; `attempts >= OTP_MAX_ATTEMPTS` → `OTP_TOO_MANY_ATTEMPTS` 429; hash mos kelmasa → `attempts` +1 va `OTP_INVALID` 422; mos kelsa → kalit o'chiriladi va `user.id` (token'dan) account telefoni **verified** qilinadi.

### `POST /password/set` — 🔒 🔓 · 200

Guard: `JwtAuthGuard`.

**Request — `SetPasswordDto`:**

| Field | Type | Required | Izoh |
|---|---|---|---|
| `currentPassword` | string | ❌ | Faqat **mavjud parolni o'zgartirishda** shart |
| `newPassword` | string | ✅ | `minLength: 8` |

**Response:** `result: null`.

**LOGIKA (D9):** account'da parol **bor** bo'lsa (o'zgartirish) — `currentPassword` shart va to'g'ri bo'lishi kerak (yo'q/xato → `INVALID_CREDENTIALS` 401), muvaffaqiyatdan **keyin barcha refresh token'lar bekor** qilinadi (hamma joyda qayta login — D3). Account **parolsiz** bo'lsa (OAuth-only, birinchi marta o'rnatish) — `currentPassword` kerak emas va sessiyalar **bekor qilinmaydi**.

### `POST /password/forgot` — 🌐 · 200

**Request — `ForgotPasswordDto`:** `phoneNumber` (✅, E.164).

**Response:** `result: null` — **doim muvaffaqiyat** (anti-enumeration).

**LOGIKA (D5):** telefon bo'yicha account qidiriladi; **faqat account mavjud VA telefoni verified** bo'lsa `password_reset` maqsadli OTP yuboriladi. Account bor-yo'qligini yoki telefon verified ekanini **hech qachon oshkor qilmaydi** — javob har doim bir xil. (OTP yuborilsa ham cooldown/resend limitlari amal qiladi.)

### `POST /password/reset` — 🌐 · 200

**Request — `ResetPasswordDto`:** `phoneNumber` (✅, E.164), `code` (✅, 6-xonali), `newPassword` (✅, `minLength: 8`).

**Response — `ResetPasswordResultDto`:** `{ reset: true }`.

**LOGIKA (D5):** `password_reset` OTP'ni tekshirib **iste'mol** qiladi (xatolar: `OTP_EXPIRED` 410 / `OTP_TOO_MANY_ATTEMPTS` 429 / `OTP_INVALID` 422); telefon bo'yicha account topilmasa (defensiv) → `INVALID_CREDENTIALS` 401; yangi parol argon2 bilan saqlanadi va **barcha refresh token'lar bekor** qilinadi.

### `GET /sessions` — 🔒 🔓 · 200

**Response — `SessionDto[]`** (paginatsiyasiz massiv). Har element:

| Field | Type | Izoh |
|---|---|---|
| `id` | string | `DELETE /sessions/:id` ga beriladi |
| `deviceName` | string \| null | |
| `platform` | string \| null | |
| `ipAddress` | string \| null | |
| `lastUsedAt` | ISO-8601 \| null | Oxirgi refresh vaqti |
| `createdAt` | ISO-8601 | Sessiya boshlangan vaqt |

**LOGIKA:** faqat **o'z** account'ining faol sessiyalari. Token hash **hech qachon** qaytarilmaydi.

### `DELETE /sessions/:id` — 🔒 🔓 · 200

**Params:** `id` — sessiya id.

**Response:** `result: null`.

**LOGIKA:** ownership majburiy — `revokeById(sessionId, accountId)`. Sessiya chaqiruvchiga tegishli emas yoki mavjud emas → `SESSION_NOT_FOUND` 404 (hech narsa bekor qilinmaydi).

### `POST /sessions/logout-all` — 🔒 🔓 · 200

**Response:** `result: null`.

**LOGIKA:** chaqiruvchi account'ning **barcha** qurilma-sessiyalarini bekor qiladi ("hamma qurilmadan chiqish").

---

## 4. Enumlar

| Enum | Qiymatlar | Ishlatilishi |
|---|---|---|
| `AuthProvider` | `GOOGLE`, `APPLE` | OAuth endpoint (server tomonda; body'da yuborilmaydi — path belgilaydi) |
| `AccountType` (token `type`) | `student`, `business` | Access token payload; qaysi base/jadval ekanini ajratadi |

> **`DevicePlatform` enum yo'q.** `platform` maydoni — **erkin string** (`@IsString()`, masalan `"iOS"`, `"Android"`), cheklangan enum emas. `deviceName` ham erkin string.

---

## 5. Xatolar

| `error.code` | HTTP | Qachon |
|---|---|---|
| `VALIDATION_ERROR` | 422 | DTO validatsiyasi (email/phone yo'q, parol qisqa, telefon E.164 emas, kod 6-xonali emas). `error.fields` to'ldiriladi |
| `ACCOUNT_EXISTS` | 409 | register — email yoki telefon allaqachon band |
| `INVALID_CREDENTIALS` | 401 | login/reset — account yo'q · OAuth-only (parolsiz) · parol xato (anti-enumeration, bitta kod). `password/set` — `currentPassword` yo'q/xato |
| `INVALID_OAUTH_TOKEN` | 401 | OAuth — ID token tekshiruvi muvaffaqiyatsiz |
| `ACCOUNT_BANNED` | 403 | login / refresh / oauth — hisob **BANNED yoki DELETED** holatida (admin bloklagan). `message`: `Hisobingiz bloklangan` |
| `INVALID_REFRESH_TOKEN` | 401 | refresh — token noma'lum/muddati o'tgan/bekor qilingan |
| `SESSION_NOT_FOUND` | 404 | `DELETE /sessions/:id` — sessiya chaqiruvchiniki emas/yo'q |
| `OTP_EXPIRED` | 410 | verify/reset — kod eskirgan yoki umuman so'ralmagan |
| `OTP_INVALID` | 422 | verify/reset — kod noto'g'ri (har xatoda `attempts` +1) |
| `OTP_TOO_MANY_ATTEMPTS` | 429 | verify/reset — bir kod uchun urinishlar `OTP_MAX_ATTEMPTS`dan oshdi |
| `OTP_COOLDOWN` | 429 | request/forgot — resend cooldown hali faol |
| `OTP_RESEND_LIMIT` | 429 | request/forgot — soatlik SMS chegarasi (~5/soat) oshdi |
| `RATE_LIMITED` | 429 | OTP request/verify — IP `ThrottlerGuard` limiti oshdi |
| `UNAUTHORIZED` | 401 | Guard'li endpoint — token yo'q/yaroqsiz |
| `TOKEN_EXPIRED` | 401 | Guard'li endpoint — access token muddati o'tgan (client refresh qilib qayta uradi) |
| `INTERNAL_ERROR` | 500 | OAuth provayder sozlanmagan |

> **Anti-enumeration eslatmasi:** `login`, `password/forgot` va `password/reset` account bor-yo'qligini oshkor qilmaslik uchun ataylab bir xil natija beradi (login → doim `INVALID_CREDENTIALS`; forgot → doim muvaffaqiyat).

> **Ban gate eslatmasi:** admin bloklagan hisob (status **BANNED** yoki **DELETED**) `login`, `refresh` **va** `oauth/*` ning uchalasida ham rad etiladi → **403 `ACCOUNT_BANNED`** (`message`: `Hisobingiz bloklangan`). Ban qo'yilganda mavjud sessiyalar ham bekor qilinadi. Admin ban/unban → [`ADMIN-API.md`](./ADMIN-API.md) (Faza 3).

---

## 6. Admin panel eslatmasi

- **Admin login endi bor.** ✅ built — admin panel o'z **alohida** auth'iga ega: `POST /v1/admin/auth/login` (env-based creds, argon2) → JWT; `GET /admin/auth/me`, `POST /admin/auth/logout`. Rollar `ADMIN`/`MODERATOR`, guard `AdminJwtGuard`. Bu yerdagi student/business auth'dan **butunlay ajralgan** — qarang [`ADMIN-API.md`](./ADMIN-API.md) (Faza 0). Eski placeholder `X-Admin-Key` (`AdminGuard`) **o'chirildi**.
- **Ban gate:** admin BANNED/DELETED qilgan hisob login/refresh/oauth qila olmaydi → **403 `ACCOUNT_BANNED`** (yuqoridagi "Ban gate eslatmasi").
- **Sessions endpointlari self-scoped:** `GET/DELETE /sessions*` faqat **chaqiruvchining o'z** sessiyalarini boshqaradi. Admin panel boshqa foydalanuvchi sessiyalarini **ko'rish** yoki majburiy chiqarish (force-logout) uchun alohida endpoint hali **yo'q** (kutilmoqda) — biroq ban qo'yilganda o'sha hisobning sessiyalari avtomatik bekor qilinadi.
- **Foydalanuvchilar ro'yxati/boshqaruvi endi bor.** ✅ built — admin uchun student/biznes-egasi list + detail + create + edit + ban/unban `/v1/admin/*` da: [`ADMIN-API.md`](./ADMIN-API.md) (Faza 1 read, Faza 3 write/ban). Tafsilotlar [`02-profile.md`](./02-profile.md) "Admin panel eslatmasi"da.
- **OTP dev rejimi:** non-production'da kod qat'iy (`OTP_DEV_CODE` yoki `111111`) — test/demo uchun; prod'da random. Buni admin panel demo muhitida hisobga oling.
