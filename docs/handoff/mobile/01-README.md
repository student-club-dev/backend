# Backend o'zgarishlari (mobil jamoa uchun)

Bu papka sizning **uchta** hujjatingizga javoban qilingan barcha backend ishlarini o'z ichiga
oladi. Boshqa hech qayerga qarash shart emas.

| Sizning hujjatingiz | Javob | Holat |
|---|---|---|
| `CHAT_MEDIA_AND_CALLS_BACKEND.md` | `02`–`05` | ✅ **production'da** (2026-07-31) |
| `backend-4-stiker-qidiruv-prompt.md` | `06` | ✅ **production'da** (2026-07-31) |
| `STORY_AND_PROFILE_BACKEND.md` | `07`, `08` | ✅ **production'da** (2026-07-31) |

Branch: `main` (`f56071f`). Baza: `api.studentclub.uz`.

> ✅ **Hammasi jonli.** Uchala migratsiya bazaga tushdi, backend ko'tarildi, boot loglarida xato
> yo'q. Tasdiqlangan: `/v1/stories/feed` va `/v1/stickers/search` `401` qaytaradi (ya'ni marshrut
> bor va guard ishlayapti), `/v1/health` — `200`.
>
> **Stiker qidiruvi ham tasdiqlandi.** `KLIPY_API_KEY` sozlangan va sticker API akkauntda ochiq:
> `npm run stickers:probe` haqiqiy javobni oldi va 8 tadan 8 tasini map qildi, hammasi WebP
> (`06-STICKER-SEARCH.md` §1 dagi jadval).
>
> ⚠️ Kalit **test tarifida** — soatiga 100 ta so'rov, va GIF bilan stiker uni **bo'lishadi**.
> Panelda debounce qo'ying va `429` ni jimgina yutib yuboring. Production kalit uchun ariza
> berilyapti.

## Nima o'qish kerak

### Chat (allaqachon production'da)

| Fayl | Nima uchun |
|---|---|
| **`02-API-CHANGES.md`** | Asosiy hujjat. Sizning §17/§18/§19 bandlaringizning **har biri** bo'yicha holat, o'zgargan kontrakt va yangi endpointlarning to'liq tavsifi |
| **`03-WEBSOCKET.md`** | `/chat` WS protokoli. **Swagger'da yo'q** — generatsiya qilingan klient buni bilmaydi, qo'lda yoziladi |
| **`04-GIF-INTEGRATION.md`** | GIF paneli: provayder, atribut majburiyati, xatolar |
| **`05-PUSH-SETUP.md`** | Push: Firebase loyihasi, APNs kaliti, `/v1/devices`, payload shakli. **Sizda bajarilmagan ish shu yerda** |

### Yangi to'plam (2026-07-31 dan production'da)

| Fayl | Nima uchun |
|---|---|
| **`06-STICKER-SEARCH.md`** | `GET /v1/stickers/search`, `SendMessageDto.sticker`. ⚠️ **`MessageDto.sticker` da buzuvchi o'zgarish bor** |
| **`07-STORIES.md`** | Story: yuklash, lenta, ko'rish, o'chirish, cheklovlar |
| **`08-PROFILE.md`** | Bir nechta profil rasmi, `bio`, `phoneVisibility`, `GET /v1/students/{id}` |

### Hamma uchun

| Fayl | Nima uchun |
|---|---|
| **`student-api.json`** | OpenAPI 3.0 — **Kotlin klientini shundan generatsiya qiling.** Uchala to'plam ham ichida |

## Eng qisqa xulosa

**Bajarildi:**

- **C qism (§17) to'liq** — `clientMsgId`, `TOKEN_EXPIRED`, `hasMore`, `/delivered`, suhbatlar
  tartibi, `read`/`delivered` ack'lari, `reports` tekshiruvi
- **§18 dan 4 ta endpoint** — xabar o'chirish, bitta suhbat, bloklanganlar ro'yxati, unread-count
- **§19 spec sifati to'liq** — pastda alohida
- **A qism (media) to'liq** — rasm, GIF, video, ovoz, fayl, stiker, albom, `media:ready`

- **Push (§13 ning birinchi yarmi)** — real FCM provayderi yozildi va production'da ishlayapti
- **nginx WS upgrade (§17.2)** — qo'llandi, `ws: 101`. Chat endi haqiqiy WebSocket ustida

**Bajarilmagan:**

- **B qism (qo'ng'iroq)** — boshlanmagan. Qolgan bloklovchilar: **VoIP push (PushKit)** — buni FCM
  yubora olmaydi, alohida APNs adapteri kerak — va **coturn** serveri
