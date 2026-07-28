# 14 — Devices (push tokenlar, `/v1/devices`)

> Konvensiyalar (envelope, guard'lar, scope belgilar) — [`00-overview.md`](./00-overview.md). Bu fayl faqat shu modul mantiqini yozadi.

## 1. Maqsad

Studentning **push-notification qurilma tokenlarini** (FCM / APNs) ro'yxatdan o'tkazish va o'chirish. Token'lar chaqiruvchi studentga bog'lanadi; boshqa modullar (chat) offline student'ga push yuborishda shu token'lardan foydalanadi (`pushToStudent`).

**Faqat student** account'lari uchun (`StudentGuard`). Biznes token bilan chaqirilsa → **403**. Har token **chaqiruvchining o'zi**ga tegishli (self-scoped).

---

## 2. Endpointlar

| METHOD + path | Scope | Maqsad |
|---|---|---|
| `POST /v1/devices` | 👤 Student · 🔓 Self-scoped | Bu qurilmaning push token'ini ro'yxatdan o'tkazish (upsert) |
| `DELETE /v1/devices/:token` | 👤 Student · 🔓 Self-scoped | Push token'ni o'chirish (logout paytida) |

Ikkalasi ham `JwtAuthGuard` + `StudentGuard` bilan himoyalangan.

---

## 3. `POST /v1/devices`

Qurilma push token'ini ro'yxatdan o'tkazadi (mavjud bo'lsa yangilaydi — **upsert**).

**Request body (`RegisterDeviceDto`):**

| Maydon | Tur / validatsiya | Izoh |
|---|---|---|
| `token` | `string`, bo'sh emas | Qurilma push token'i (FCM/APNs) |
| `platform` | `DevicePlatform` | `IOS` · `ANDROID` · `WEB` |

```jsonc
// so'rov body
{ "token": "fcm:APA91b...", "platform": "ANDROID" }
```

**Response:** HTTP **200**, `result` — **null**.

```jsonc
{ "success": true, "status": 200, "code": null, "message": "OK", "result": null, "error": null }
```

**LOGIKA:** Token chaqiruvchi student ID'siga `upsert` qilinadi (`devices.upsert(user.id, token, platform)`) — takroriy ro'yxatdan o'tkazish xatoga olib kelmaydi, platforma yangilanadi.

**FILTRLAR:** yo'q.

---

## 4. `DELETE /v1/devices/:token`

Push token'ni o'chiradi (odatda logout paytida).

**Request:** path param `token` — o'chiriladigan push token. Body yo'q.

**Response:** HTTP **200**, `result` — **null**.

```jsonc
{ "success": true, "status": 200, "code": null, "message": "OK", "result": null, "error": null }
```

**LOGIKA:** `devices.remove(user.id, token)` — faqat **chaqiruvchi student**ning shu token'i o'chiriladi (self-scoped). Token topilmasa ham 200 (idempotent o'chirish).

**FILTRLAR:** yo'q.

---

## 5. Enumlar

| Enum | Qiymatlar |
|---|---|
| `DevicePlatform` | `IOS` · `ANDROID` · `WEB` |

---

## 6. Xatolar

| HTTP | `error.code` | Qachon |
|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token yo'q/yaroqsiz / muddati o'tgan |
| 403 | `FORBIDDEN` | Chaqiruvchi **student emas** (biznes token) |
| 422 | `VALIDATION_ERROR` | `POST`da `token` bo'sh yoki `platform` yaroqsiz (`error.fields` bilan) |

---

## 7. Admin panel eslatmasi

🔓 **Self-scoped, faqat student.** Token'lar **chaqiruvchi studentning o'ziniki** — endpointlar boshqa foydalanuvchining qurilmalarini ko'rish yoki boshqarishni bermaydi, hech qanday ro'yxat (list) yo'q, biznes account'lar umuman kira olmaydi.

Admin panel istalgan foydalanuvchining qurilmalarini ko'rish yoki push yuborish (masalan, targetli bildirishnoma, debug) uchun mavjud endpointlar **yetarli emas**. Backend permission bilan cross-user variant ochishi kerak, masalan:
- `GET /admin/users/:id/devices` (foydalanuvchi token'lari ro'yxati),
- `POST /admin/notifications` (targetli/broadcast push jo'natish).

To'liq ro'yxat: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
