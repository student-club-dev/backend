# Stiker paneli — qidiruv qo'shildi

Provayder: **KLIPY Sticker API**. GIF bilan bir xil kalit, bir xil base URL — backend proksi qiladi.

> **Avvalgi eslatma bekor.** `01-README.md` da "stiker paketlari bo'sh, tasvirlar tayyorlanmagan"
> deb yozilgan edi. Siz o'z zaxira katalogingizni (1625 ta Fluent Emoji 3D) qurib olganingizdan
> keyin backend tomonda tasvir tayyorlash **bekor qilindi**. `GET /v1/stickers/packs` kontrakti
> **o'zgarmadi** va hech narsa seed qilinmadi — panelingiz o'z holicha ishlayveradi.

Yangi ish — **personaj** stikerlari (Telegramdagi mushuklar va h.k.). Emoji shaklidagi stikerlarni
sizning katalogingiz beradi; personajlarni faqat qidiruv bera oladi.

---

## 1. `GET /v1/stickers/search`

`GET /v1/gifs/search` ning aynan nusxasi — parametrlar, sahifalash, throttling bir xil.

| Parametr | Izoh |
|---|---|
| `q` | Qidiruv so'zi. **Bo'sh yoki yo'q** → trending |
| `limit` | 1–50, odatiy 30 |
| `pos` | Keyingi sahifa kursori — **shaffof**, ichiga qaramang |
| `locale` | `uz_UZ` / `ru_RU` / `en_US`, odatiy `uz_UZ` |

```jsonc
{
  "result": {
    "items": [
      { "id": "8471021",
        "url": "https://static.klipy.com/ii/…/BSYq5azEMz0rDsS.webp",
        "thumbUrl": "https://static.klipy.com/ii/…/uHXEfhW88mzculk.webp",
        "width": 115, "height": 115,
        "isAnimated": true }
    ],
    "next": "2",
    "provider": "KLIPY"
  }
}
```

### ⚠️ O'lchamlar juda xilma-xil — qat'iy 512×512 emas

Bizning katalogimiz 512×512 edi, KLIPY'niki **emas**. Jonli o'lchash (2026-07-31):

| So'rov | `width × height` | Hajm |
|---|---|---|
| `dog` | 96×96 | 2 KB |
| `happy` | 120×120 | 2 KB |
| `party` | 126×128 | 11 KB |
| `love` | 498×498 | 48 KB |

