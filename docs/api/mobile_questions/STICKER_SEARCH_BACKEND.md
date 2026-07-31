# Backend Prompt 4 — Stiker qidiruvi (KLIPY Sticker API)

> Claude Desktop'da backend repo'sini ochib, quyidagi matnni to'liq nusxalab yuboring.
> To'liq spec: `STICKER_SEARCH_BACKEND.md` (kerak bo'lsa qo'shimcha bering, lekin
> quyidagi matn o'zi yetarli).

---

Loyiha: ElonUz — Student API (NestJS + Prisma, https://api.studentclub.uz).

AVVAL BIR NARSANI BEKOR QILAMIZ: `docs/handoff/PENDING_ACTIONS.md` §6 da sizdan stiker
uchun **2 paket × 24 ta WebP** tasvir tayyorlash so'ralgan edi. **Bu endi kerak emas** —
mobil ilova o'z zaxira katalogini qurib oldi (1625 ta Fluent Emoji 3D stiker, MIT
litsenziya, CDN'dan yuklanadi). Stiker paneli bugun to'liq ishlayapti.
`GET /v1/stickers/packs` kontrakti o'z holicha qoladi — o'zgartirish ham, seed qilish ham
shart emas. Vaqtingizni unga sarflamang.

QOLGAN BO'SHLIQ: Fluent Emoji — emoji shaklidagi stikerlar, **personaj** stikerlari emas
(Telegramdagi mushuklar va h.k.). Foydalanuvchi kutadigan narsa aynan shu, va uni faqat
qidiruv bera oladi.

VAZIFA 1 — `GET /v1/stickers/search`

KLIPY'da GIF'dan tashqari **alohida Sticker API** bor (millionlab shaffof fonli,
animatsiyali stiker). Bu allaqachon ulangan provayder: **o'sha `KLIPY_API_KEY`, o'sha
`KLIPY_BASE_URL`**, yangi shartnoma kerak emas.

Yuqori oqim: `GET {KLIPY_BASE_URL}/{KEY}/stickers/search` (kalit **yo'lda**, GIF'dagidek),
trending uchun `…/stickers/trending`.

Endpoint `GET /v1/gifs/search` ning **aynan nusxasi** bo'lsin — parametrlar, sahifalash,
xato kodlari bir xil:

| Parametr | Izoh |
|---|---|
| `q` | Bo'sh bo'lsa — trending |
| `limit` | 1–50, odatiy 30 |
| `pos` | Sahifa kursori, shaffof |
| `locale` | `uz_UZ` / `ru_RU` / `en_US`, odatiy `uz_UZ` |

```jsonc
{
  "result": {
    "items": [
      { "id": "8471021",
        "url": "https://static.klipy.com/…/xY3k.webp",
        "thumbUrl": "https://static.klipy.com/…/xY3k_s.webp",
        "width": 512, "height": 512, "isAnimated": true }
    ],
    "next": "2",
    "provider": "KLIPY"
  }
}
```

⚠️ **MP4 ga o'girmang.** GIF'da MP4 qaytarish to'g'ri qaror edi, lekin stikerda shaffof fon
**shart**, MP4 esa alfa kanalni tashlab yuboradi — stiker oq kvadrat ichida chiqadi.
Stikerda WebP (yoki shaffofligi saqlangan GIF) qaytarilsin.

`POST /v1/stickers/{id}/share` ham bo'lsin — GIF'dagidek, provayder reytingi uchun.

VAZIFA 2 — stiker xabari kontrakti

Hozir `SendMessageDto.stickerId` **server katalogidagi** qatorga ishora qiladi. KLIPY
stikeri sizning bazangizda yo'q, ya'ni `stickerId` unga yaramaydi.

`SendMessageDto` ga `sticker` **obyektini** qo'shing — `gif` bilan bir xil shaklda:

```jsonc
{
  "type": "STICKER",
  "sticker": {
    "provider": "KLIPY", "externalId": "8471021",
    "url": "https://static.klipy.com/…/xY3k.webp",
    "thumbUrl": "https://static.klipy.com/…/xY3k_s.webp",
    "width": 512, "height": 512
  },
  "clientMsgId": "…"
}
```

- `stickerId` va `sticker` — ikkalasi ixtiyoriy, lekin **bittasi** bo'lishi shart
  (ikkalasi birga → 422). `stickerId` server katalogi uchun qoladi → eski klientlar buzilmaydi.
- `MessageDto.sticker` javobda **ikkala holatda ham bir xil shaklda** qaytsin (`gif` da
  qilganingizdek) — klient manbani ajratmasin.
- `body` — `STICKER` da avvalgidek taqiqlangan.

VAZIFA 3 — domen oq ro'yxati (bu yerda ham majburiy)

`sticker.url` va `sticker.thumbUrl` GIF'dagi **o'sha** tekshiruvdan o'tsin: lookalike
domenlar (`static.klipy.com.evil.example`), authority'dagi credential (`…@evil.example`),
`http://`, `javascript:`, `data:` — hammasi rad etilsin. Tekshiruv **ikki joyda**: qidiruv
natijasini qaytarishda ham, yuborishda ham.

Sabab GIF'dagidek: klient obyektni sizga qaytarib yuboradi, ya'ni tekshirilmasa bu maydon
ixtiyoriy havola joylash teshigiga aylanadi.

Xato kodlari:

| Kod | HTTP | Qachon |
|---|---|---|
| `STICKER_URL_NOT_ALLOWED` | 422 | URL ruxsat etilgan domenlardan emas |
| `STICKER_SOURCE_AMBIGUOUS` | 422 | `stickerId` va `sticker` birga yuborilgan |
| `STICKER_PROVIDER_ERROR` | 502 | KLIPY javob bermadi / kalit yaroqsiz |
| `STICKER_PROVIDER_RATE_LIMITED` | 429 | Provayder chegarasi |
| — | 503 | `KLIPY_API_KEY` sozlanmagan |

Mavjud `STICKER_NOT_FOUND` (422) `stickerId` uchun o'z holicha qoladi.

VAZIFA 4 — OpenAPI

Yangi endpoint va modellar `student-club.json` (OpenAPI v1) ga qo'shilsin — **u yagona
manba**, Kotlin klienti o'sha yerdan generatsiya qilinadi. Spec'da bo'lmagan maydon klientga
umuman yetib bormaydi.

NIMA QILINMASIN:

- **Telegram stikerlarini olib ishlatmang.** `getStickerSet` bilan texnik jihatdan olinadi,
  lekin ular mualliflarning mulki va App Store shikoyat bo'yicha ilovani olib tashlaydi.
- **KLIPY fayllarini o'z serveringizga ko'chirmang** — shartlarga zid; havola qilinadi,
  `mediaId` berilmaydi (GIF'dagidek).
- **Ads API'ni yoqmang.**
- **`.tgs` / Lottie kerak emas** — KLIPY stikerlari WebP/GIF.

TAYYOR DEB HISOBLASH MEZONI:

- `GET /v1/stickers/search?q=cat&limit=5` → 5 ta element, `provider: "KLIPY"`, `url` lari
  **WebP** (MP4 emas) va shaffof fonli.
- `q` siz so'rov trending qaytaradi; `pos` bilan ikkinchi sahifa **boshqa** elementlar beradi.
- `sticker.url` ga `https://static.klipy.com.evil.example/x.webp` yuborilganda →
  `422 STICKER_URL_NOT_ALLOWED`.
- `stickerId` va `sticker` birga → `422 STICKER_SOURCE_AMBIGUOUS`.
- `KLIPY_API_KEY` o'chirilganda → `503`, boshqa hech narsa buzilmaydi.
- Eski klient `stickerId` bilan yuborganda avvalgidek ishlayveradi.

ESLATMA — production kalit: test kaliti soatiga 100 so'rov. Stiker qidiruvi qo'shilgach bu
chegara ikki barobar tezroq tugaydi. Prod kalit uchun so'raladigan video endi **ikkala
panelni** (GIF va stiker) qamrasin — bitta yozuv yetadi, ikkinchi marta ariza bermang.

Menga: qo'shilgan endpointlar ro'yxatini, `student-club.json` dagi diff'ni va yuqoridagi
mezonlarni tekshiruvchi curl natijalarini qaytar.
