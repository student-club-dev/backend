# Stiker qidiruvi — backend javobi

`STICKER_SEARCH_BACKEND.md` (Backend Prompt 4) bo'yicha **hammasi bajarildi**. Quyida qo'shilgan
endpointlar, kontrakt o'zgarishlari va tekshiruv natijalari.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.
> Kotlin klientini shu fayldan qayta generatsiya qiling.

---

## 0. Avval — bekor qilingan ish

`PENDING_ACTIONS.md` §6 dagi **2 paket × 24 ta WebP** tayyorlash so'rovi bekor qilindi. Hech narsa
seed qilinmadi, `GET /v1/stickers/packs` kontrakti **o'zgarmadi** — ilovadagi Fluent Emoji katalogi
o'z holicha ishlayveradi.

---

## 1. `GET /v1/stickers/search` — qo'shildi

`GET /v1/gifs/search` ning aynan nusxasi: bir xil parametrlar, bir xil sahifalash, bir xil
throttling (60 so'rov/daqiqa, foydalanuvchi boshiga).

| Parametr | Tur | Izoh |
|---|---|---|
| `q` | `string?`, ≤100 | Bo'sh yoki yo'q → **trending** |
| `limit` | `int?`, 1–50 | Odatiy `30` |
| `pos` | `string?` | Oldingi sahifadagi `next` |
| `locale` | `uz_UZ` \| `ru_RU` \| `en_US` | Odatiy `uz_UZ` |

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK", "error": null,
  "result": {
    "items": [
      { "id": "8471021",
        "url": "https://static.klipy.com/…/md.webp",
        "thumbUrl": "https://static.klipy.com/…/xs.webp",
        "width": 512, "height": 512, "isAnimated": true }
    ],
    "next": "2",
    "provider": "KLIPY"
  }
}
```

**WebP, MP4 emas.** Adapter faqat `webp` va (u bo'lmasa) alfa saqlangan `gif` renditionlarini
oladi. MP4 umuman ko'rib chiqilmaydi — hatto KLIPY faqat MP4 bergan holatda ham element
**tashlab yuboriladi**, chunki alfasiz stiker oq kvadrat bo'lib chiqadi va bu bizning ilovamiz
xatosidek ko'rinadi. Bu holat testda qamralgan (`drops an item that only has MP4 …`).

`POST /v1/stickers/{id}/share` ham qo'shildi — GIF'dagidek, best-effort, hech qachon yuborishni
buzmaydi. KLIPY'da share endpointi yo'q, shuning uchun bu hozircha jim no-op.

Yangi shartnoma **kerak bo'lmadi**: o'sha `KLIPY_API_KEY`, o'sha `KLIPY_BASE_URL`, faqat yo'l
`/stickers/search` va `/stickers/trending`.

---

## 2. Stiker xabari kontrakti — `SendMessageDto.sticker`

`SendMessageDto` ga `sticker` obyekti qo'shildi (`gif` bilan bir xil shakl):

```jsonc
{
  "type": "STICKER",
  "sticker": {
    "provider": "KLIPY", "externalId": "8471021",
    "url": "https://static.klipy.com/…/md.webp",
    "thumbUrl": "https://static.klipy.com/…/xs.webp",
    "width": 512, "height": 512
  },
  "clientMsgId": "…"
}
```

- `stickerId` **o'z holicha qoldi** — eski klientlar buzilmaydi (test bilan qamralgan).
- Ikkalasi birga → **422 `STICKER_SOURCE_AMBIGUOUS`**. Ustunlik berilmadi, ataylab rad etiladi:
  ikkalasini yuborgan klientda xato bor, yarmini jimgina tashlab yuborish o'sha xatoni yashiradi.
- `type: STICKER` da `body` avvalgidek taqiqlangan.

### ⚠️ `MessageDto.sticker` — nullability o'zgardi

Ikkala manba bitta shaklda qaytadi, lekin faqat bitta manba to'ldira oladigan maydonlar
**nullable** qilindi. Kotlin klientida bu `String` → `String?` o'zgarishi:

| Maydon | Katalog stikeri | KLIPY stikeri |
|---|---|---|
| `id` | katalog cuid | provayder id si |
| `url`, `width`, `height` | ✅ | ✅ |
| `provider` | `null` | `"KLIPY"` — attribution shu bo'yicha |
| `packId` | pack id | `null` |
| `emoji` | `"😄"` | `null` |
| `thumbUrl` | `null` (512×512 o'zi kichik) | kichikroq preview |

**Chizish uchun `url`/`width`/`height` yetarli** — manbani ajratish shart emas, aynan siz
so'raganingizdek. `packId`/`emoji` — katalog metadatasi, KLIPY stikerida bunday tushuncha yo'q,
shuning uchun sintetik qiymat qo'yishdan ko'ra `null` qaytarish to'g'riroq.

**Saqlash:** `messages` jadvaliga 6 ta nullable ustun qo'shildi (`sticker_provider`,
`sticker_external_id`, `sticker_url`, `sticker_thumb_url`, `sticker_width`, `sticker_height`).
Denormalizatsiya ataylab: KLIPY stikeri bizning bazamizda yo'q, va o'tgan yili yuborilgan stiker
provayder katalogidan chiqib ketgandan keyin ham ko'rinib turishi kerak.

---

## 3. Domen oq ro'yxati — ikki joyda

`isAllowedStickerUrl` — `url` va `thumbUrl` uchun, **qidiruv natijasini qaytarishda ham,
yuborishda ham**. Tekshiruvning o'zagi GIF bilan bir xil kodda (`common/validation/provider-url.ts`),
faqat host ro'yxati torroq: KLIPY'dan oldingi stiker qatori yo'q, shuning uchun legacy CDN'lar
(giphy/tenor) ro'yxatga kiritilmadi — kerak bo'lmagan har bir host lookalike yashirinadigan yana
bitta joy.

Rad etiladi: `static.klipy.com.evil.example`, `https://static.klipy.com@evil.example/x.webp`,
`http://`, `javascript:`, `data:`, buzuq URL. Hammasi test bilan qamralgan
(`sticker-source.spec.ts`).

