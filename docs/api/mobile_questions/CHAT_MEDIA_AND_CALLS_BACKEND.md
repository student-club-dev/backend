# Chat media + Onlayn qo'ng'iroq — Backend spetsifikatsiyasi

Bu hujjat **Student Club** ilovasining chatiga ikkita katta imkoniyat qo'shish uchun
backendda nima qilinishi kerakligini to'liq tavsiflaydi:

- **A qism — Media xabarlar:** rasm (bir martada bir nechta), video, stiker, **GIF**
  (qidiruv bilan, Telegram uslubida), ovozli xabar, fayl.
- **B qism — Onlayn qo'ng'iroq:** 1:1 audio va video qo'ng'iroq (WebRTC), yopiq ilovada jiringlash,
  tiniq ovoz va barqaror video.
- **C qism — Chatning mavjud muammolari:** hozir ishlab turgan chatda topilgan xatolar,
  yetishmayotgan endpointlar va spec sifati bilan bog'liq muammolar. **Ularning bir qismi
  media/qo'ng'iroqdan oldin tuzatilishi shart** — aks holda yangi imkoniyatlar ustiga
  qo'yiladi va muammo kattalashadi.

Yakuniy API kontrakti — `dev/api-client-generator/student-club.json` (OpenAPI v1).
**U yagona manba**: Kotlin klienti o'sha yerdan generatsiya qilinadi, shuning uchun bu hujjatdagi
har bir model/endpoint spec'ga qo'shilishi shart. WebSocket hodisalari Swagger'ga sig'maydi —
ular `handoff/chat.md` ga (§7–§9 uslubida) yoziladi.

Klient: Kotlin Multiplatform (Android + iOS), Ktor, Socket.IO (Engine.IO v4) ustida.

---

## 0. Hozirgi holat — nima bor, nima yo'q

Backendda **bugun** mavjud:

| Imkoniyat | Holat |
|---|---|
| Matnli xabar (REST + WS) | ✅ ishlaydi |
| `seq` tartibi, `before`/`after` kursorlari | ✅ ishlaydi |
| O'qildi / yetkazildi kursorlari, `typing`, `presence` | ✅ ishlaydi |
| Rasm yuklash `POST /v1/media/upload` | ⚠️ **faqat** JPEG/PNG/WebP, max 5 MB, `purpose = LOGO\|COVER\|LISTING` |
| Video / audio / fayl yuklash | ❌ **yo'q** |
| Tipli xabar yuborish | ❌ **yo'q** — `SendMessageDto { body: string, clientMsgId }`, `type` maydoni yo'q |
| Stiker paketlari | ❌ **yo'q** |
| GIF (yuklash va qidiruv) | ❌ **yo'q** |
| Qo'ng'iroq (WebRTC signalizatsiya, TURN) | ❌ **yo'q** |
| VoIP push (iOS PushKit) | ❌ **yo'q** — `RegisterDeviceDto` da token turi ajratilmagan |

`MessageTypeDto` da `IMAGE | FILE | VOICE` enum qiymatlari **allaqachon bor**, lekin klient
ularni yarata olmaydi — yuborish DTO'sida `type` yo'q. Ya'ni yarim yo'l qilingan; bu hujjat
yo'lni oxirigacha olib boradi.

### ⚠️ Orqaga moslik — eng muhim qoida

Hozirgi klient `MessageDto.body` ni **matn (string)** deb o'qiydi (`WsMessage.body: String?`,
local bazada `body TEXT NOT NULL`). Swagger'da u `type: object` deb yozilgan, lekin amalda
string keladi.

> **`body` string bo'lib qolsin.** Media ma'lumoti `body` ichiga **solinmasin** — u uchun
> yangi `attachment` maydoni qo'shiladi. Aks holda ilovaning tarqatilgan versiyalari
> yangilanmagan foydalanuvchilarda chat butunlay ishlamay qoladi.

Barcha yangi maydonlar **ixtiyoriy (nullable)** bo'lsin.

---

# A QISM — MEDIA XABARLAR

## 1. Fayl yuklash

Mavjud `POST /v1/media/upload` **tegilmasin** (u e'lon rasmlariga xizmat qiladi va limitlari
boshqacha). Chat uchun alohida endpoint qo'shiladi.

### 1.1 `POST /v1/media/chat-upload`

`multipart/form-data`, `Authorization: Bearer <accessToken>`.

**So'rov qismlari:**

| Qism | Tur | Majburiy | Izoh |
|---|---|---|---|
| `file` | binary | ✅ | Faylning o'zi |
| `kind` | string | ✅ | `IMAGE \| GIF \| VIDEO \| VOICE \| FILE` |
| `conversationId` | string | ✅ | Kim uchun yuklanayotgani — ruxsat va kvota shu bo'yicha tekshiriladi |

`conversationId` majburiy bo'lgani muhim: shu bilan **bog'lanmagan odam serverga fayl yuklay
olmaydi** (spam/xosting sifatida ishlatilishining oldi olinadi).

**Limitlar va MIME oq ro'yxati:**

| `kind` | Ruxsat etilgan MIME | Maksimal hajm | Qo'shimcha cheklov |
|---|---|---|---|
| `IMAGE` | `image/jpeg`, `image/png`, `image/webp`, `image/heic` | 12 MB | tomoni ≤ 8192 px |
| `GIF` | `image/gif`, `video/mp4` | 20 MB | davomiyligi ≤ 30 s; **MP4 ga o'giriladi** (§4.5) |
| `VIDEO` | `video/mp4` (H.264+AAC), `video/quicktime` | 64 MB | davomiyligi ≤ 3 daqiqa |
| `VOICE` | `audio/mp4` (AAC), `audio/aac`, `audio/ogg` (Opus) | 16 MB | davomiyligi ≤ 5 daqiqa |
| `FILE` | quyidagi "Fayl oq ro'yxati" | 48 MB | — |

Fayl oq ro'yxati (`FILE`): `application/pdf`, `application/zip`,
`application/msword`, `application/vnd.openxmlformats-officedocument.*`,
`text/plain`, `text/csv`.

> ⛔ **`.apk`, `.exe`, `.sh`, `.bat`, `.jar`, `.dex`, `.ipa` va har qanday bajariladigan
> fayl rad etilsin** — `422 FILE_TYPE_NOT_ALLOWED`.

**MIME faqat kengaytma bo'yicha aniqlanmasin.** Faylning birinchi baytlari (magic bytes)
tekshirilsin (`file-type` yoki `libmagic`); `Content-Type` sarlavhasiga ishonilmasin.

**Server nima qiladi:**

1. Turni magic bytes bilan tasdiqlaydi.
2. **`IMAGE`** — EXIF'ni **butunlay tozalaydi** (GPS koordinatalari sizib chiqmasin!),
   orientatsiyani pikselga qo'llaydi, uzun tomoni > 1920 px bo'lsa 1920 ga siqadi (WebP q=82),
   `thumbUrl` uchun 320 px variant chiqaradi, `blurHash` hisoblaydi.
