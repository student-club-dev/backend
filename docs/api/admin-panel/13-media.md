# 13 — Media (rasm yuklash, `/v1/media`)

> Konvensiyalar (envelope, guard'lar, scope belgilar) — [`00-overview.md`](./00-overview.md). Bu fayl faqat shu modul mantiqini yozadi.

## 1. Maqsad

**Stateless rasm yuklash.** Fayl qabul qilinadi, **magic bytes** (haqiqiy tur) bo'yicha tekshiriladi va swappable STORAGE port orqali saqlanadi — qaytadigan `url` keyin biznes/e'lon/profil tomonidan **alohida** yoziladi. Modul **DB'ga yozmaydi**, hech qanday egalik (ownership) yoki bog'liqlik saqlamaydi.

**Har qanday login qilingan account** (student yoki biznes) yuklashi mumkin (`JwtAuthGuard`). `ThrottlerGuard` bilan **soatiga 100 ta** yuklash bilan cheklangan. `/v1` prefiksida.

---

## 2. Endpointlar

| METHOD + path | Scope | HTTP | Maqsad |
|---|---|---|---|
| `POST /v1/media/upload` | 🔒 Auth · ⏱ 100/soat | 200 | Rasm yuklash (logo, cover, e'lon rasmi) → public URL |

`JwtAuthGuard` + `ThrottlerGuard` bilan himoyalangan. HTTP **200** (`@HttpCode(200)` — POST bo'lsa ham 201 emas).

---

## 3. `POST /v1/media/upload`

Bitta rasmni yuklaydi va uning public URL'ini qaytaradi.

**Request:** `Content-Type: multipart/form-data`.

| Maydon (form-data) | Tur / validatsiya | Izoh |
|---|---|---|
| `file` | binary, **≤ 5 MB**, JPEG/PNG/WebP | Rasm fayli. Tur **magic bytes** bo'yicha aniqlanadi — client yuborgan `mimetype`ga **ishonilmaydi** |
| `purpose` | `string` — `LOGO` \| `COVER` \| `LISTING` | Rasm maqsadi (storage yo'lini belgilaydi) |

**Response `result` (`MediaUploadResponseDto`):** — `elon-uz.json`ga mos.

| Maydon | Tur | Izoh |
|---|---|---|
| `url` | `string` | To'liq o'lchamdagi rasm public URL'i |
| `thumbUrl` | `string \| null` | 200px variant — **v1'da doim `null`** (deferred) |
| `cardUrl` | `string \| null` | 800px variant — **v1'da doim `null`** (deferred) |

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": {
    "url": "https://cdn.elon.uz/uploads/LISTING/8f14e45f-ceea-467d-9a3e-1a2b3c4d5e6f.jpg",
    "thumbUrl": null,
    "cardUrl": null
  },
  "error": null
}
```

**LOGIKA (aynan shu tartibda):**
1. `purpose` `LOGO`/`COVER`/`LISTING` emas → **422** `VALIDATION_ERROR`, `error.fields.purpose` = `"Noto'g'ri maqsad: LOGO, COVER yoki LISTING"`.
2. `file` yo'q → **422** `VALIDATION_ERROR`, `error.fields.file` = `"Rasm faylini yuklang"`.
3. **Magic bytes** tekshiruvi (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF....WEBP`) — mos kelmasa → **422** `VALIDATION_ERROR`, `error.fields.file` = `"Faqat JPEG, PNG yoki WebP rasm yuklash mumkin"`. Client'ning `mimetype`i **e'tiborsiz**.
4. Hajm > 5 MB → **413** `FILE_TOO_LARGE` (`"Fayl hajmi 5 MB dan oshmasligi kerak"`). (Bir xil chegara `FileInterceptor`da ham qo'llanadi.)
5. Fayl STORAGE port orqali saqlanadi; `url` qaytariladi. `thumbUrl`/`cardUrl` v1'da `null` (v2'da `sharp` bilan variant generatsiya + min 600x600 tekshiruvi rejalashtirilgan).

**FILTRLAR:** yo'q (yozuv endpointi).

---

## 4. Enumlar

| "Enum" (qabul qilinadigan qiymatlar) | Qiymatlar | Izoh |
|---|---|---|
| `purpose` | `LOGO` · `COVER` · `LISTING` | Rasmiy TS enum emas — kodda `ALLOWED_PURPOSES` (string ro'yxat); storage yo'lini belgilaydi |

---

## 5. Xatolar

| HTTP | `error.code` | Qachon | `message` (o'zbekcha) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token yo'q/yaroqsiz / muddati o'tgan | — (umumiy) |
| 422 | `VALIDATION_ERROR` | Noto'g'ri `purpose`, fayl yo'q, yoki fayl JPEG/PNG/WebP emas | `error.fields` bilan |
| 413 | `FILE_TOO_LARGE` | Fayl 5 MB dan katta | `Fayl hajmi 5 MB dan oshmasligi kerak` |
| 429 | `RATE_LIMITED` | Soatiga 100 ta yuklash limiti oshdi | — (throttler) |

> ⚠️ Yaroqsiz `purpose`/fayl → **422** (`VALIDATION_ERROR`), **400 emas**.

---

## 6. Admin panel eslatmasi

🔒 **Auth, stateless.** Yuklash **egalik (ownership) saqlamaydi**, DB yozuvi yo'q, ro'yxat/olish endpointi ham yo'q — qaytadigan `url` faqat matn sifatida boshqa modulga (biznes/e'lon/profil) beriladi.

**Media moderatsiyasi joriy API bilan qo'llab-quvvatlanmaydi:** yuklangan rasmlarni ko'rish (list), o'chirish yoki **takedown** qilish uchun endpoint **yo'q**. Admin panel moderatsiya (masalan, nomaqbul rasmni olib tashlash) uchun backend media yozuvlarini persistent qilib, permission bilan variant ochishi kerak, masalan:
- `GET /admin/media` (yuklangan rasmlar ro'yxati, filtr + paginatsiya),
- `DELETE /admin/media/:id` (rasmni takedown / o'chirish).

To'liq ro'yxat: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