**Har doim `width`/`height` ni javobdan oling.** Qat'iy o'lcham bilan chizmang: 96×96 stikerni
120 dp ga cho'zsangiz xiralashadi. Tavsiya — `min(120dp, tabiiy o'lcham)` va markazlash, yoki
kichiklari uchun aspect-fit.

`thumbUrl` doim ~90×90 (`xs`) — panel katakchasi uchun aynan mos.

> Backend `md` renditionini tanlaydi. Tekshirildi: `hd` bilan **piksel jihatdan bir xil**, faqat
> kamroq siqilgan (`love`: hd 72 KB, md 48 KB — o'sha 498×498). Ya'ni `hd` hech narsa qo'shmaydi.

**`url` har doim WebP** (yoki alfasi saqlangan GIF), **hech qachon MP4**. Bu GIF'dan farq qiladi:
GIF'da MP4 qaytariladi (20× kichik), stikerda esa shaffof fon shart va MP4 alfa kanalini
tashlaydi. Agar KLIPY biror element uchun faqat MP4 bersa, backend uni **ro'yxatdan chiqarib
tashlaydi** — oq kvadrat ko'rsatgandan ko'ra ko'rsatmagan yaxshi.

`isAnimated` — deyarli har doim `true`. Animatsiyani boshqaruvsiz, cheksiz aylantirib qo'ying.

### Sahifalash

`next` ni keyingi so'rovga `pos` sifatida bering. `next: null` — oxiri.

### Atribut — majburiy

GIF'dagi bilan bir xil: `provider` maydoni qaysi nishonni ko'rsatishni aytadi. Hozir har doim
`"KLIPY"` → **"Powered by KLIPY"**. Bu ularning shartlarida yozilgan.

---

## 2. `POST /v1/stickers/{id}/share`

Foydalanuvchi qidiruvdan stiker tanlab yuborganda chaqiring. Ixtiyoriy `{ "q": "cat" }` — qaysi
so'rovdan tanlangani. Best-effort: javobini kutmang, xatosini ko'rsatmang, yuborishni bloklamang.

---

## 3. Stiker yuborish — `SendMessageDto` o'zgardi

Endi **ikkita manba** bor va ular bir-birini istisno qiladi.

### Katalogdan (o'zgarmadi)

```jsonc
{ "type": "STICKER", "stickerId": "st_01J…", "clientMsgId": "…" }
```

### Qidiruvdan (yangi)

Qidiruv natijasini **o'zgartirmasdan qaytaring**:

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

⚠️ **Ikkalasini birga yubormang** → `422 STICKER_SOURCE_AMBIGUOUS`. Server ustunlik bermaydi,
ataylab rad etadi.

`type: STICKER` da `body` avvalgidek taqiqlangan.

---

## 4. ⚠️ Buzuvchi o'zgarish — `MessageDto.sticker`

Javobda ikkala manba **bir xil shaklda** qaytadi, lekin faqat bitta manba to'ldira oladigan
maydonlar endi **nullable**. Kotlin'da `String` → `String?`:

| Maydon | Katalog | KLIPY |
|---|---|---|
| `id` | katalog id | provayder id |
| `url` · `width` · `height` | ✅ | ✅ |
| `provider` | `null` | `"KLIPY"` |
| `packId` | pack id | **`null`** |
| `emoji` | `"😄"` | **`null`** |
| `thumbUrl` | `null` | kichik preview |

**Chizish uchun `url` + `width` + `height` yetarli** — manbani ajratish shart emas.
`packId`/`emoji` faqat katalog metadatasi; KLIPY stikerida bunday tushuncha yo'q.

`provider != null` bo'lsa — atribut nishonini ko'rsating.

---

## 5. Xatolar

| Kod | HTTP | Nima qilish |
|---|---|---|
| `STICKER_SOURCE_AMBIGUOUS` | 422 | Klient xatosi — `stickerId` yoki `sticker`, bittasi |
| `STICKER_URL_NOT_ALLOWED` | 422 | URL o'zgartirilgan. Natijani **o'zgartirmasdan** qaytaring |
| `STICKER_PROVIDER_RATE_LIMITED` | 429 | Provayder bandi. "Birozdan keyin urinib ko'ring" |
| `STICKER_PROVIDER_ERROR` | 502 | Provayder javob bermadi |
| `STICKER_PROVIDER_ERROR` | 503 | Kalit sozlanmagan → **qidiruv tabini yashiring**, katalog ishlayveradi |
| `STICKER_NOT_FOUND` | 422 | `stickerId` katalogda yo'q (o'zgarmadi) |

**503 ni alohida ishlang.** Bu vaqtinchalik nosozlik emas — bu deployment'da qidiruv umuman
yo'qligini bildiradi. Qidiruv tabini ko'rsatmang, o'z katalogingiz bilan ishlayvering.

Bizning o'z chegaramiz ham bor: **60 so'rov/daqiqa** foydalanuvchi boshiga. Yozayotganda
debounce qo'ying (300–400 ms yetarli).

---

## 6. ⚠️ Kvota — sizga ta'sir qiladi

KLIPY **test kaliti soatiga 100 ta so'rov**, va GIF bilan stiker **bitta kvotani bo'lishadi**.
Stiker qidiruvi qo'shilgani uchun chegara ikki barobar tezroq tugaydi.

Production kalit uchun ariza berilyapti. So'raladigan videoda **ikkala panel** ko'rsatiladi —
ikkinchi marta ariza bermang.

Shu vaqtgacha: debounce, keshlash, va 429 ni ko'rsatmaydigan degradatsiya.

---

## 7. Nima qilinmadi (ataylab)

- ❌ Telegram stikerlari — mualliflik huquqi, App Store'dan olib tashlanish xavfi
- ❌ KLIPY fayllarini bizning serverga ko'chirish — shartlarga zid. Havola qilinadi, `mediaId` yo'q
- ❌ `.tgs` / Lottie — KLIPY stikerlari WebP/GIF