3. **`VIDEO`** — `ffprobe` bilan `durationMs`, `width`, `height` ni oladi; 1-soniyadan
   `thumbUrl` (JPEG 480 px) chiqaradi; `blurHash` hisoblaydi.
   Agar kodek H.264/AAC bo'lmasa — `ffmpeg` bilan **remux/transcode** qiladi (720p, H.264 baseline,
   AAC 96 kbps). Bu ish **navbatda (queue)** bajarilsin, javob esa darhol qaytsin
   (`status: PROCESSING`, tayyor bo'lganda WS `media:ready` hodisasi).
4. **`GIF`** — §4.5 dagi `ffmpeg` buyrug'i bilan ovozsiz, takrorlanuvchi MP4 ga o'giradi,
   `isAnimated = true` qo'yadi, birinchi kadrdan `thumbUrl` chiqaradi.
5. **`VOICE`** — `durationMs` ni oladi va **to'lqin shakli (waveform)** hisoblaydi:
   `0..100` oralig'idagi **48 ta butun son** (RMS amplituda, normallashtirilgan). Klient uni
   pufakda chizadi — klientda hisoblab bo'lmaydi, chunki fayl allaqachon siqilgan.
6. **`FILE`** — asl `fileName` ni saqlaydi (tozalangan holda: `../`, boshqaruv belgilari olib
   tashlanadi, ≤ 120 belgi).
7. Bazaga `MediaAsset` yozadi va **`mediaId`** qaytaradi.

**Javob `200`:**

```json
{
  "success": true,
  "status": 200,
  "message": "OK",
  "result": {
    "id": "med_01J8ZK4W...",
    "kind": "IMAGE",
    "status": "READY",
    "url": "https://cdn.elonuz.uz/chat/01J8ZK4W.webp",
    "thumbUrl": "https://cdn.elonuz.uz/chat/01J8ZK4W_t.webp",
    "mimeType": "image/webp",
    "sizeBytes": 284100,
    "width": 1440,
    "height": 1080,
    "durationMs": null,
    "waveform": null,
    "fileName": null,
    "blurHash": "L6PZfSi_.AyE_3t7t7R**0o#DgR4"
  },
  "error": null
}
```

`status`: `READY` yoki `PROCESSING` (video transkodlanayotganda).

### 1.2 `MediaAsset` modeli (baza)

```
id            ULID, PK
ownerId       Student.id
conversationId Conversation.id
kind          IMAGE | GIF | VIDEO | VOICE | FILE
status        PROCESSING | READY | FAILED
isAnimated    bool — GIF uchun true
storageKey    bucketdagi yo'l
url, thumbUrl
mimeType, sizeBytes, width, height, durationMs
waveform      int[] (nullable)
fileName      (nullable)
blurHash      (nullable)
messageId     Message.id (nullable) — xabarga biriktirilgach to'ldiriladi
createdAt
```

### 1.3 Media faylga kirish huquqi

Chat fayllari **ochiq havolada turmasin**. Ikki qabul qilinadigan yechim:

- **Tavsiya:** yopiq bucket + **imzolangan (signed) URL**, TTL 24 soat. `MessageDto` har safar
  o'qilganda yangi imzo bilan qaytariladi.
- Yoki: `GET /v1/media/{id}/raw` proksi-endpoint — a'zolikni tekshirib, oqim (stream) qaytaradi.
  (Bu oddiyroq, lekin butun trafik backend orqali o'tadi.)

Har ikki holda ham: **faqat o'sha suhbat a'zosi** faylni ocha olsin → aks holda `403 FORBIDDEN`.

### 1.4 Yetim (orphan) fayllarni tozalash

Foydalanuvchi rasm yuklab, keyin yuborishdan voz kechishi mumkin. Kunlik cron:
`messageId IS NULL AND createdAt < now() - 24h` bo'lgan `MediaAsset` larni bucket bilan birga
o'chiradi.

---

## 2. Tipli xabar yuborish

### 2.1 `SendMessageDto` (kengaytiriladi)

```json
{
  "type": "IMAGE",
  "body": "Kecha universitetda",
  "mediaId": "med_01J8ZK4W...",
  "stickerId": null,
  "albumId": "alb_01J8ZK50...",
  "clientMsgId": "1993f0b2a11-8c1f...-a90b..."
}
```

| Maydon | Tur | Majburiy | Izoh |
|---|---|---|---|
| `type` | enum | ❌ | `TEXT \| IMAGE \| GIF \| VIDEO \| VOICE \| FILE \| STICKER`. **Berilmasa `TEXT`** — eski klientlar shu sabab ishlayveradi |
| `body` | string | shartli | `TEXT` da — xabar matni (**majburiy**, 1–4000). `IMAGE`/`VIDEO`/`FILE` da — izoh (**ixtiyoriy**, ≤ 1024). `GIF`/`VOICE`/`STICKER` da — **bo'lishi mumkin emas** |
| `mediaId` | string | shartli | `IMAGE`/`VIDEO`/`VOICE`/`FILE` uchun **majburiy**; `GIF` da — o'zi yuklagan bo'lsa |
| `gif` | obyekt | shartli | `GIF` da tashqi manbadan (Tenor) tanlangan bo'lsa — §4.7b |
| `stickerId` | string | shartli | `STICKER` uchun **majburiy** |
| `albumId` | string | ❌ | Bir nechta rasmni bitta guruhga bog'laydi (§3) |
| `clientMsgId` | string | ❌ | Idempotentlik kaliti — hozirgidek |

**Server validatsiyasi:**

- `mediaId` — mavjud, `ownerId == currentUser`, `conversationId` mos, `messageId IS NULL`
  (ya'ni **hali ishlatilmagan**), `status == READY`.
  Aks holda: `422 MEDIA_NOT_FOUND` / `MEDIA_ALREADY_USED` / `MEDIA_NOT_READY`.
- `kind` va `type` mos kelishi shart: `IMAGE`↔`IMAGE`, `VIDEO`↔`VIDEO`, ... → `422 MEDIA_KIND_MISMATCH`.
- Xabar yaratilgach `MediaAsset.messageId` to'ldiriladi (fayl endi "ishlatilgan").
- **Xabar hech qachon bo'sh bo'lmasin**: `TEXT` da matn bo'sh → `422 MESSAGE_EMPTY` (hozirgidek).

### 2.2 `MessageDto` (kengaytiriladi)

```json
{
  "id": "msg_01J8ZK52...",
  "conversationId": "cnv_01H...",
  "senderId": "std_01H...",
  "seq": 148,
  "type": "IMAGE",
  "body": "Kecha universitetda",
  "attachment": {
    "id": "med_01J8ZK4W...",
    "kind": "IMAGE",
    "status": "READY",
    "url": "https://...",
    "thumbUrl": "https://...",
    "mimeType": "image/webp",
    "sizeBytes": 284100,
    "width": 1440,
    "height": 1080,
    "durationMs": null,
    "waveform": null,
    "fileName": null,
    "blurHash": "L6PZfSi_..."
  },
  "sticker": null,
  "albumId": "alb_01J8ZK50...",
  "call": null,
  "createdAt": "2026-07-28T09:14:22.531Z"
}
```

Yangi maydonlar — barchasi **nullable**:

| Maydon | Qachon to'ladi |
|---|---|
| `attachment` | `IMAGE`, `GIF`, `VIDEO`, `VOICE`, `FILE` |
| `sticker` | `STICKER` (§4) |
| `albumId` | rasm/video albomi (§3) |
| `call` | `CALL` turidagi tizim yozuvi (B qism, §14) |

`body`:
- `TEXT` → matn
- `IMAGE`/`VIDEO`/`FILE` → izoh yoki `null`
- `GIF`/`VOICE`/`STICKER`/`CALL`/`SYSTEM` → `null`

`MessageTypeDto` yangi ro'yxati:
`TEXT | IMAGE | GIF | VIDEO | VOICE | FILE | STICKER | CALL | SYSTEM`.

`AttachmentDto` ning GIF uchun qo'shimcha maydonlari: `isAnimated` (bool),
`provider` (`TENOR | GIPHY | null` — o'zi yuklaganda `null`), `externalId` (nullable).

### 2.3 Suhbatlar ro'yxatidagi ko'rinish

`ConversationListItemDto.lastMessage` — o'sha `MessageDto`. Klient ro'yxatda `type` ga qarab
matn chizadi ("📷 Rasm", "🎥 Video", "🎤 Ovozli xabar", "📎 Fayl", "🎬 Qo'ng'iroq").
**Serverdan tayyor matn kerak emas** — lokalizatsiya klientda.

---

## 3. Bir martada bir nechta rasm (albom)

**Qaror: har bir rasm — alohida xabar, alohida `seq`.** Ular umumiy `albumId` bilan bog'lanadi.

Sababi: `seq` — butun chatning tartib o'qi (tarix kursori, o'qildi kursori, `?after=` bilan
yetishib olish). Bitta xabarga bir nechta fayl solinsa, o'qilmaganlar sanog'i va sahifalash
buziladi. Albom esa faqat **ko'rinish** masalasi — klient bir xil `albumId` li ketma-ket
xabarlarni bitta to'r (grid) qilib chizadi.

**Oqim:**

1. Klient 10 tagacha rasm tanlaydi.
2. Har birini `POST /v1/media/chat-upload` ga yuboradi (parallel, ≤ 3 tadan).
3. Klient bitta `albumId` (ULID) generatsiya qiladi.
4. Har bir rasm uchun alohida `message:send` — **hammasida bir xil `albumId`**.
5. Izoh (`body`) faqat **birinchi** xabarga yoziladi.

**Server tomonidan:**

- `albumId` — shunchaki saqlanadi va qaytariladi, hech qanday mantiq yo'q.
- Bitta albomda **maksimum 10 ta** xabar → 11-chisiga `422 ALBUM_TOO_LARGE`.
- Push bildirishnomasi: bir xil `albumId` li xabarlar **bitta** push bo'lib ketsin
  (3 soniyalik oyna): «Aziz sizga 5 ta rasm yubordi».

---

## 4. Stikerlar va GIF

### 4.1 Modellar

```
StickerPack
  id, name, coverUrl, order, isDefault(bool), createdAt

Sticker
  id, packId, emoji, url (WebP 512×512, shaffof fon), width, height, order
```

Format: **statik WebP 512×512** (shaffof). Animatsiyalik stiker (Lottie/`.tgs`) — keyingi
bosqich, hozir spec'ga qo'shilmasin.

### 4.2 Endpointlar

**`GET /v1/stickers/packs`** → paketlar ro'yxati (stikerlari bilan birga; hammasi ~200 KB JSON,
bitta so'rov yetarli). Klient buni **doimiy keshlaydi** — `ETag` / `If-None-Match` qo'yilsin.

```json
{
  "result": {
    "packs": [
      {
        "id": "pk_student",
        "name": "Talaba hayoti",
        "coverUrl": "https://cdn.../pk_student/cover.webp",
        "isDefault": true,
        "stickers": [
          { "id": "st_01", "emoji": "😄", "url": "https://cdn.../st_01.webp", "width": 512, "height": 512 }
        ]
      }
    ],
    "version": 3
  }
}
```

`version` — paketlar o'zgarganda oshadi; klient shu bilan keshni yangilaydi.

### 4.3 Stiker xabari

`SendMessageDto { type: "STICKER", stickerId: "st_01", clientMsgId: "..." }`

`MessageDto.sticker`:

```json
{ "id": "st_01", "packId": "pk_student", "emoji": "😄", "url": "https://...", "width": 512, "height": 512 }
```

Noma'lum `stickerId` → `422 STICKER_NOT_FOUND`.

**Boshlang'ich kontent:** kamida **2 ta paket, har birida 24 ta stiker** seed qilib
qo'yilsin — talaba mavzusida (imtihon, kutubxona, kofe, uyqu, "5 baho", "deadline").
Bu backend jamoasining vazifasi; klient tayyor paketlarni ko'rsatadi.

### 4.4 ⚠️ Stiker kontenti qayerdan olinadi — litsenziya

> **Telegram stikerlarini olib ishlatish MUMKIN EMAS.** Texnik jihatdan ular yuklab
> olinadi (Bot API `getStickerSet` → `.tgs`/`.webm`), lekin:
>
> - stikerlar **mualliflarning** (yoki Telegram'ning o'zining) intellektual mulki;
> - Telegram shartlari ularni **boshqa ilovada tarqatishga ruxsat bermaydi**;
> - App Store va Google Play mualliflik huquqi shikoyati bo'yicha ilovani **olib tashlaydi** —
>   Apple bu masalada ayniqsa qattiq.
>
> Ya'ni bu ilovani do'kondan uchirib yuborishi mumkin bo'lgan xavf. Qilinmasin.

**Xavfsiz manbalar** (tekshirilgan, tijoriy ishlatishga ruxsat beradigan litsenziyalar):

| Manba | Litsenziya | Izoh |
|---|---|---|
| **Microsoft Fluent Emoji** | **MIT** | Eng yaxshi variant — 3D va "flat" uslublari, atribut talab qilmaydi, 1500+ tasvir |
| **OpenMoji** | CC BY-SA 4.0 | Atribut majburiy; "SA" — o'zgartirilgani ham shu litsenziyada tarqalishi kerak |
| **Twemoji** | CC BY 4.0 | Atribut majburiy, o'zgartirish erkin |
| **Noto Emoji** | OFL / Apache 2.0 | Google, juda keng qamrovli |
| Dizaynerga buyurtma | to'liq sizniki | 48 ta stiker — mahalliy narxda arzon, brendga mos va **hech qanday xavf yo'q** |

**Tavsiya:** v1 uchun **Fluent Emoji (MIT)** dan 2 ta paket yig'ilsin (talaba mavzusidagi
tasvirlar tanlab olinadi va 512×512 WebP ga o'giriladi) — bu darhol ishlaydi va hech qanday
huquqiy xavf yo'q. Keyingi bosqichda o'z dizayneringiz brendlangan paket chizadi.

**Animatsiyali stiker haqida:** Telegram `.tgs` formati — bu gzip qilingan **Lottie JSON**.
Uni chizish uchun Android va iOS'da alohida kutubxona kerak (`lottie-android` /
`lottie-ios`), Compose Multiplatform'da umumiy yechim **yo'q**. Shuning uchun v1 da
**statik WebP** — animatsiya keyingi bosqichga qoldirildi.

### 4.5 GIF — nima uchun aslida GIF emas

> **Muhim:** Telegram GIF'ni GIF sifatida **yubormaydi**. U har bir GIF'ni **ovozsiz,
> takrorlanuvchi MP4 (H.264)** ga o'giradi. Sababi — GIF formati juda samarasiz: bir xil
> 5 soniyalik animatsiya GIF'da 8 MB, MP4'da esa 300 KB bo'ladi. Biz ham shunday qilamiz.

`kind = GIF` bilan yuklangan fayl uchun server:

```bash
ffmpeg -i input.gif \
  -movflags +faststart \
  -pix_fmt yuv420p \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  -an -c:v libx264 -crf 26 -preset veryfast \
  output.mp4
```

- `-an` — **ovoz yo'q** (GIF'da ovoz bo'lmaydi va klient uni jimlikda o'ynatadi);
- `-pix_fmt yuv420p` va juft o'lchamlar — busiz iOS `AVPlayer` faylni ochmaydi;
- `+faststart` — metama'lumot boshiga ko'chadi, video **to'liq yuklanmasdan** o'ynay boshlaydi.

`AttachmentDto` da: `mimeType = "video/mp4"`, `isAnimated = true`, `durationMs`,
`thumbUrl` (birinchi kadr). Klient shu bayroq bo'yicha uni **avtomatik, cheksiz, ovozsiz**
o'ynatadi — aynan Telegram'dagidek.

Foydalanuvchi tayyor `.mp4` yuborsa ham `kind = GIF` bo'lishi mumkin (Telegram'da
"GIF sifatida yuborish" shunday ishlaydi) — server unda faqat ovoz oqimini olib tashlaydi.