---

## 4. Xato kodlari

| Kod | HTTP | Qachon |
|---|---|---|
| `STICKER_URL_NOT_ALLOWED` | 422 | URL ruxsat etilgan domenlardan emas |
| `STICKER_SOURCE_AMBIGUOUS` | 422 | `stickerId` va `sticker` birga |
| `STICKER_PROVIDER_ERROR` | 502 | KLIPY javob bermadi |
| `STICKER_PROVIDER_ERROR` | 503 | `KLIPY_API_KEY` sozlanmagan |
| `STICKER_PROVIDER_RATE_LIMITED` | 429 | Provayder chegarasi |
| `STICKER_NOT_FOUND` | 422 | `stickerId` katalogda yo'q (**o'zgarmadi**) |

---

## 5. Qilinmagan narsalar (siz so'raganingizdek)

- ❌ Telegram stikerlari olinmadi
- ❌ KLIPY fayllari serverga ko'chirilmadi — havola qilinadi, `mediaId` berilmaydi
- ❌ Ads API yoqilmadi
- ❌ `.tgs` / Lottie qo'shilmadi

---

## 6. Tayyorlik mezonlari — holat

| Mezon | Holat |
|---|---|
| `GET /v1/stickers/search?q=cat&limit=5` → 5 ta, `provider: "KLIPY"`, WebP | ⚠️ **kod tayyor, jonli kalit bilan tekshirilmagan** — pastga qarang |
| `q` siz → trending; `pos` bilan 2-sahifa boshqa elementlar | ⚠️ o'sha sabab |
| `sticker.url` = lookalike domen → `422 STICKER_URL_NOT_ALLOWED` | ✅ unit test |
| `stickerId` + `sticker` birga → `422 STICKER_SOURCE_AMBIGUOUS` | ✅ unit test |
| `KLIPY_API_KEY` o'chirilganda → `503`, boshqa hech narsa buzilmaydi | ✅ unit test |
| Eski klient `stickerId` bilan avvalgidek ishlaydi | ✅ unit test |

### ⚠️ Ochiq qolgan narsa — curl natijalari

Siz so'ragan **jonli curl natijalarini bera olmadim**: bu muhitda `KLIPY_API_KEY` sozlanmagan,
shuning uchun `/v1/stickers/search` hozir `503` qaytaradi. Adapter to'liq unit testlar bilan
qamralgan (KLIPY javob shakli mock qilingan: WebP tanlash, MP4 ni tashlash, 429 → 429, 500 → 502,
kalit logga chiqmasligi, kursor), lekin bu **haqiqiy provayder javobi emas**.

Kalit qo'yilgandan keyin tekshirish uchun:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.studentclub.uz/v1/stickers/search?q=cat&limit=5" | jq '.result.items[].url'
```

Barcha `url` lar `.webp` bilan tugashi va `static.klipy.com` da bo'lishi kerak.

**Prod kalit haqidagi eslatmangiz qabul qilindi** — so'raladigan videoda ikkala panel (GIF va
stiker) ko'rsatiladi, ikkinchi ariza berilmaydi.

---

## 7. Tegilgan fayllar

**Yangi:** `common/validation/provider-url.ts` · `stickers/domain/sticker-source.ts` ·
`stickers/domain/sticker-provider.port.ts` · `stickers/infrastructure/klipy-sticker.adapter.ts` ·
`stickers/presentation/dto/sticker-search.dto.ts` (+ 2 ta spec)

**O'zgargan:** `stickers/presentation/stickers.controller.ts` · `stickers/stickers.module.ts` ·
`gifs/domain/gif-source.ts` (umumiy tekshiruvga o'tkazildi) · `chat/` (send yo'li, mapper, DTO'lar) ·
`common/errors/error-code.ts` · `prisma/schema.prisma`

**Migratsiya:** `20260731064655_external_sticker_on_message` — faqat additive nullable ustunlar,
mavjud qatorlarga tegmaydi.