- **§18 dagi qolganlari** — tahrirlash, arxiv, qidiruv, reply, reaksiya, forward, guruh. Talab
  qilinmagan, ro'yxatga olingan

## §19 — codegen endi toza

- Ikkala hujjatda ham tipsiz `{"type":"object","nullable":true}` **0 ta qoldi** (avval 176 ta edi)
- Butun sonlar `integer/int32` (pul — `int64`) — har bir hujjatda 117 ta maydon
- `MessageDto.body` endi spec'da ham `string`
- Nullable `$ref` lar `allOf` ichida

**`cleanSwagger` Gradle taskini olib tashlashingiz mumkin.** Regressiya qaytmasligi uchun backendda
guard testi turibdi — noto'g'ri tipdagi yangi DTO qo'shilsa, test qizil bo'ladi.

## Sizga bog'liq uchta ish

1. **Firebase sozlamasi** — Android va iOS ilovalarini `studentclub-191b0` loyihasiga qo'shish,
   iOS uchun APNs `.p8` kalitini yuklash, `/v1/devices` ga tokenni yuborish.
   **Busiz push umuman ishlamaydi.** Batafsil: `05-PUSH-SETUP.md`
2. **Optimistik xabarni `clientMsgId` bo'yicha moslashtirishga o'tish** — matn bo'yicha emas.
   Batafsil: `03-WEBSOCKET.md`. Bu sizning §17.1 dagi xatoyingizni yopadi
3. **GIF panelida atribut** — `04-GIF-INTEGRATION.md`

## Tekshirilganlik holati

Backend **haqiqiy baza bilan tekshirildi**: 11 e2e suite / 114 test o'tdi. Bu yerda tasvirlangan
har bir yangi endpoint va xatti-harakat e2e test bilan qoplangan. Unit testlar: 808 ta, tiplar va
build toza.

**Production'da tasdiqlangan (2026-07-31):**

| | |
|---|---|
| Migratsiyalar qo'llandi | 3 ta yangi |
| `ffmpeg` image ichida | `version 8.0.1` — GIF, video, ovoz ishlaydi |
| WebSocket | `ws: 101` (ilgari 400) |
| Yuklash hajmi chegarasi | 70 MB (64 MB video sig'adi) |
| FCM autentifikatsiyasi | `OK — project studentclub-191b0` |
| Yuklangan fayllar doimiyligi | volume qo'shildi |

> ~~⚠️ Stiker paketlari hozircha bo'sh — tasvirlar tayyorlanmagan.~~
> **Bu eslatma bekor** (2026-07-31). Siz o'z zaxira katalogingizni qurib olganingizdan keyin
> backend tomonda tasvir tayyorlash bekor qilindi. `GET /v1/stickers/packs` kontrakti o'zgarmadi.
> O'rniga **stiker qidiruvi** qo'shildi — `06-STICKER-SEARCH.md`.

---

## Ikkinchi to'plam — eng qisqa xulosa

**Stiker (`06`):** `GET /v1/stickers/search` + `POST /v1/stickers/{id}/share` (KLIPY, o'sha kalit).
`SendMessageDto` ga `sticker` obyekti — `stickerId` bilan bir vaqtda emas.
⚠️ **`MessageDto.sticker.packId` va `.emoji` endi nullable** — bu yagona buzuvchi o'zgarish.

**Story (`07`):** 6 ta endpoint, `chat-upload` ga `STORY_IMAGE`/`STORY_VIDEO` turlari.
Eshik chat bilan bir xil. Bir vaqtda 10 ta, kuniga 20 ta. **Push yuborilmaydi.**

**Profil (`08`):** `photos[]` massivi + 4 ta endpoint (maks 6 ta), `bio` (140 belgi, spam filtri),
`phoneVisibility` (**odatiy `NOBODY`**), `GET /v1/students/{id}`.
`avatarUrl` **saqlanib qoldi** va `photos[0]` bilan sinxron.

### Sizga bog'liq qo'shimcha ish

1. **Klientni qayta generatsiya qiling** — `student-api.json` yangilangan (65 ta yo'l).
2. **`MessageDto.sticker` nullability** — `packId`/`emoji` uchun `String?` ni ishlang (`06` §4).
3. **Story media URL'lari token talab qiladi** — oddiy rasm yuklovchi ishlamaydi (`07` §11).

---

Nima qolganining to'liq ro'yxati backend repo'sida: `docs/handoff/PENDING_ACTIONS.md` — u
backend/DevOps uchun va bu papkaga ataylab kiritilmagan.