### 4.6 GIF qidiruv — Tenor proksisi

Telegram'dagi «GIF» tugmasi bosilganda chiqadigan qidiruv — bu Tenor/Giphy xizmati.
Bizda ham shunday bo'ladi, lekin **API kaliti ilovaga solinmasin** (u dekompilyatsiyada
chiqib ketadi) — backend proksi qiladi.

**`GET /v1/gifs/search`**

| Parametr | Izoh |
|---|---|
| `q` | Qidiruv so'zi. **Bo'sh bo'lsa** — mashhurlar (`featured`) qaytariladi |
| `limit` | 1–50, odatiy 30 |
| `pos` | Keyingi sahifa kursori (Tenor `next` qiymati) |
| `locale` | `uz_UZ` / `ru_RU` — odatiy `uz_UZ` |

Backend Tenor v2 API'ga o'tadi (`https://tenor.googleapis.com/v2/search`), kalitni **server
muhit o'zgaruvchisida** saqlaydi (`TENOR_API_KEY`), javobni qisqartirib qaytaradi:

```json
{
  "result": {
    "items": [
      {
        "id": "tenor_16851…",
        "url": "https://media.tenor.com/…/animation.mp4",
        "thumbUrl": "https://media.tenor.com/…/tiny.gif",
        "width": 498, "height": 280, "durationMs": 2400
      }
    ],
    "next": "CAgQ…",
    "provider": "TENOR"
  }
}
```

Tenor javobidan **`mp4`** (yoki `tinymp4`) formati olinsin, `gif` emas — §4.5 dagi sabab.

**⚠️ Tenor shartlaridan kelib chiqadigan ikki majburiyat:**

1. **Fayllar o'z serverimizga ko'chirilmasin** — Tenor CDN havolasi to'g'ridan-to'g'ri
   ishlatiladi (re-hosting shartlarga zid). Shu bois GIF xabarida `mediaId` **bo'lmaydi**.
2. **Atribut** — qidiruv panelida «Powered by Tenor» yozuvi va logotipi ko'rsatilishi shart
   (klient ishi), hamda foydalanuvchi GIF tanlaganda backend Tenor'ning
   `registershare` endpointiga xabar bersin (`POST /v1/gifs/{id}/share` orqali yoki
   xabar yuborilganda avtomatik).

> Tenor kaliti bepul va cheklovi katta (kuniga o'n minglab so'rov). Giphy ham xuddi shunday
> ishlaydi — birortasi tanlansa kifoya. Tenor tavsiya etiladi: Google'niki, ishonchliroq
> va O'zbekistondan tez ochiladi.

### 4.7 GIF xabari

Ikki manba bor, ikkalasi ham `type: "GIF"`:

**a) Foydalanuvchi o'zi yuklagan GIF** — odatdagi oqim: `chat-upload` (`kind: GIF`) → `mediaId`.

```json
{ "type": "GIF", "mediaId": "med_…", "clientMsgId": "…" }
```

**b) Tenor qidiruvidan tanlangan** — yuklash yo'q, tashqi havola:

```json
{
  "type": "GIF",
  "gif": {
    "provider": "TENOR",
    "externalId": "tenor_16851…",
    "url": "https://media.tenor.com/…/animation.mp4",
    "thumbUrl": "https://media.tenor.com/…/tiny.gif",
    "width": 498, "height": 280, "durationMs": 2400
  },
  "clientMsgId": "…"
}
```

Server `gif` obyektini validatsiya qiladi: `url` **faqat** ruxsat etilgan domenlardan
bo'lsin (`media.tenor.com`, `media[0-9]*.giphy.com`) → aks holda `422 GIF_URL_NOT_ALLOWED`.
Busiz bu maydon ixtiyoriy havola joylash teshigiga aylanadi.

`MessageDto` da bu `attachment` ichida qaytariladi (`isAnimated: true`, `provider`,
`externalId` maydonlari bilan) — klient uchun ikkala manba **bir xil** ko'rinadi.

---

## 5. Ovozli xabar

`SendMessageDto { type: "VOICE", mediaId: "med_...", clientMsgId: "..." }`

`attachment` da **majburiy** ravishda `durationMs` va `waveform` bo'lishi kerak
(§1.1 — server hisoblaydi). Bularsiz klient pufakni chiza olmaydi → agar server hisoblay
olmasa, `422 MEDIA_NOT_READY` qaytsin, yarim ma'lumot yuborilmasin.

Klient formati: **AAC 64 kbps mono, 44.1 kHz, `.m4a`** (Android `MediaRecorder` + iOS
`AVAudioRecorder` ikkalasida ham native). Server qabul qilishi kerak bo'lgan format shu.

---

## 6. WebSocket o'zgarishlari (`/chat` namespace)

Hodisa **nomlari o'zgarmaydi** — faqat payload kengayadi.

### 6.1 `message:send` (klient → server)

```json
{
  "conversationId": "cnv_...",
  "clientMsgId": "...",
  "type": "VOICE",
  "body": null,
  "mediaId": "med_...",
  "stickerId": null,
  "albumId": null
}
```

`type` **berilmasa `TEXT`** deb qabul qilinsin — hozirgi klient shundoq ishlab ketaveradi.

Ack javobi hozirgidek: `{ clientMsgId, id, seq, createdAt, status: "sent" }`, xatoda
`{ status: "error", error: { code, message } }`.

### 6.2 `message:new` (server → klient)

Payload ichidagi `message` — **to'liq `MessageDto`** (yangi `attachment`, `sticker`,
`albumId`, `call` maydonlari bilan).

> ⚠️ Hozir server `message:new` da `clientMsgId` **yubormaydi**, shuning uchun klient o'z
> optimistik nusxasini **matn bo'yicha** topib o'chiradi. Media xabarda matn `null` bo'lishi
> mumkin, ya'ni bu usul buziladi.
> **Talab: `message:new` ichidagi `message` ga `clientMsgId` qo'shilsin** (jo'natuvchining
> o'ziga ketayotganda; boshqalarga `null`). Bu ikki marta ko'rinish muammosini butunlay yopadi.

### 6.3 `media:ready` (server → klient) — YANGI

Video transkodlash tugagach:

```json
{ "mediaId": "med_...", "conversationId": "cnv_...", "messageId": "msg_...", "attachment": { ... } }
```

Xabar `PROCESSING` holatida yuborilgan bo'lsa, klient shu hodisada URL'ni yangilaydi.

---

## 7. Push bildirishnomalari (media uchun)

