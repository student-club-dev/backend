# 02 — Profile (`/v1/profile`)

> Konvensiyalar (envelope, pagination, guard'lar, scope belgilar) — [`00-overview.md`](./00-overview.md). Bu fayl faqat shu modul mantiqini yozadi.

## 1. Maqsad

Chaqiruvchining **o'z profili**. Bitta controller **ikkala account turiga** xizmat qiladi (`students` va `business_owners`): tur access token'dan (`req.user.type`) olinadi va service so'rov paytida mos jadval (repository) ni tanlaydi — shuning uchun `/profile/me` yagona endpoint bo'lib qoladi (D6).

Profil **hech qachon ro'yxat qaytarmaydi** va ID bo'yicha olib bo'lmaydi — faqat o'zini. Ba'zi maydonlar **faqat studentga tegishli** (`username`, universitet/kurs, `lastSeenVisibility`) va biznes egasi uchun `null` bo'ladi hamda yozishda **jimgina e'tiborsiz** qoldiriladi.

---

## 2. Endpointlar

| METHOD + path | Scope | Maqsad |
|---|---|---|
| `GET /v1/profile/me` | 🔒 Auth · 🔓 Self-scoped | Chaqiruvchining profilini olish |
| `PUT /v1/profile/me` | 🔒 Auth · 🔓 Self-scoped | Profilni qisman (partial) yangilash |

Ikkalasi ham faqat `JwtAuthGuard` bilan himoyalangan — student ham, biznes egasi ham chaqira oladi (turlar service ichida ajratiladi). Avatar yuklash endpointi **hozircha yo'q** (kodda `TODO(media): POST /profile/me/avatar` — media/storage moduli kutilmoqda); avatar faqat `avatarUrl` matn maydoni sifatida `PUT`da uzatiladi.

---

## 3. `GET /v1/profile/me`

Chaqiruvchining profilini qaytaradi.

**Request:** body yo'q. Faqat `Authorization: Bearer <accessToken>`.

**Response `result` (`UserProfileDto`):**

| Maydon | Tur | Izoh |
|---|---|---|
| `firstName` | `string \| null` | |
| `lastName` | `string \| null` | |
| `username` | `string \| null` | **Faqat student**; biznes egasida `null` |
| `phoneNumber` | `string \| null` | E.164 (`+998901234567`) |
| `gender` | `Gender \| null` | Ikkala turda ham bor |
| `role` | `ProfileRole \| null` | Read-only; account turidan kelib chiqadi (student→`STUDENT`, biznes→`BUSINESS`) |
| `universityId` | `string \| null` | **Faqat student**; biznesda `null` |
| `universityEmail` | `string \| null` | **Faqat student**; biznesda `null` |
| `birthYear` | `number \| null` | **Faqat student**; biznesda `null` |
| `courseYear` | `CourseYear \| null` | **Faqat student**; biznesda `null` |
| `lastSeenVisibility` | `LastSeenVisibility \| null` | **Faqat student**; default `CONNECTIONS`; biznesda `null` |
| `avatarUrl` | `string \| null` | Profil rasmining public URL'i |

> `phoneVerified` bu response'da **ko'rsatilmaydi** — u faqat ichki holat (telefonni tasdiqlash bosqichi).

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": {
    "firstName": "Quvonchbek", "lastName": "G'afurov",
    "username": "quvonchbek", "phoneNumber": "+998901234567",
    "gender": "MALE", "role": "STUDENT",
    "universityId": "tuit", "universityEmail": "q.gafurov@tuit.uz",
    "birthYear": 2004, "courseYear": "2",
    "lastSeenVisibility": "CONNECTIONS",
    "avatarUrl": "https://cdn.elon.uz/avatars/abc123.jpg"
  },
  "error": null
}
```

**LOGIKA:** `req.user.type` bo'yicha mos repository tanlanadi va `findById(user.id)` chaqiriladi. Profil odatda doim mavjud; agar topilmasa (defensiv) → **404** `PROFILE_NOT_FOUND`.

**FILTRLAR:** yo'q (ro'yxat emas, yagona resurs).

---

## 4. `PUT /v1/profile/me`

Profilni **qisman** yangilaydi. Barcha maydonlar ixtiyoriy; berilmagan (yoki `null`) maydon **o'zgarmay qoladi**.

**Request body (`UpdateProfileDto`) — barcha maydonlar ixtiyoriy:**

| Maydon | Tur / validatsiya | Izoh |
|---|---|---|
| `firstName` | `string` | |
| `lastName` | `string` | |
| `username` | `string`, regex `^[a-zA-Z0-9_]{3,20}$` | **Faqat student**; server `toLowerCase()` qiladi; biznesda e'tiborsiz |
| `phoneNumber` | `string`, E.164 `^\+[1-9]\d{1,14}$` | O'zgarsa — telefon tasdig'i reset bo'ladi (pastga qarang) |
| `gender` | `Gender` | Ikkala turga tegishli |
| `role` | `ProfileRole` | **Qabul qilinadi, lekin e'tiborsiz** (read-only, tashlanadi) |
| `universityId` | `string` | **Faqat student**; biznesda e'tiborsiz |
| `universityEmail` | `string` (email) | **Faqat student**; biznesda e'tiborsiz |
| `birthYear` | `number` (int) | **Faqat student**; biznesda e'tiborsiz |
| `courseYear` | `CourseYear` | **Faqat student**; biznesda e'tiborsiz |
| `lastSeenVisibility` | `LastSeenVisibility` | **Faqat student**; biznesda e'tiborsiz |
| `avatarUrl` | `string` | Ikkala turda ham qo'llaniladi |

> Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) — noma'lum maydon yuborilsa **422** `VALIDATION_ERROR`.

**Response:** `GET /v1/profile/me` bilan bir xil `UserProfileDto` (yangilangan holat).

**LOGIKA:**
- Tur `req.user.type` bo'yicha mos repository tanlanadi; profil topilmasa → **404** `PROFILE_NOT_FOUND`.
- **Patch faqat berilgan maydonlardan quriladi.** `firstName`, `lastName`, `avatarUrl`, `gender` — ikkala turga ham qo'llaniladi.
- **Student-only maydonlar** (`username`, `universityId`, `universityEmail`, `birthYear`, `courseYear`, `lastSeenVisibility`) faqat `type === STUDENT` bo'lganda qo'llaniladi; biznes egasida **jimgina tashlab yuboriladi** (xato emas).
- **`role` doim tashlanadi** (DTO `toInput()` da) — read-only, account turidan hosil bo'ladi.
- **Telefon o'zgarishi:** `phoneNumber` berilgan **va** joriy raqamdan farq qilsa — yangi raqam yoziladi **va `phoneVerified` → `false`** (re-verifikatsiya keyingi OTP bosqichi). Bir xil raqam yuborilsa hech narsa o'zgarmaydi.
- **Telefon bandligi:** yangi `phoneNumber` **shu jadvaldagi** boshqa account'ga tegishli bo'lsa → **409** `ACCOUNT_EXISTS`. (Tekshiruv account turi jadvali ichida — student va biznes turli jadvallarda telefon ulashishi mumkin.)
- **Username bandligi:** yangi `username` (student) shu jadvalda band bo'lsa → **409** `USERNAME_TAKEN`.

**FILTRLAR:** yo'q.

---

## 5. Enumlar

| Enum | Qiymatlar | Izoh |
|---|---|---|
| `Gender` | `MALE` · `FEMALE` | |
| `ProfileRole` | `STUDENT` · `BUSINESS` · `EMPLOYER` · `UNIVERSITY` | Input'da qabul qilinadi, lekin **hech qachon saqlanmaydi**; response'da faqat `STUDENT`/`BUSINESS` chiqadi (account turidan) |
| `CourseYear` | `"1"` · `"2"` · `"3"` · `"4"` · `"MASTER"` | Wire qiymatlari string (Prisma `YEAR_1..YEAR_4` ↔ `"1".."4"`) |
| `LastSeenVisibility` | `EVERYONE` · `CONNECTIONS` · `NOBODY` | Kim `online`/`lastSeenAt` ni ko'radi; `NOBODY` — `online` ni ham yashiradi va `presence:update` event'larini to'xtatadi; default `CONNECTIONS` |

---

## 6. Xatolar

| HTTP | `error.code` | Qachon | `message` (o'zbekcha) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token yo'q/yaroqsiz / muddati o'tgan | — (umumiy) |
| 404 | `PROFILE_NOT_FOUND` | Account ortidagi profil topilmadi (defensiv) | `Profil topilmadi` |
| 409 | `ACCOUNT_EXISTS` | Yangi `phoneNumber` boshqa account'da band | `Bu telefon bilan hisob allaqachon mavjud` |
| 409 | `USERNAME_TAKEN` | Yangi `username` (student) band | `Bu username band` |
| 422 | `VALIDATION_ERROR` | DTO validatsiyasi (regex, email, noma'lum maydon) | `error.fields` bilan |

---

## 7. Admin panel eslatmasi

🔓 **Self-scoped (mobil).** Bu ikki endpoint o'zgarmaydi: `GET /profile/me` **faqat chaqiruvchining o'zini** qaytaradi (`GET /profile/:id` yo'q), `PUT /profile/me` faqat o'zini o'zgartiradi.

Admin panel uchun istalgan student yoki biznes egasini **ko'rish, tahrirlash, yaratish va ban qilish** — endi **qurilgan** (owner-bypass, `AdminJwtGuard` ostida). ✅ built — qarang [`ADMIN-API.md`](./ADMIN-API.md):
- `GET /v1/admin/students · /business-owners` (filtr + paginatsiya) va `GET .../:id` (Faza 1);
- `PUT .../:id` (tahrir, ADMIN+MODERATOR) va `POST /v1/admin/students · /business-owners` (yaratish, faqat ADMIN) (Faza 3);
- `POST .../:id/ban` · `/unban` (status BANNED/ACTIVE; ban → sessiyalar bekor, login/refresh/oauth 403 `ACCOUNT_BANNED`) (Faza 3).

**Hali yo'q (kutilmoqda):** admin uchun boshqa foydalanuvchi **sessiya/qurilma** ko'rinishi va account **DELETE** (soft/anonymize). To'liq reja: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
