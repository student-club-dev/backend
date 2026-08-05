# Ro'yxatdan o'tishda OTP — mobil tomonga o'zgarish

Bu hujjat sizning so'rovingizdan kelib chiqmagan — **bizda topilgan zaiflik**. Ilovada ish bor,
shuning uchun yozyapmiz.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.

---

## 1. Muammo

`POST /v1/auth/{student|business}/register` telefon raqamni **hech qanday tasdiqsiz** qabul qilardi:
hisob darhol yaratilar va **amal qiluvchi token** qaytarardi.

`phone_number` bazada `@unique`. Ya'ni kimdir begona raqamni yozib ro'yxatdan o'tsa, **o'sha
raqamning haqiqiy egasi endi hech qachon ro'yxatdan o'tolmaydi**. Bu shunchaki "tasdiqlanmagan
hisob" emas — bu boshqa odamning raqamini band qilib qo'yish.

---

## 2. Yangi oqim

```
1) POST /v1/auth/student/register/otp     ← YANGI, token kerak emas
   { "phoneNumber": "+998901234567" }
   → { "sent": true, "expiresInSeconds": 300, "resendCooldownSeconds": 60 }

2) POST /v1/auth/student/register
   { "phoneNumber": "+998901234567", "password": "…", "otpCode": "123456" }
   → hisob phoneVerified: true bilan yaratiladi
```

Biznes tomonida ham xuddi shunday: `/v1/auth/business/register/otp`.

### ⚠️ Bu `POST /otp/request` EMAS

Ikkalasi boshqa-boshqa:

| | `/otp/request` | `/register/otp` |
|---|---|---|
| Token | **kerak** | kerak emas |
| Qachon | hisob **bor**, telefonni tasdiqlash | hisob **yo'q**, ro'yxatdan o'tishdan oldin |
| Kod almashadimi | ❌ | ❌ |

Kodlar Redis'da alohida fazoda saqlanadi — birining kodi ikkinchisiga yaramaydi.

### Faqat email bilan ro'yxatdan o'tish — o'zgarmadi

`otpCode` **faqat `phoneNumber` yuborilganda** kerak. Email bilan ro'yxatdan o'tish bugungidek
ishlayveradi.

---

## 3. Qachon majburiy bo'ladi

`otpCode` hozircha **ixtiyoriy** — server tomonda `REGISTRATION_OTP_REQUIRED=false`.

Sabab: uni darhol majburiy qilsak, do'kondagi mavjud build'da telefon bilan ro'yxatdan o'tish
**butunlay ishlamay qolardi**.

Tartib:

1. ✅ Server deploy qilindi (bayroq o'chiq — hech narsa buzilmadi)
2. ⏳ **Siz yangi build chiqarasiz** — `register/otp` chaqiradi va `otpCode` yuboradi
3. ⏳ Biz `REGISTRATION_OTP_REQUIRED=true` qilamiz

**2-qadamdan keyin darhol ayting** — 3-qadamgacha zaiflik ochiq turadi.

⚠️ Muhim: bayroq o'chiq bo'lsa ham, **`otpCode` yuborsangiz u tekshiriladi** va raqam
`phoneVerified: true` bo'lib yoziladi. Ya'ni yangi oqimga bugunoq o'tsangiz bo'ladi — bayroqni
kutish shart emas, va biz uni yoqishdan oldin haqiqiy trafikda ishlayotganini ko'ramiz.

---

## 4. Xatolar

| Holat | Kod | Status |
|---|---|---|
| `otpCode` yo'q (bayroq yoqilgandan keyin) | `VALIDATION_ERROR`, `fields.otpCode` | 422 |
| Kod noto'g'ri | `OTP_INVALID` | 422 |
| Kod eskirgan / so'ralmagan | `OTP_EXPIRED` | 410 |
| Urinishlar oshib ketdi | `OTP_TOO_MANY_ATTEMPTS` | 429 |
| Qayta yuborish erta | `OTP_COOLDOWN` | 429 |
| Bitta raqamga soatlik limit | `OTP_RESEND_LIMIT` | 429 |
| **Platformadagi kunlik SMS budjeti tugadi** | `RATE_LIMITED` | 429 |

Oxirgisi yangi. `/register/otp` anonim endpoint — ya'ni har xil raqamlarni terib SMS pulini yoqib
yuborish mumkin edi. Kunlik global chegara qo'yildi (`OTP_REGISTRATION_DAILY_CAP`, sukut 2000).
Foydalanuvchi buni ko'rmasligi kerak; ko'rsa — bizga ayting, chegarani ko'taramiz.

---

## 5. Sizdan kutilayotgani

| # | Ish |
|---|---|
| 1 | `student-club.json` ni yangilash |
| 2 | Ro'yxatdan o'tish ekraniga kod bosqichini qo'shish (`register/otp` → kod kiritish → `register`) |
| 3 | Build chiqqach bizga aytish — bayroqni yoqamiz |

Email bilan ro'yxatdan o'tish oqimiga tegmaysiz.