`data` payload'iga `messageType` qo'shilsin. Ko'rinadigan matn:

| Tur | Matn |
|---|---|
| `TEXT` | xabar matni (≤ 120 belgi) |
| `IMAGE` | 📷 Rasm — izoh bo'lsa: `📷 <izoh>` |
| `GIF` | 🎞 GIF |
| `VIDEO` | 🎥 Video |
| `VOICE` | 🎤 Ovozli xabar |
| `FILE` | 📎 `<fayl nomi>` |
| `STICKER` | `<emoji>` Stiker |
| albom (≥2) | 📷 `<N>` ta rasm |

---

## 8. Xatolar (A qism)

| Kod | HTTP | Qachon |
|---|---|---|
| `FILE_TOO_LARGE` | 413 | Hajm limitdan oshdi |
| `FILE_TYPE_NOT_ALLOWED` | 422 | MIME oq ro'yxatda yo'q / bajariladigan fayl |
| `MEDIA_TOO_LONG` | 422 | Video/ovoz davomiyligi limitdan oshdi |
| `MEDIA_NOT_FOUND` | 422 | `mediaId` yo'q yoki boshqa foydalanuvchiniki |
| `MEDIA_ALREADY_USED` | 422 | Bu fayl allaqachon xabarga biriktirilgan |
| `MEDIA_NOT_READY` | 422 | Video hali transkodlanmoqda / waveform hisoblanmadi |
| `MEDIA_KIND_MISMATCH` | 422 | `type` bilan fayl turi mos emas |
| `STICKER_NOT_FOUND` | 422 | Noma'lum `stickerId` |
| `GIF_URL_NOT_ALLOWED` | 422 | `gif.url` ruxsat etilgan domenlardan emas (§4.7) |
| `GIF_PROVIDER_ERROR` | 502 | Tenor/Giphy javob bermadi yoki kalit yaroqsiz |
| `ALBUM_TOO_LARGE` | 422 | Albomda 10 tadan ko'p |
| `NOT_CONNECTED` | 403 | Bog'lanmagan odamga yuborish/yuklash |
| `UPLOAD_RATE_LIMIT` | 429 | §9 dagi kvota |

---

## 9. Limitlar va suiiste'molga qarshi

- Yuklash: **daqiqasiga 20 ta fayl**, **kuniga 500 MB** har bir talaba uchun.
- Xabar yuborish: **daqiqasiga 60 ta** (hozirgi limit saqlanadi).
- Bloklangan foydalanuvchiga yuklash ham, yuborish ham mumkin emas.
- Barcha yuklangan rasm/videoga **NSFW/moderatsiya** ilgagi (hook) qo'yilsin — hozir
  o'chirilgan bo'lsa ham, interfeys qoldirilsin (`ModerationStatus: PENDING|OK|BLOCKED`).
  Shikoyat (`POST /v1/reports`) allaqachon `messageId` qabul qiladi — media xabarga ham ishlasin.

---

# B QISM — ONLAYN QO'NG'IROQ (audio + video)

## 10. Arxitektura qarori

**1:1 qo'ng'iroq uchun — sof P2P WebRTC + TURN.** SFU (mediasoup/LiveKit) kerak emas:

- ikki kishilik qo'ng'iroqda SFU faqat kechikish va server yuki qo'shadi;
- P2P da media serverdan **umuman o'tmaydi** (NAT ochiq bo'lsa) — bu eng tiniq ovoz va
  eng past kechikish;
- server faqat **signalizatsiya** (SDP/ICE almashinuvi) va **TURN relay** ni beradi.

> Guruh qo'ng'irog'i kerak bo'lganda (3+ kishi) SFU qo'shiladi — lekin **hozir emas**.
> Signalizatsiya hodisalari shunday loyihalanganki, keyin SFU ga o'tish klient
> protokolini buzmaydi.

Backendda kerak bo'ladi:

1. **coturn** serveri (TURN/STUN) — o'z infratuzilmangizda.
2. `/calls` Socket.IO namespace — signalizatsiya.
3. `Call` jadvali — tarix va chatdagi yozuv.
4. VoIP push (iOS PushKit + Android high-priority FCM).

---

## 11. TURN / STUN serveri

### 11.1 coturn o'rnatish

Alohida (yoki API bilan bir) serverda **coturn** ko'tariladi. Muhim sozlamalar
(`/etc/turnserver.conf`):

```conf
listening-port=3478
tls-listening-port=5349
# Cheklovchi tarmoqlar (universitet Wi-Fi, korporativ proksi) uchun HAYOTIY:
alt-tls-listening-port=443

fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=<UZUN_TASODIFIY_SIR>
realm=elonuz.uz

listening-ip=<SERVER_PRIVATE_IP>
external-ip=<SERVER_PUBLIC_IP>

# Xavfsizlik — TURN'ni ichki tarmoqqa yo'l sifatida ishlatishning oldini oladi:
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255

user-quota=12
total-quota=1200
cert=/etc/letsencrypt/live/turn.elonuz.uz/fullchain.pem
pkey=/etc/letsencrypt/live/turn.elonuz.uz/privkey.pem
```

**443/TCP (TLS) porti majburiy** — talabalar universitet tarmog'idan qo'ng'iroq qiladi, u
yerda odatda faqat 443 ochiq bo'ladi. Busiz qo'ng'iroqlarning bir qismi **umuman ulanmaydi**.

### 11.2 `GET /v1/calls/ice-servers`

Klient **har qo'ng'iroqdan oldin** chaqiradi. Parol doimiy bo'lmasin — coturn'ning
`use-auth-secret` mexanizmi bo'yicha **vaqtinchalik** hisob beriladi:

```
username   = "<unixTimestamp+ttl>:<studentId>"
credential = base64( HMAC_SHA1( static-auth-secret, username ) )
```

**Javob:**

```json
{
  "result": {
    "iceServers": [
      { "urls": ["stun:turn.elonuz.uz:3478"] },
      {
        "urls": [
          "turn:turn.elonuz.uz:3478?transport=udp",
          "turn:turn.elonuz.uz:3478?transport=tcp",
          "turns:turn.elonuz.uz:443?transport=tcp"
        ],
        "username": "1785312000:std_01H...",
        "credential": "b0Xk9..."
      }
    ],
    "ttlSeconds": 3600
  }
}
```

`ttlSeconds = 3600`. Klient hisobni keshlaydi va muddati tugashiga 5 daqiqa qolganda yangilaydi.

---

## 12. Signalizatsiya — `/calls` Socket.IO namespace

Autentifikatsiya `/chat` dagidek: `auth: { token: "<accessToken>" }`.
Server foydalanuvchining **barcha** ulangan qurilmalarini biladi (bir odam telefon va
planshetda bo'lishi mumkin).

`callId` — **server** generatsiya qiladi (ULID).

### 12.1 Hodisalar jadvali

| Hodisa | Yo'nalish | Payload |
|---|---|---|
| `call:invite` | K → S | `{ conversationId, calleeId, media: "AUDIO"\|"VIDEO", sdp }` → ack `{ callId, expiresAt }` |
| `call:incoming` | S → K (chaqirilgan) | `{ callId, conversationId, caller: StudentSummaryDto, media, sdp, expiresAt }` |
| `call:ringing` | S → K (chaquvchi) | `{ callId }` — chaqirilganning qurilmasi hodisani oldi |
| `call:accept` | K → S | `{ callId, sdp }` (answer) |
| `call:accepted` | S → K (chaquvchi) | `{ callId, sdp }` |
| `call:decline` | K → S | `{ callId, reason: "DECLINED"\|"BUSY" }` |
| `call:declined` | S → K (chaquvchi) | `{ callId, reason }` |
| `call:cancel` | K → S | `{ callId }` — chaquvchi javob kutmay tashladi |
| `call:canceled` | S → K (chaqirilgan) | `{ callId }` |
| `call:ice` | K ↔ S | `{ callId, candidate: { candidate, sdpMid, sdpMLineIndex } }` — o'zgarishsiz uzatiladi |
| `call:end` | K → S | `{ callId }` |
| `call:ended` | S → K (ikkalasiga) | `{ callId, reason, durationMs, endedBy }` |
| `call:media-state` | K ↔ S | `{ callId, audioEnabled, videoEnabled }` — mikrofon/kamera holati |
| `call:renegotiate` | K ↔ S | `{ callId, sdp }` — ICE restart, kamera almashtirish, ekran ulashish |
| `call:taken` | S → K | `{ callId }` — boshqa qurilmangiz javob berdi, jiringlashni to'xtat |

`reason` qiymatlari: `DECLINED | BUSY | CANCELED | TIMEOUT | HANGUP | FAILED | UNAUTHORIZED`.

### 12.2 Nima uchun offer `invite` bilan birga ketadi

SDP offer **taklif bilan birga** yuboriladi (javob kutilmaydi) — chaqirilgan "Javob berish"
ni bosgan zahoti answer tayyorlanadi. Bu ulanish vaqtini ~1 soniyaga qisqartiradi.
ICE nomzodlari **trickle** rejimida, offerdan keyin oqim bo'lib ketaveradi.

### 12.3 Server tomonidagi qoidalar

1. **Ruxsat.** `call:invite` da tekshiriladi: chaquvchi va chaqirilgan **bog'langan**mi
   (`Connection` bor), **bloklanmaganmi**. Aks holda `error: NOT_CONNECTED` / `BLOCKED`.
2. **Ko'p qurilma.** `call:incoming` chaqirilganning **barcha** ulangan socket'lariga
   yuboriladi. Birinchi `call:accept` yutadi; qolganlariga `call:taken`.
3. **Band (busy).** Chaqirilganning `ACTIVE`/`RINGING` qo'ng'irog'i bo'lsa — darhol
   `call:declined { reason: "BUSY" }`.
4. **Glare (ikkisi bir vaqtda qo'ng'iroq qildi).** `callId` i **leksikografik kichik** bo'lgan
   qo'ng'iroq davom etadi; ikkinchisi `BUSY` bilan yopiladi.
5. **Faqat uzatuvchi.** Server SDP va ICE nomzodlarini **o'qimaydi va o'zgartirmaydi** — bir
   baytiga tegmay ikkinchi tomonga uzatadi.
6. **Yo'naltirish `callId` bo'yicha.** `call:ice`/`call:renegotiate` faqat o'sha qo'ng'iroq
   ishtirokchisiga boradi; begona `callId` → `error: CALL_NOT_FOUND`.
7. **Ulanish uzilishi.** Ishtirokchining socket'i uzilib, **20 soniya** ichida qaytmasa —
   qo'ng'iroq `FAILED` bilan yopiladi. (Qisqa uzilishlar — tunnel, lift — qo'ng'iroqni
   o'ldirmasin: WebRTC media socket'dan mustaqil ishlaydi.)

### 12.4 Vaqt chegaralari

| Nima | Qiymat |
|---|---|
| Jiringlash (javobsiz) | **45 s** → `TIMEOUT` |
| Accept'dan keyin ulanish | **30 s** → `FAILED` |
| Qo'ng'iroqning maksimal davomiyligi | **4 soat** |
| Socket uzilgach kutish | **20 s** |

---

## 13. Yopiq ilovada jiringlash (push)

Bu **eng ko'p e'tibordan chetda qoladigan va eng muhim** qism. Ilova yopiq bo'lsa,
WebSocket ham yopiq — demak `call:incoming` yetib bormaydi. Qo'ng'iroq **push orqali**
uyg'otilishi kerak.

### 13.1 `RegisterDeviceDto` kengaytiriladi

```json
{ "token": "...", "platform": "IOS", "tokenType": "APNS_VOIP" }
```

`tokenType`: `FCM | APNS | APNS_VOIP`. **Berilmasa — platformadan kelib chiqib taxmin
qilinsin** (`ANDROID → FCM`, `IOS → APNS`), shunda eski klientlar buzilmaydi.

Bitta iOS qurilmada **ikkita token** ro'yxatdan o'tadi: oddiy APNs (xabarlar uchun) va
VoIP (qo'ng'iroq uchun). Ular alohida qatorlar bo'lsin.

### 13.2 iOS — PushKit + CallKit (majburiy)

- Apple Developer hisobida **VoIP Services** kaliti/sertifikati yaratilsin.
- `call:invite` kelganda server chaqirilganga **VoIP push** yuboradi:
  `apns-push-type: voip`, `apns-priority: 10`, **`apns-topic: <bundleId>.voip`**.
- Payload:

```json
{
  "callId": "cal_01J...",
  "conversationId": "cnv_...",
  "callerId": "std_...",
  "callerName": "Aziz Karimov",
  "callerAvatarUrl": "https://...",
  "media": "VIDEO",
  "expiresAt": "2026-07-28T09:15:07.000Z"
}
```

> ⚠️ **iOS qoidasi:** VoIP push kelgan zahoti ilova **majburan** `CXProvider.reportNewIncomingCall`
> ni chaqirishi shart, aks holda iOS ilovani o'ldiradi va keyingi push'larni to'xtatadi.
> Shuning uchun VoIP push **faqat qo'ng'iroq uchun** ishlatilsin, boshqa hech narsa uchun emas.

### 13.3 Android — yuqori muhimlikdagi FCM

- `POST fcm/v1/.../messages:send` — **`android.priority: "high"`**, **faqat `data`**
  (`notification` bloki **bo'lmasin**, aks holda ilova uyg'onmaydi).
- Payload yuqoridagidek + `"type": "call"`.
- Klient `FirebaseMessagingService` da to'liq ekranli qo'ng'iroq bildirishnomasini
  ko'rsatadi (`USE_FULL_SCREEN_INTENT` + `CATEGORY_CALL`).

### 13.4 Push bekor qilinishi

Chaquvchi tashlab yuborsa yoki boshqa qurilma javob bersa — server **darhol** "bekor"
push'ini yuborsin (`"type": "call_cancel", "callId": "..."`), aks holda telefon bo'sh joyga
jiringlab turadi.

---

## 14. Qo'ng'iroq tarixi va chatdagi yozuv

### 14.1 `Call` jadvali

```
id            ULID, PK
conversationId
callerId, calleeId
media         AUDIO | VIDEO
status        RINGING | ACTIVE | ENDED | MISSED | DECLINED | FAILED | CANCELED
startedAt     invite yuborilgan payt
answeredAt    (nullable)
endedAt       (nullable)
durationMs    (nullable) — answeredAt..endedAt
endReason     HANGUP | TIMEOUT | DECLINED | BUSY | FAILED | CANCELED
endedBy       Student.id (nullable)
```

### 14.2 Chatda ko'rinishi

Qo'ng'iroq tugagach server **avtomatik** `type: "CALL"` xabar yaratadi (o'z `seq` i bilan) —
shunda tarix chatning o'zida ko'rinadi va hech qanday qo'shimcha ekran kerak emas:

```json
{
  "type": "CALL",
  "body": null,
  "senderId": "<callerId>",
  "call": {
    "callId": "cal_01J...",
    "media": "VIDEO",
    "status": "ENDED",
    "durationMs": 184000,
    "endReason": "HANGUP"
  }
}
```

**`MISSED` (javobsiz) qo'ng'iroq** ham xabar sifatida yoziladi va chaqirilgan uchun
**o'qilmagan** hisoblanadi (`unreadCount` ga kiradi) + oddiy push ketadi:
«📞 Javobsiz qo'ng'iroq».

### 14.3 `GET /v1/calls`

`?page=1&size=20` — qo'ng'iroqlar tarixi (alohida ekran uchun).
Javob: `{ items: CallDto[], page, size, total, hasNext }`.

---

## 15. Sifat — "tiniq gaplashish"

Bu qism klient bilan **birgalikda** bajariladi; backend quyidagilarni ta'minlaydi.

### 15.1 Ovoz (eng muhim qism)

Klient SDP'da Opus'ni shunday sozlaydi — backend buni **buzmasligi** kerak
(SDP ga tegilmasin, §12.3.5):

```
opus/48000/2
  useinbandfec=1     ; paket yo'qolganda tiklash — shovqinli tarmoqda hal qiluvchi
  usedtx=1           ; jimlikda paket yubormaydi — trafik ~40% tejaladi
  maxaveragebitrate=32000   ; audio-only uchun; video qo'ng'iroqda 24000
  stereo=0; sprop-stereo=0  ; nutq uchun mono yetarli va tiniqroq
  ptime=20
```

Klient tomonida: `echoCancellation: true`, `noiseSuppression: true`,
`autoGainControl: true`, `googHighpassFilter: true`.

### 15.2 Video

- Kodek tartibi: **H.264 (baseline)** birinchi → Android va iOS'da apparat kodlash
  (batareya va issiqlik), so'ng **VP8**.
- Maqsad: `1280×720 @ 30fps`, `2.0 Mbps`; past tarmoqda avtomatik `640×360 @ 24fps`,
  `500 kbps` gacha tushadi.
- `degradationPreference = "balanced"` (harakat ham, aniqlik ham).
- Klient `RTCRtpSender.setParameters` orqali `maxBitrate` qo'yadi.

### 15.3 Tarmoq barqarorligi

- **Trickle ICE** — nomzodlar oqim bo'lib ketadi, hammasi kutilmaydi.
- **ICE restart**: klient tarmoq almashganini sezsa (Wi-Fi → mobil) `call:renegotiate`
  yuboradi; server uzatadi, qo'ng'iroq **uzilmaydi**.
- TURN 443/TLS — cheklovchi tarmoqlar uchun (§11.1).

### 15.4 Nginx — WebSocket (⚠️ hozir ishlamayapti)

`/chat` va `/calls` namespace'lari WebSocket'da yuradi. Hozirgi nginx konfiguratsiyasida
WS proksilash to'g'ri sozlanmagan — **bu qo'ng'iroqni butunlay imkonsiz qiladi**:

```nginx
location /socket.io/ {
    proxy_pass http://api_upstream;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout  3600s;   # ping oralig'idan uzun bo'lsin
    proxy_send_timeout  3600s;
    proxy_buffering     off;     # signalizatsiya kechikmasin
}
```

API bir nechta nusxada ishlasa — **Socket.IO Redis adapteri** (`@socket.io/redis-adapter`)
majburiy, aks holda ikki foydalanuvchi turli nusxalarga tushib, hodisalar bir-biriga
yetib bormaydi. (Yoki nginx'da `ip_hash` sticky sessiya — lekin Redis adapteri to'g'riroq.)

### 15.5 Telemetriya

Ixtiyoriy, lekin juda foydali: `POST /v1/calls/{id}/stats` — klient qo'ng'iroq oxirida
`RTCStatsReport` xulosasini yuboradi (`rtt`, `packetsLost`, `jitter`, `bytesSent/Received`,
`selectedCandidatePairType: host|srflx|relay`). Shu bilan «TURN necha foiz qo'ng'iroqda
ishlatilyapti», «qayerda sifat yomon» degan savollarga javob bo'ladi.

---

## 16. Xavfsizlik (B qism)

- Qo'ng'iroq **faqat bog'langan** talabalar orasida (`Connection` bo'lishi shart).
- Bloklangan → `BLOCKED`.
- Qo'ng'iroq chastotasi: **daqiqasiga 10 ta taklif**, javobsiz qoldirilganlari alohida
  hisoblanadi (spam-qo'ng'iroqqa qarshi).
- TURN hisobi TTL **1 soat**, `studentId` ga bog'langan → sizib chiqsa ham uzoq ishlamaydi.
- Media **uchidan-uchiga (DTLS-SRTP)** shifrlangan — bu WebRTC'da standart, server media'ni
  ko'rmaydi (TURN relay ham shifrlangan oqimni uzatadi, ochmaydi).
- `POST /v1/reports` ga `callId` qabul qilinsin — qo'ng'iroq ustidan shikoyat qilish uchun.

---

# C QISM — CHATNING MAVJUD MUAMMOLARI

Quyidagilar **yangi imkoniyat emas** — bular bugun ishlab turgan chatdagi kamchiliklar.
Klient ularning ko'pini vaqtinchalik chorasi bilan yopib turibdi, lekin media va qo'ng'iroq
qo'shilganda bu chora-tadbirlar **ishlamay qoladi**.

## 17. Kritik — media/qo'ng'iroqdan OLDIN tuzatilsin

### 17.1 `message:new` da `clientMsgId` yo'q → xabar ikkilanadi yoki "yuborilmoqda"da muzlaydi

Server `message:new` ni **jo'natuvchining o'ziga ham** yuboradi, lekin `clientMsgId`siz.
Shu sababli klient ekrandagi optimistik ("yuborilmoqda") nusxani **xabar matni bo'yicha**
topib o'chirishga majbur:

```sql
DELETE FROM MessageEntity
WHERE conversationId = ? AND status = 'SENDING' AND body = ?;
```

**Bugungi xato:** ketma-ket bir xil ikki xabar yuborilsa (masalan «ha», keyin yana «ha»),
birinchi ack noto'g'ri qatorni o'chiradi — natijada bitta xabar ekranda abadiy
"yuborilmoqda" bo'lib qoladi, ikkinchisi esa ikki marta ko'rinadi.

**Media bilan bu butunlay buziladi:** ovozli xabar va stikerda matn `null`, ya'ni moslashtirish
uchun hech narsa qolmaydi.

> **Talab:** `message:new` payload'idagi `message` obyektiga **`clientMsgId` qo'shilsin**
> (jo'natuvchining o'z ulanishlariga — haqiqiy qiymat; boshqa a'zoga — `null`).
> Bu bitta maydon butun muammoni yopadi.

### 17.2 nginx WebSocket upgrade ishlamayapti

`transport=websocket` handshake'i **400** qaytaradi, shuning uchun klient Engine.IO
**long-polling** transportiga tushib ishlayapti (`SocketIoClient` da shu uchun zaxira yo'l
yozilgan).

Oqibati bugun: batareya sarfi yuqori, `typing`/`presence` kechikadi, mobil tarmoqda
ulanish tez-tez uziladi.

Oqibati keyin: **qo'ng'iroq polling ustida umuman ishlamaydi** — ICE nomzodlari va SDP
almashinuvi sekundlik kechikishga chidamaydi.

> **Talab:** §15.4 dagi nginx konfiguratsiyasi qo'llansin. Bu **№1 ustuvorlik** —
> qo'ng'iroqning butun B qismi shunga bog'liq.

### 17.3 WebSocket xatolari `BaseResponse` konvertida kelmaydi

REST hamma joyda bir xil konvert beradi:
`{ success, status, message, result, error: { code, message, fields } }`.

WS ack esa butunlay boshqacha: `{ status: "error", error: { code, message } }` — konvert yo'q,
HTTP statusi yo'q.

Oqibati: klientda ikkita alohida xato yo'li bor; WS xatosi `AppException` ga aylanmaydi,
`TOKEN_EXPIRED` da avtomatik token yangilash **ishlamaydi** — foydalanuvchi shunchaki
"Xabar yuborilmadi" ko'radi.

> **Talab:** WS ack ham REST konverti shaklida bo'lsin. Bu og'ir bo'lsa — hech bo'lmaganda
> `error.code` to'plami REST bilan **aynan bir xil** ekani hujjatlashtirilsin va
> `TOKEN_EXPIRED` WS'da ham chiqarilsin.

### 17.4 `POST /v1/reports` `messageId` ni tekshirmaydi

Hozir mavjud bo'lmagan yoki begona suhbatdagi `messageId` bilan yuborilgan shikoyat ham
qabul qilinadi.

Oqibati: moderatsiya navbatiga havolasiz yozuvlar tushadi va shikoyat qilingan xabarni
topib bo'lmaydi. Klient shu sababli **faqat serverdan kelgan** (yuborilgan) xabar id'sini
yuborishga majbur — bu vaqtinchalik chora, tekshiruv o'rnini bosmaydi.

> **Talab:** `messageId` mavjudligi va shikoyatchi o'sha suhbat a'zosi ekani tekshirilsin →
> `422 MESSAGE_NOT_FOUND`. Media xabar uchun `attachment` ham moderatsiyaga uzatilsin.

### 17.5 `MessageListDto.hasMore` ishonchsiz

Oxirgi sahifa aynan `size` ta element qaytarsa ham `hasMore = true` bo'ladi. Klient
"yana bor" deb bo'sh so'rov yuboraveradi va "tarixni yuklash" indikatori keraksiz chiqadi.

> **Talab:** `hasMore` aniq hisoblansin — masalan `qaytarilgan eng eski seq > 1`.

### 17.6 `message:delivered` uchun REST zaxirasi yo'q

"Yetkazildi" kursorini surishning **yagona** yo'li — WS. WS uzilgan bo'lsa kursor hech qachon
oldinga surilmaydi va jo'natuvchida abadiy **bitta** belgicha turadi.

> **Talab:** `POST /v1/conversations/{id}/delivered { seq }` qo'shilsin —
> `/read` bilan bir xil shaklda.

### 17.7 Suhbatlar tartibi noto'g'ri (`NULLS FIRST`)

PostgreSQL'da `ORDER BY lastMessageAt DESC` **`NULL` ni birinchi** qo'yadi. Natijada hali
bitta ham xabar yozilmagan bo'sh suhbatlar ro'yxatning **tepasida** turadi.

Klient buni local so'rovda tuzatib o'tiribdi (`ORDER BY lastMessageAt IS NULL, ... DESC`) —
lekin serverdan kelayotgan sahifalash tartibi baribir noto'g'ri, ya'ni ko'p sahifali
ro'yxatda xabarlar aralashib ketadi.

> **Talab:** `ORDER BY lastMessageAt DESC NULLS LAST`.

### 17.8 `read` / `delivered` / `typing` ack qaytarmaydi

Uchalasi ham "eng yaxshi harakat" — klient yuborilgan-yuborilmaganini bilmaydi. O'qildi
kursori yo'lda yo'qolsa, o'qilmaganlar badge'i noto'g'ri qolib ketadi va faqat ilova qayta
ochilganda tuzaladi.

> **Talab (yengil):** hech bo'lmaganda `message:read` ga ack `{ seq }` qo'shilsin —
> klient tasdiqlanmagan kursorni qayta yuboradi.

---

## 18. Yetishmayotgan endpointlar

| Kerak | Holat | Klient hozir nima qilyapti | Oqibati |
|---|---|---|---|
| `DELETE /v1/messages/{id}` | ❌ yo'q | "O'chirish" tugmasi umuman yo'q, faqat "Shikoyat" | Foydalanuvchi noto'g'ri yuborgan narsasini olib tashlay olmaydi. **Media bilan bu ancha jiddiy** — noto'g'ri rasm/video abadiy qoladi |
| `PATCH /v1/messages/{id}` (tahrirlash) | ❌ yo'q | — | Xato yozilgan matnni tuzatib bo'lmaydi |
| Suhbatni arxivlash | ❌ yo'q | **Faqat local bayroq** (`ConversationEntity.archived`) | Qurilma almashsa yoki ilova qayta o'rnatilsa arxiv **yo'qoladi** |
| Suhbatni o'chirish / tarixni tozalash | ❌ yo'q | — | — |
| `GET /v1/conversations/{id}` | ❌ yo'q | Push bosilganda **butun ro'yxat** qayta yuklanadi | Ortiqcha trafik va suhbat ochilishida kechikish |
| `GET /v1/blocks` (bloklanganlar ro'yxati) | ❌ yo'q | Bloklash/yechish bor, ro'yxat yo'q | "Bloklanganlar" ekranini qilib bo'lmaydi — foydalanuvchi kimni bloklaganini ko'rolmaydi |
| `GET /v1/conversations/unread-count` | ❌ yo'q | Tab badge uchun **butun ro'yxat** so'raladi | Har safar 50 ta suhbat yuklanadi |
| Xabarlar ichida qidiruv | ❌ yo'q | — | — |
| Javob berish (reply/quote) | ❌ yo'q | — | Media chatда bu ayniqsa sezilarli |
| Reaksiya (emoji) | ❌ yo'q | — | — |
| Yo'naltirish (forward) | ❌ yo'q | — | Rasmni boshqa suhbatga qayta yuklashga to'g'ri keladi |
| Guruh suhbat | ⚠️ **o'lik enum** | `ConversationTypeDto.GROUP` **bor**, lekin guruh yaratish endpointi yo'q | Enum chalg'itadi: klient GROUP ni qo'llab-quvvatlagandek ko'rinadi, aslida hech qachon kelmaydi |
| Universitetlar katalogi | ❌ yo'q | `universityId` — **erkin satr**, ilova `emis-<id>` yozadi | Format buzilsa talaba filtrga jimgina tushmaydi |

Yuqoridagilardan **media uchun eng muhimi — xabarni o'chirish**. Noto'g'ri yuborilgan matnni
odam kechirishi mumkin, noto'g'ri yuborilgan rasmni esa yo'q.

---

## 19. Spec sifati — codegen'ni buzadigan muammolar

Kotlin klienti `student-club.json` dan **avtomatik generatsiya qilinadi**. Spec'dagi tip
xatolari to'g'ridan-to'g'ri kompilyatsiya xatosiga aylanadi.

### 19.1 `string | null` → `{"type":"object","nullable":true}`

NestJS nullable satrni tipsiz `object` deb yozadi. Generator undan `kotlin.Any?` chiqaradi va
`kotlinx.serialization` uni kompilyatsiya qila olmaydi.

Hozir buni loyihadagi `cleanSwagger` Gradle taski **taxmin bilan** tuzatyapti: tip
`format` → `example` → **maydon nomi** bo'yicha tiklanadi.

> ⚠️ **Bu yangi maydonlar uchun ishlamasligi mumkin.** `waveform` (butun sonlar massivi),
> `blurHash`, `durationMs`, `width`, `height`, `sizeBytes` — agar spec'da tipsiz `object`
> bo'lib chiqsa, **klient umuman kompilyatsiya bo'lmaydi**.

> **Talab:** bu hujjatdagi barcha yangi maydonlar **aniq tiplansin**:
> - `{"type":"string","nullable":true}` — `object` emas
> - `{"type":"integer","format":"int32"}` — butun sonlar uchun (`number` emas!)
> - `{"type":"array","items":{"type":"integer"}}` — `waveform`
> - nullable `$ref` → `{"allOf":[{"$ref":"..."}],"nullable":true}` shaklida o'ralsin
>   (OpenAPI 3.0 da `$ref` yonidagi kalitlar e'tiborsiz qoladi)

### 19.2 `MessageDto.body` — spec haqiqatga zid

Spec'da `{"type":"object","nullable":true}` deb yozilgan, **amalda esa string keladi**.
Klient uni string deb o'qiydi.

> **Talab:** spec haqiqatga moslansin — `{"type":"string","nullable":true}`.
> (Va §0 dagi qoida: `body` string bo'lib **qolsin**.)

### 19.3 Butun sonlar `number` deb yozilgan

NestJS hamma sonni `number` qiladi → generator `Double` chiqaradi. `seq`, `unreadCount`,
`peerReadSeq`, `durationMs`, `sizeBytes`, `width`, `height` kabi maydonlar **`integer`**
bo'lishi shart.

### 19.4 Sahifalash nomuvofiqligi

Ilovada ikki xil qoida bor: chegirmalar feed'i — `page` **0** dan, **tanada**;
connections/chat — `?page=` **1** dan, **query'da**.

> **Talab:** yangi endpointlar (`GET /v1/calls`, `GET /v1/stickers/packs`) **chat uslubida**
> bo'lsin — `?page=` 1 dan, query'da. Yangi nomuvofiqlik qo'shilmasin.

### 19.5 WebSocket protokoli Swagger'da yo'q

`/chat` hodisalarining yagona manbai — `handoff/chat.md`. Yangi `/calls` namespace va
kengaygan `message:send` payload'i **o'sha hujjatga** yozilishi shart, aks holda klient
tomonida taxmin qilishga to'g'ri keladi.

---

## 20. Yangi/o'zgargan endpointlar ro'yxati

**Yangi:**

| Metod | Yo'l | Nima uchun |
|---|---|---|
| `POST` | `/v1/media/chat-upload` | Chat fayllari (rasm/video/ovoz/fayl) |
| `GET` | `/v1/media/{id}/raw` | (agar imzolangan URL o'rniga proksi tanlansa) |
| `GET` | `/v1/stickers/packs` | Stiker paketlari |
| `GET` | `/v1/gifs/search` | GIF qidiruv — Tenor proksisi (kalit serverda qoladi) |
| `POST` | `/v1/gifs/{id}/share` | Tenor `registershare` — atribut majburiyati (§4.6) |
| `GET` | `/v1/calls/ice-servers` | STUN/TURN vaqtinchalik hisobi |
| `GET` | `/v1/calls` | Qo'ng'iroqlar tarixi |
| `POST` | `/v1/calls/{id}/stats` | Sifat telemetriyasi (ixtiyoriy) |

**O'zgaradi:**

| Model | O'zgarish |
|---|---|
| `SendMessageDto` | `+type`, `+mediaId`, `+gif`, `+stickerId`, `+albumId`; `body` endi shartli |
| `MessageDto` | `+attachment`, `+sticker`, `+albumId`, `+call`, `+clientMsgId`; `body` tipi `object` → **`string`** (§19.2) |
| `MessageTypeDto` | `+GIF`, `+VIDEO`, `+STICKER`, `+CALL` |
| `MessageListDto` | `hasMore` aniq hisoblansin (§17.5) |
| `RegisterDeviceDto` | `+tokenType` (`FCM\|APNS\|APNS_VOIP`) |

**C qismdan kelib chiqadigan qo'shimchalar:**

| Metod | Yo'l | Nima uchun |
|---|---|---|
| `POST` | `/v1/conversations/{id}/delivered` | "Yetkazildi" kursorining REST zaxirasi (§17.6) |
| `DELETE` | `/v1/messages/{id}` | Xabarni o'chirish — media uchun **zarur** (§18) |
| `GET` | `/v1/conversations/{id}` | Bitta suhbat (§18) |
| `GET` | `/v1/blocks` | Bloklanganlar ro'yxati (§18) |
| `GET` | `/v1/conversations/unread-count` | Tab badge (§18) |

**Yangi sxemalar:** `MediaKindDto`, `MediaStatusDto`, `ChatUploadResponseDto`,
`AttachmentDto`, `StickerDto`, `StickerPackDto`, `StickerPacksDto`, `GifDto`,
`GifSearchResponseDto`, `GifProviderDto`, `CallDto`, `CallMediaDto`, `CallStatusDto`,
`CallSummaryDto`, `IceServersDto`.

**WebSocket:** `/chat` da `message:send` payload'i kengayadi, `message:new` ga `clientMsgId`
qo'shiladi, yangi `media:ready`. Yangi `/calls` namespace — §12.

---

## 21. Qabul mezonlari (Definition of Done)

### Mavjud muammolar (C qism)

- [ ] Ketma-ket ikkita **bir xil matnli** xabar yuborilganda ikkalasi ham to'g'ri ko'rinadi,
      hech biri "yuborilmoqda"da qolmaydi (`clientMsgId` — §17.1).
- [ ] `transport=websocket` handshake'i **200** qaytaradi, klient polling'ga tushmaydi (§17.2).
- [ ] Muddati o'tgan token bilan WS orqali xabar yuborilsa `TOKEN_EXPIRED` keladi va klient
      tokenni yangilab qayta yuboradi (§17.3).
- [ ] Mavjud bo'lmagan `messageId` bilan shikoyat `422 MESSAGE_NOT_FOUND` beradi (§17.4).
- [ ] Tarixning oxiriga yetilganda `hasMore = false` keladi (§17.5).
- [ ] WS o'chirilgan holatda `POST /v1/conversations/{id}/delivered` kursorni suradi (§17.6).
- [ ] Bo'sh (xabarsiz) suhbat ro'yxatning **oxirida** turadi (§17.7).
- [ ] Spec'da bitta ham `{"type":"object","nullable":true}` maydon qolmagan;
      `./gradlew :dev:api-client-generator:generateAllApi` **xatosiz** o'tadi (§19.1).

### Media

- [ ] 12 MB li JPEG yuklanadi, EXIF (GPS!) tozalanadi, `thumbUrl` va `blurHash` qaytadi.
- [ ] 1 daqiqalik `.mov` yuklanadi, H.264/AAC ga o'giriladi, `thumbUrl` va `durationMs` keladi.
- [ ] 8 MB li `.gif` yuklanadi va **1 MB dan kichik**, ovozsiz MP4 bo'lib qaytadi;
      iOS `AVPlayer` uni ochadi (`yuv420p` + juft o'lchamlar).
- [ ] `GET /v1/gifs/search?q=cat` Tenor'dan natija qaytaradi va javobda **`.mp4`** havolasi
      bo'ladi (`.gif` emas); API kaliti javobda ham, ilovada ham **yo'q**.
- [ ] Begona domendagi `gif.url` bilan xabar yuborish `422 GIF_URL_NOT_ALLOWED` beradi.
- [ ] 30 soniyalik `.m4a` yuklanadi, `waveform` da aynan **48 ta** son bo'ladi.
- [ ] `.apk` yuklashga urinish `422 FILE_TYPE_NOT_ALLOWED` beradi.
- [ ] Bitta `mediaId` bilan ikkinchi marta xabar yuborib bo'lmaydi (`MEDIA_ALREADY_USED`).
- [ ] 5 ta rasm bir xil `albumId` bilan yuboriladi → 5 ta xabar, `seq` lari ketma-ket, **bitta** push.
- [ ] Bog'lanmagan talabaning suhbatiga fayl yuklab bo'lmaydi (`403 NOT_CONNECTED`).
- [ ] Suhbat a'zosi bo'lmagan odam media URL'ini ocha olmaydi (`403`).
- [ ] `type` bersiz `message:send` — avvalgidek matn bo'lib ketadi (**eski klient buzilmaydi**).

### Qo'ng'iroq

- [ ] Ikki qurilma orasida audio qo'ng'iroq ulanadi, ovoz **ikki tomonlama** eshitiladi.
- [ ] Video qo'ng'iroq 720p da ulanadi; tarmoq yomonlashganda o'zi 360p ga tushadi va **uzilmaydi**.
- [ ] Turli operator (Ucell ↔ Beeline) mobil internetlari orasida ulanadi — ya'ni **TURN relay ishlaydi**.
- [ ] Faqat 443-port ochiq tarmoqdan (universitet Wi-Fi) qo'ng'iroq ulanadi (`turns:443`).
- [ ] Wi-Fi dan mobil internetga o'tilganda qo'ng'iroq ICE restart bilan **davom etadi**.
- [ ] **Ilova butunlay yopiq** bo'lganda iOS'da CallKit ekrani, Android'da to'liq ekranli
      bildirishnoma chiqadi va telefon jiringlaydi.
- [ ] Chaquvchi tashlasa — chaqirilganning telefoni **darhol** jiringlashdan to'xtaydi.
- [ ] Ikki qurilmada kirgan foydalanuvchi bittasida javob bersa — ikkinchisi `call:taken` oladi.
- [ ] Band paytda kelgan qo'ng'iroq `BUSY` bilan rad etiladi.
- [ ] 45 soniya javob berilmasa — chatda «Javobsiz qo'ng'iroq» xabari paydo bo'ladi va
      o'qilmaganlar soniga qo'shiladi.
- [ ] Bog'lanmagan/bloklangan talabaga qo'ng'iroq qilib bo'lmaydi.

---

## 22. Bosqichlar (tavsiya etilgan tartib)

| Bosqich | Ish | Nega shu tartibda |
|---|---|---|
| **0** | **`message:new` ga `clientMsgId`** (§17.1) + `NULLS LAST` (§17.7) + `hasMore` (§17.5) + `/delivered` (§17.6) + `reports` tekshiruvi (§17.4) | Kichik tuzatishlar, bir necha soatlik ish. **`clientMsgId` mediadan oldin shart** — busiz media xabar ekranda ikkilanadi |
| **1** | `chat-upload` (IMAGE) + `SendMessageDto.type` + `MessageDto.attachment` | Eng ko'p ishlatiladigan imkoniyat; qolgan hammasining poydevori |
| **2** | Stiker paketlari + `STICKER` turi | Yuklashsiz, eng arzon; kontent **Fluent Emoji (MIT)** dan olinadi (§4.4) |
| **2b** | GIF: `kind: GIF` + `ffmpeg` MP4 konversiyasi + `GET /v1/gifs/search` | Stiker paneli bilan bir xil UI'da turadi — birga qilingani ma'qul |
| **3** | `VOICE` (waveform + duration) va `FILE` | Bir xil quvurdan o'tadi, faqat metama'lumot boshqa |
| **4** | `DELETE /v1/messages/{id}` | Media tarqalgach **kechikmasin** — noto'g'ri rasmni olib tashlash imkoni bo'lsin |
| **5** | `VIDEO` + transkodlash navbati + `media:ready` | Eng og'ir infratuzilma (ffmpeg, worker) |
| **6** | **Nginx WS tuzatiladi + Redis adapter** (§17.2, §15.4) | Qo'ng'iroqdan **oldin** shart — busiz signalizatsiya ishlamaydi |
| **7** | coturn + `GET /v1/calls/ice-servers` | Qo'ng'iroqning poydevori |
| **8** | `/calls` namespace + `Call` jadvali + `CALL` xabari | Signalizatsiya |
| **9** | VoIP/FCM push + `tokenType` | Busiz qo'ng'iroq faqat ilova ochiq turganda ishlaydi |
| **10** | Qolgan yetishmayotgan endpointlar (§18) | Shoshilinch emas, lekin ro'yxat yo'qolmasin |

Klient tomoni har bosqichdan keyin darhol ulanadi — 0, 1 va 2 tugashi bilanoq foydalanuvchi
rasm va stiker yubora boshlaydi, qolganini kutmaydi.

---

## 23. Backend ishlab chiquvchisiga topshiriq (qisqa shakl)

> **Vazifa:** Student Club chatidagi mavjud muammolarni tuzatish, so'ng media xabar va
> 1:1 onlayn qo'ng'iroq qo'shish.
>
> **Avval — mavjud xatolar (kichik, lekin qolganini bloklaydi):**
> `message:new` payload'iga **`clientMsgId`** qo'shilsin (jo'natuvchining o'z ulanishlariga) —
> hozir klient optimistik xabarni **matn bo'yicha** o'chiryapti, shu sababli ketma-ket ikkita
> bir xil xabar yuborilganda bittasi "yuborilmoqda"da muzlab qoladi; media xabarda matn
> `null` bo'lgani uchun bu usul umuman ishlamaydi.
> Suhbatlar tartibi `ORDER BY lastMessageAt DESC **NULLS LAST**` bo'lsin (hozir bo'sh
> suhbatlar tepada). `MessageListDto.hasMore` aniq hisoblansin (hozir oxirgi sahifada ham
> `true`). `POST /v1/conversations/{id}/delivered { seq }` qo'shilsin — hozir "yetkazildi"
> kursorining REST zaxirasi yo'q va WS uzilsa u abadiy qotib qoladi.
> `POST /v1/reports` `messageId` mavjudligini va shikoyatchi a'zoligini tekshirsin.
> WS ack xatolari REST konverti (`BaseResponse`) shaklida qaytsin yoki hech bo'lmaganda
> `TOKEN_EXPIRED` WS'da ham chiqarilsin — hozir WS'da token yangilash ishlamaydi.
> **`nginx` da WebSocket upgrade buzilgan** (`transport=websocket` → 400), klient
> long-polling'da ishlab turibdi — bu tuzatilmasa qo'ng'iroq umuman ishga tushmaydi.
>
> **Spec sifati:** `student-club.json` da bitta ham `{"type":"object","nullable":true}`
> maydon qolmasin — Kotlin klienti spec'dan generatsiya qilinadi va bunday maydondan
> `Any?` chiqib, kompilyatsiya buziladi. Yangi maydonlar aniq tiplansin
> (`string` / `integer` / `array<integer>`), nullable `$ref` esa `allOf` ichiga o'ralsin.
> `MessageDto.body` spec'da `object` deb yozilgan, amalda **string** keladi — spec haqiqatga
> moslansin.
>
> **Media:** `POST /v1/media/chat-upload` (rasm 12 MB / video 64 MB / ovoz 16 MB / fayl 48 MB,
> MIME magic-bytes bo'yicha tekshiriladi, `.apk`/`.exe` rad etiladi). Server EXIF tozalaydi,
> thumbnail va `blurHash` chiqaradi, video uchun `ffprobe`+`ffmpeg` (H.264/AAC, navbatda),
> ovoz uchun 48 nuqtali waveform hisoblaydi va `mediaId` qaytaradi.
> `SendMessageDto` ga `type`, `mediaId`, `stickerId`, `albumId` qo'shiladi; `MessageDto` ga
> `attachment`, `sticker`, `albumId`, `call`, `clientMsgId`.
> **`body` string bo'lib qoladi va `type` berilmasa `TEXT` deb qabul qilinadi** — tarqatilgan
> eski klientlar buzilmasligi shart. Bir nechta rasm = bir nechta xabar + umumiy `albumId`
> (max 10), push esa bitta.
> `GET /v1/stickers/packs` + 2 ta paket × 24 ta WebP stiker seed qilinadi.
> ⚠️ **Stikerlar Telegram'dan olinmasin** — mualliflik huquqi buzilishi va ilovaning
> do'kondan olib tashlanishi xavfi. **Microsoft Fluent Emoji (MIT litsenziya)** dan olinsin
> yoki dizaynerga chizdirilsin (§4.4).
> **GIF:** `kind: GIF` yuklangan fayl `ffmpeg` bilan **ovozsiz, takrorlanuvchi MP4** ga
> o'giriladi (Telegram ham aynan shunday qiladi — GIF formati 20 barobar og'ir);
> `GET /v1/gifs/search` — **Tenor** proksisi, API kaliti serverda qoladi, javobda `.mp4`
> havolasi beriladi, Tenor CDN havolasi o'z serverimizga ko'chirilmaydi va «Powered by Tenor»
> atributi ko'rsatiladi (§4.5–4.7).
> **`DELETE /v1/messages/{id}`** ham qo'shilsin — hozir xabarni o'chirish endpointi umuman
> yo'q, media tarqalgach noto'g'ri yuborilgan rasmni olib tashlash imkoni bo'lishi shart.
>
> **Qo'ng'iroq:** coturn (STUN + TURN, **443/TLS majburiy**, `use-auth-secret`),
> `GET /v1/calls/ice-servers` — HMAC bilan 1 soatlik hisob. Yangi `/calls` Socket.IO
> namespace: `invite / incoming / ringing / accept / accepted / decline / cancel / ice /
> end / ended / media-state / renegotiate / taken`. Server SDP va ICE'ga **tegmaydi**, faqat
> uzatadi. Ko'p qurilmada hammasi jiringlaydi, birinchi javob yutadi; band bo'lsa `BUSY`;
> 45 s javobsiz → `TIMEOUT` va chatga «Javobsiz qo'ng'iroq» xabari (o'qilmagan sifatida).
> `Call` jadvali + `GET /v1/calls`.
> Ilova yopiq bo'lganda jiringlashi uchun: `RegisterDeviceDto.tokenType`
> (`FCM|APNS|APNS_VOIP`), iOS'ga **PushKit VoIP push** (`apns-push-type: voip`,
> `apns-topic: <bundleId>.voip`), Android'ga **`priority: high`, faqat `data`** FCM;
> qo'ng'iroq bekor qilinsa — bekor qilish push'i.
>
> **Oldindan bajarilishi shart:** nginx'da `/socket.io/` uchun WebSocket upgrade to'g'ri
> sozlansin (`proxy_read_timeout 3600s`, `proxy_buffering off`) va API bir nechta nusxada
> ishlasa `@socket.io/redis-adapter` ulansin. Hozir WS ishlamayapti — busiz qo'ng'iroq
> umuman ishga tushmaydi.
>
> **Barcha o'zgarishlar `student-club.json` (OpenAPI v1) ga kiritilsin** — Kotlin klienti
> o'sha yerdan generatsiya qilinadi. WebSocket hodisalari (`/chat` ning kengaygan
> `message:send`/`message:new` payload'i va butun `/calls` namespace) `handoff/chat.md` ga
> yozilsin.
> **Eng muhim qoida:** `MessageDto.body` **string bo'lib qoladi** va `type` berilmasa
> `TEXT` deb qabul qilinadi — tarqatilgan eski ilovalar buzilmasligi shart.
> Tartib — §22 bosqichlari, qabul mezonlari — §21.
