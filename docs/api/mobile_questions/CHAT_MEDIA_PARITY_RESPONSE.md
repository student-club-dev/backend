# Chat media — Telegram darajasiga chiqarish · backend javobi

`CHAT_MEDIA_PARITY_BACKEND.md` bo'yicha **§1–§7 ning hammasi bajarildi**. §8 dagi tartib
saqlangan holda ishlandi, lekin hammasi bitta relizda chiqadi.

> **Spec yangilandi:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`).
> Kotlin klientini shu fayldan qayta generatsiya qiling — yangi `kind` lar, yangi `MessageType`,
> yangi `MediaQualityDto` va 5 ta yangi endpoint o'sha yerda.

> ⚠️ **Bitta narsa sizdan emas, serverdan kerak:** `deploy/nginx/media-upload.conf` serverga
> qo'llanmaguncha §2 (chegarasiz yuklash) **ishlamaydi** — nginx faylni NestJS'ga yetkazmasdan
> `413` beradi. Batafsil: quyida §2.4.

---

## 0. Qisqacha — nima o'zgardi

| № | Talab | Holat |
|---|---|---|
| §1.1 | `kind=FILE` oddiy JPEG ni rad etadi | ✅ tuzatildi — **hech qanday tur rad etilmaydi** |
| §1.2 | Fayl baytma-bayt o'zgarmasin | ✅ `sha256` in = `sha256` out, konstruksiya bo'yicha |
| §1.3 | Tarqatishni qattiqlashtirish | ✅ `octet-stream` + `attachment` + `nosniff` + CSP |
| §2 | Hajm va davomiylik chegaralari | ✅ olib tashlandi (2 ta istisnodan tashqari) |
| §3 | `IMAGE_ORIGINAL` | ✅ yangi `kind` |
| §4.2 | `quality: AUTO/HIGH/ORIGINAL` | ✅ |
| §4.3 | `attachment.variants` | ✅ model va DTO da joy bor, hozircha `null` |
| §5 | `VIDEO_NOTE` (dumaloq video) | ✅ yangi `kind` + yangi `MessageType` |
| §6 | Opus, 100 nuqtali waveform, `transcript` | ✅ |
| §7 | Bo'lakli va tiklanadigan yuklash | ✅ 5 ta endpoint + tozalash cron |

---

## 1. Fayl turlari — oq ro'yxat yo'q

### 1.1 Sizning 422 ingiz

`Screenshot_20260727_102908_Telegram.jpg` endi o'tadi. `kind=FILE` uchun **umuman tur
tekshiruvi yo'q**: oq ro'yxat, `.apk/.exe/.sh/.jar/.ipa` kengaytmalari bo'yicha rad etish,
ELF/MZ sehrli baytlari va «PDF deb atalgan PNG» mosligi — hammasi **olib tashlandi**
(`BLOCKED_EXTENSIONS` va `hasBlockedExtension` kodda ham yo'q).

Bu holat testlar bilan qotirilgan: `.jpg`, `.apk`, ELF binar, kengaytmasiz fayl — hammasi
qabul qilinadi.

### 1.2 Baytma-bayt o'zgarmaslik

Bu **kafolat**, ehtiyotkorlik emas. `kind=FILE` da fayl **umuman o'qilmaydi**: multer uni
diskka yozadi, biz esa uni `rename()` bilan saqlash joyiga **ko'chiramiz**. Baytlar hech
qachon bufferga tushmaydi, demak o'zgarishi ham mumkin emas.

Siz bergan qabul mezoni test sifatida yozilgan (`chat-media.service.spec.ts` →
«stores the uploaded file byte for byte»):

```bash
sha256sum original.bin
# yuklash → GET /v1/media/{id}/raw > downloaded.bin
sha256sum downloaded.bin   # ✅ bir xil
```

Nomni tozalash (`../../etc/passwd` → `passwd`) **qoldi** — siz aytganingizdek, u yo'l
traversali, tur cheklovi emas.

### 1.3 Tarqatish qattiqlashtirildi

Siz ogohlantirgan saqlanadigan XSS va zararli dastur xostingi yopildi. `GET /v1/media/{id}/raw`:

| Sarlavha | `kind=FILE` | Qolgan turlar |
|---|---|---|
| `Content-Type` | **doim** `application/octet-stream` | haqiqiy turi |
| `Content-Disposition` | **doim** `attachment` (nom bo'lmasa ham) | faqat nom bo'lsa |
| `X-Content-Type-Options` | `nosniff` | `nosniff` |
| `Content-Security-Policy` | `default-src 'none'; sandbox` | shu ham |

**Muhim nuance:** faylning haqiqiy turi `AttachmentDto.mimeType` da **qoladi** — ikonka
tanlashingiz uchun. U hech qachon javob sarlavhasiga chiqmaydi. §1.3 jadvalidagi cheklov
sarlavhaga tegishli edi, DTO ga emas.

Alohida domen (`media.studentclub.uz`) — `deploy/nginx/README.md` da tavsiya sifatida
yozildi, kodda emas (bu deploy qarori).

---

## 2. Chegaralar olib tashlandi

`maxBytes` tushunchasi kod darajasida **yo'q qilindi** (`MAX_UPLOAD_BYTES` konstantasi ham).

| `kind` | Hajm | Davomiylik |
|---|---|---|
| `FILE` · `IMAGE` · `IMAGE_ORIGINAL` · `VIDEO` · `VOICE` · `GIF` · `PROFILE_PHOTO` · `STORY_IMAGE` | **chegara yo'q** | **chegara yo'q** |
| `STORY_VIDEO` | **chegara yo'q** | ≤ 60 s → `422 STORY_VIDEO_TOO_LONG` |
| `VIDEO_NOTE` | ≤ 12 MB | ≤ 60 s |

`413 FILE_TOO_LARGE`, `MEDIA_TOO_LONG`, `VIDEO_TOO_LONG`, `VOICE_TOO_LONG` — `VIDEO_NOTE`
dan boshqa hech qayerda qaytmaydi.

> **`VIDEO_NOTE` chegaralari qayerdan?** §2 jadvalida u yo'q edi, lekin §5 uni aniq
> `≤ 60 s`, `≤ 12 MB` deb belgilagan. Formatning **ta'rifi** sifatida qoldirdik — 384×384
> ning bir daqiqasi 12 MB ga hech qachon yaqinlashmaydi. Agar noto'g'ri o'qigan bo'lsak, ayting.

### 2.1 Halol e'tirof: bitta chegara ataylab qoldirildi

`IMAGE` turlari uchun **piksel** chegarasi bor: **8192 → 16384**. Bu hajm chegarasi emas —
dekompressiya bombasidan himoya: 50000×50000 PNG diskda bir necha yuz kilobayt, dekodlanganda
~10 GB va sharp'ni jarayoni bilan o'ldiradi. 16384 — sharp'ning o'z standart chegarasi.
Undan kattasini `FILE` sifatida **o'zgarmagan holda** yuborsa bo'ladi.

### 2.2 Fayl endi RAM ga o'qilmaydi

Siz aytgan (§2.1 · 2) narsa qilindi va bu eng katta ichki o'zgarish edi: butun yuklash quvuri
`Buffer` dan **fayl yo'liga** o'tkazildi. `multer.diskStorage` → vaqtinchalik fayl → sharp/ffmpeg
to'g'ridan-to'g'ri o'sha yo'ldan o'qiydi → `rename()` bilan saqlanadi. 2 GB lik fayl endi 2 GB
RAM emas.

Yon foyda: ffmpeg ilgari bufferni vaqtinchalik faylga qayta yozardi — endi bu qadam yo'q.

### 2.3 O'rniga qolgan himoyalar

- **Kvota: daqiqasiga 60 yuklash, kuniga 20 GB** (siz so'ragan raqamlar).
- **Disk 85% → `503 STORAGE_FULL`.** Bu **guard** sifatida yozilgan, ya'ni multer birorta
  bayt yozishidan **oldin** ishlaydi — aks holda 2 GB lik fayl to'la diskka yozilib, keyin rad
  etilardi.
- Tugallanmagan yuklash sessiyasi **24 soat**, keyin cron tozalaydi.

### 2.4 ⚠️ nginx — busiz §2 ishlamaydi

`deploy/nginx/media-upload.conf` yaratildi:

```nginx
location /v1/media/chat-upload { client_max_body_size 0; proxy_request_buffering off; ... }
location /v1/media/upload/     { client_max_body_size 0; proxy_request_buffering off; ... }
```

```bash
sudo cp deploy/nginx/media-upload.conf /etc/nginx/snippets/media-upload.conf
# API server { } bloki ichiga:  include /etc/nginx/snippets/media-upload.conf;
sudo nginx -t && sudo systemctl reload nginx
```

`proxy_request_buffering off` ham shuning uchun kerak: yoqiq bo'lsa nginx butun tanani
**avval o'z diskiga** yozadi, ya'ni 2 GB ikki marta yoziladi va klient birinchi nusxa
tugaguncha kutadi.

### 2.5 Klient tomoni

`StoryLimits` va video tanlagichdagi 64 MB / 30 s to'siqlarini **endi olib tashlasangiz
bo'ladi** — lekin nginx qo'llanganidan keyin. Story davomiyligi (60 s) klientda qolsin,
siz aytganingizdek.

---

## 3. `IMAGE_ORIGINAL`

Yangi `kind`. Xabar turi baribir `type = IMAGE` — `MessageType.IMAGE` endi **ikkala**
`kind` ni qabul qiladi (`IMAGE` va `IMAGE_ORIGINAL`), shuning uchun klientda hech qanday
tarmoqlanish kerak emas.

Ishlov ikki yo'ldan biri bilan ketadi:

| Holat | Nima bo'ladi |
|---|---|
| **Metama'lumot yo'q** (EXIF/IPTC/XMP yo'q, orientatsiya normal) | Fayl **umuman tegilmaydi** — asl baytlar saqlanadi |
| **Metama'lumot bor** | q95 da qayta kodlanadi: format saqlanadi, o'lcham to'liq, orientatsiya pikselga qo'llanadi |

Birinchi holat — bu skrinshotlar va boshqa ilovadan o'tgan rasmlar, ya'ni **ko'p uchraydigan
holat**. Ya'ni «asl sifat» ko'pincha tom ma'noda asl.

Ikkinchi holatda ozgina yo'qotish bor va bu ataylab: GPS koordinatasini olib tashlash uchun
JPEG ni qayta siqishdan boshqa yo'l yo'q. Siz §3 da aynan shuni so'ragansiz.

- HEIC + EXIF → JPEG q95 (sharp HEIC **yoza olmaydi**, faqat o'qiydi). HEIC + EXIF yo'q →
  HEIC holicha o'tadi.
- Thumb va blurHash **ikkala holatda ham** chiqadi.
- 1920px ga kichraytirish va WebP ga o'tkazish **yo'q**.

---

## 4. Video

### 4.1 O'zgarmadi

Siz tekshirib, muammo §1.1 da ekanini aniqlaganingiz uchun bu bo'limga tegilmadi.

### 4.2 `quality`

Yuklashda ixtiyoriy `quality`: `AUTO` (sukut) · `HIGH` · `ORIGINAL`.

| Qiymat | Xulq |
|---|---|
| `ORIGINAL` | **Transkod umuman yo'q.** Fayl qanday kelgan bo'lsa shunday. Faqat `ffprobe` + poster kadr. Doim `READY` |
| `HIGH` | Transkod kerak bo'lsa 1080p / crf 21 / `high` profil / 128k audio |
| `AUTO` | Ilgarigidek: 720p / crf 24 / `baseline` / 96k |

`AUTO` va `HIGH` da transkod **qilish qarori** o'zgarmadi: H.264/AAC bo'lsa `READY`, aks
holda navbat. Tanlov `MediaAsset.quality` ustunida saqlanadi, shuning uchun transkoder
navbatdan olganda qaysi ladder ekanini biladi. `quality` yubormasangiz `AUTO` — eski
klientlar uchun hech narsa o'zgarmaydi.

### 4.3 `variants`

`AttachmentDto.variants: [{ height, bitrate, url }] | null` qo'shildi va DB da `variants Json?`
ustuni bor. **Hozircha doim `null`** — siz so'raganingizdek «modelda joy qoldirildi». Ikkinchi
bosqichda uni to'ldirish migratsiya ham, klient relizi ham talab qilmaydi.

---

## 5. `VIDEO_NOTE` — dumaloq video xabar

Yangi `MediaKind.VIDEO_NOTE` **va** yangi `MessageType.VIDEO_NOTE`.

| Nima | Qiymat |
|---|---|
| Hajm / davomiylik | ≤ 12 MB · ≤ 60 s |
| Format | mp4 / quicktime |
| Kvadratlik | **server tekshiradi** → `422 MEDIA_NOT_SQUARE` |
| `body` | taqiqlangan — `422` («Bu turdagi xabarga izoh qo'shib bo'lmaydi») |
| Poster | **birinchi kadr** (0-soniya), oddiy videodagi 1-soniyadan farqli |
| Quvur | `VIDEO` bilan bir xil |

Poster uchun 0-soniya tanlangani ataylab: dumaloq xabar — bu odamning yuzi, va u birinchi
kadrdayoq bor.

Push matni ham qo'shildi: «⚪️ Video xabar».

---

## 6. Ovozli xabar

| Nima | Holat |
|---|---|
| OGG/Opus | ✅ `audio/opus`, `audio/ogg`, `audio/webm` qabul qilinadi |
| m4a/AAC | ✅ **qoldi** — siz aytgan sabab bilan (iOS tizim yozgichi Opus'ni umuman yoza olmaydi) |
| Waveform | ✅ 48 → **100 nuqta** |
| Davomiylik | ✅ chegara yo'q |
| `transcript` | ✅ `AttachmentDto.transcript: string?` — hozircha doim `null`, model tayyor |

> **Waveform haqida bitta amaliy narsa:** eski xabarlarda **48 nuqta qoladi** — ularni qayta
> hisoblamaymiz. Klient kelgan massiv uzunligini o'zi olib chizsin, 100 deb qat'iy
> hisoblamasin. DTO tavsifida ham shu yozilgan.

---

## 7. Bo'lakli va tiklanadigan yuklash

Siz so'ragan 5 ta endpoint, aynan o'sha shaklda:

```
POST   /v1/media/upload/init      { kind, conversationId?, quality?, fileName?, totalBytes }
                                  → { uploadId, received: [], chunkSize, totalBytes, expiresAt }

PUT    /v1/media/upload/{uploadId}/part/{index}     (xom binar tana)
                                  → { uploadId, received: [0,1,2,…], chunkSize, totalBytes, expiresAt }

POST   /v1/media/upload/{uploadId}/complete
                                  → AttachmentDto   (chat-upload bilan bir xil)

GET    /v1/media/upload/{uploadId}
                                  → { received: [...], ... }   // tiklash uchun

DELETE /v1/media/upload/{uploadId}
```

`chunkSize` = **5 MB** (S3 multipart'ning minimal bo'lagi — keyinchalik obyekt xotiraga
o'tsak klient o'zgarmaydi).

### Sizning talablaringiz

| Talab | Holat |
|---|---|
| Istalgan tartibda va parallel | ✅ test bilan qotirilgan |
| Qayta yuborilsa idempotent | ✅ o'sha indeks ustiga yoziladi, xato emas |
| `uploadId` ≥ 24 soat | ✅ 24 soat (`CHAT_UPLOAD_SESSION_TTL_HOURS`) |
| `complete` gacha `mediaId` yo'q | ✅ |
| Tugallanmagani kvotaga kirmaydi | ✅ kvota `complete` da hisoblanadi |
| 24 soatdan keyin tozalanadi | ✅ soatlik cron |
| Eski `chat-upload` saqlanadi | ✅ tegilmadi |

### Bitta dizayn qarori — aytib qo'yishim kerak

**Qaysi bo'laklar kelgani DB da emas, diskda saqlanadi.** Bo'lak — bu
`{CHAT_MEDIA_DIR}/incoming/{uploadId}/{index}` faylining o'zi, `GET` esa shunchaki `readdir`.

Sababi — parallellik. `received Int[]` ustuni bo'lganda ikki bir vaqtda kelgan `PUT`
bir-birining yozuvini yo'qotardi (read-modify-write), va buni to'g'rilash uchun har bir yozuv
xom SQL `array_append` dan o'tishi kerak edi. Fayl nomi esa **hech qanday qulfsiz** atomik:

- *tartibsiz* — bo'lak indeks bilan nomlanadi, tartib hech qachon muhim emas edi;
- *parallel* — ikki `PUT` ikki xil faylga yozadi, urishadigan narsa yo'q;
- *takroriy* — vaqtinchalik nomga yozilib `rename` qilinadi, ya'ni yarim yozilgan bo'lak
  hech qachon o'qilmaydi.

### Suiiste'moldan himoya — klientga ta'sir qiladigan ikkita chegara

Xavfsizlik ko'rigida ikkita teshik topildi va yopildi. Ikkalasi ham normal klientga tegmaydi,
lekin bilib qo'ying:

| Chegara | Qiymat | Nega |
|---|---|---|
| Bitta bo'lak hajmi | ≤ `chunkSize` (5 MB) → `413` | Aks holda `totalBytes: 1024` deb sessiya ochib, 0-bo'lakka 10 GB yozish mumkin edi. Endi oqim **yozilayotgan paytda** to'xtatiladi, `complete` da emas |
| Bir vaqtda ochiq sessiyalar | 20 ta → `429` | Kvota faqat `complete` da hisoblanadi, ya'ni sessiya ochish — diskka bayt qo'yishning yagona «tekin» yo'li edi |

Oxirgi bo'lak `chunkSize` dan **qisqa** bo'lishi mumkin (tabiiy), lekin uzun bo'lolmaydi.

### `complete` nima qiladi

Bo'laklarni **oqim bilan** birlashtiradi (xotiraga o'qimaydi) va natijani **aynan
`chat-upload` quvuriga** beradi — bir xil ruxsat tekshiruvi, bir xil tur aniqlash, bir xil
EXIF tozalash, bir xil transkod, bir xil kvota. Ikkita alohida yo'l bo'lsa, vaqt o'tib ular
farq qilardi va e'tiborsizrog'i yumshoqroq bo'lardi.

`complete` muvaffaqiyatsiz bo'lsa (masalan video buzuq chiqsa) **sessiya va bo'laklar
o'chirilmaydi** — foydalanuvchi butun faylni qaytadan yubormasligi uchun.

### Qachon qaysi yo'l

Siz taklif qilgan chegara — ~10 MB. Buni **server majburlamaydi**: kichik fayl uchun bitta
so'rov baribir tezroq, kattasi uchun bo'lakli. Qaysi birini tanlashni klient hal qiladi.

---

## 8. Migratsiya va yangi xato kodlari

Migratsiya: `prisma/migrations/20260802082659_chat_media_parity/`. **To'liq qo'shimcha** —
hech narsa o'chirilmaydi, hech qanday ustun qayta yozilmaydi, mavjud satrlarga tegilmaydi:

- `MediaKind` += `IMAGE_ORIGINAL`, `VIDEO_NOTE`
- `MessageType` += `VIDEO_NOTE`
- yangi `MediaQuality` enum
- `media_assets` += `quality`, `transcript`, `variants`
- yangi `upload_sessions` jadvali (ikkala FK ham indeksli)

**Yangi xato kodlari:**

| Kod | HTTP | Qachon |
|---|---|---|
| `STORY_VIDEO_TOO_LONG` | 422 | Story videosi 60 s dan uzun |
| `MEDIA_NOT_SQUARE` | 422 | `VIDEO_NOTE` kvadrat emas |
| `STORAGE_FULL` | 503 | Disk 85% dan to'lgan |
| `UPLOAD_SESSION_NOT_FOUND` | 404 | Sessiya yo'q / sizniki emas / muddati o'tgan |
| `UPLOAD_INCOMPLETE` | 422 | `complete` da bo'lak yetishmayapti |
| `UPLOAD_SIZE_MISMATCH` | 422 | Yig'ilgan hajm `totalBytes` ga teng emas |

`FILE_TOO_LARGE` (413) endi ikki joyda: `VIDEO_NOTE` 12 MB dan oshsa va bo'lak `chunkSize`
dan oshsa. `UPLOAD_RATE_LIMIT` (429) ham ikki joyda: kunlik kvota va 20 ta ochiq sessiya.

---

## 9. Tekshirish

| Nima | Natija |
|---|---|
| `npx tsc --noEmit` (ikkala config) | ✅ toza |
| `npm run lint` | ✅ toza |
| Unit testlar | ✅ **hammasi o'tdi** (media modulida 95 ta, shundan 23 tasi yangi bo'lakli yuklash uchun) |
| `security-review` ko'rigi | ✅ 3 ta topilma tuzatildi (quyida) |
| `npm run openapi:dump` | ✅ `student.json` + `student-api.json` yangilandi |
| OpenAPI codegen sifati testi | ✅ yangi DTO lar o'tdi |

### Xavfsizlik ko'rigida topilgan va tuzatilgan narsalar

Oq ro'yxatni olib tashlash va chegarani yechish — bu himoyani olib tashlash, shuning uchun
diff alohida ko'rikdan o'tkazildi. Uchta narsa chiqdi:

1. **Bo'lak hajmi cheklanmagan edi** (yuqori) — `PUT part` istalgan hajmdagi tanani qabul
   qilardi. Endi oqim `chunkSize` da to'xtatiladi va yarim yozilgan fayl o'chiriladi.
2. **Ochiq sessiyalar soni cheklanmagan edi** (o'rta) — 20 ta cheklov qo'yildi.
3. **Vaqtinchalik fayl oqib ketardi** (o'rta) — `kind` yoki `conversationId` noto'g'ri bo'lsa
   multer yozgan fayl diskda qolardi. Endi xato yo'lida ham o'chiriladi, va crash holati uchun
   cron eski scratch fayllarni tozalaydi.

Tekshirilgan va **muammo emas** deb topilgani: `IMAGE_ORIGINAL` da asl baytlar `image/jpeg`
sifatida `inline` beriladi — JPEG/HTML polyglot bo'lsa ham `X-Content-Type-Options: nosniff`
va `CSP: default-src 'none'; sandbox` uni brauzerda bajarilishidan to'sadi. SVG esa `IMAGE`
oq ro'yxatida yo'q, `FILE` sifatida esa `octet-stream` + `attachment` bilan ketadi.

> **Bitta pre-existing muammo:** `openapi-document.spec.ts` lokal mashinada `.env` da
> `TURN_HOST` / `TURN_STATIC_SECRET` yo'qligi uchun tushadi. Bu **calls** moduli bilan kelgan
> va mening o'zgarishlarimga aloqasi yo'q — o'sha ikki o'zgaruvchi berilganda test o'tadi
> (tekshirdim). `.env` ga qo'shib qo'ying.

---

## 10. Klient uchun ish ro'yxati

1. **Spec'dan qayta generatsiya qiling** — `docs/handoff/mobile/student-api.json`.
2. `kind = FILE` — endi hamma narsa o'tadi, klientdagi tur filtri olib tashlansin.
3. `IMAGE_ORIGINAL` — «asl sifatda yuborish» tugmasi. Xabar turi baribir `IMAGE`.
4. `VIDEO_NOTE` — yangi xabar turi, klientda render kerak (dumaloq + poster).
5. `quality` — video yuklashda ixtiyoriy; yubormasangiz `AUTO`.
6. Waveform — massiv uzunligini o'zidan oling, 100 deb qat'iy hisoblamang.
7. `transcript` va `variants` — hozircha `null`, lekin DTO da bor (nullable sifatida qarang).
8. Bo'lakli yuklash — ~10 MB dan kattasi uchun. Bu siz kutgan siqish↔yuklash ustma-ustligini
   ochadi.
9. `STORAGE_FULL` (503) va `STORY_VIDEO_TOO_LONG` (422) — yangi holatlarni ishlang.
10. **Chegara tekshiruvlarini nginx qo'llangandan keyin oling** — aks holda `413` olasiz.

---

## 11. Ochiq qolgan / kelishilishi kerak

1. **`VIDEO_NOTE` chegaralari** (12 MB / 60 s) — §5 dan olindi, §2 «chegara yo'q» bilan
   ziddek ko'rinishi mumkin. Formatning ta'rifi deb qoldirdik; boshqacha xohlasangiz ayting.
2. **Rasm uchun 16384px** — §2 da yo'q, biz himoya sifatida qoldirdik (§2.1).
3. **`media.studentclub.uz`** — hujjatga yozildi, amalga oshirilmadi (deploy qarori).
4. **§4.3 `variants` va §6 `transcript`** — modelda bor, mantiq yo'q (siz «ikkinchi bosqich»
   degansiz).
5. **`PROFILE_PHOTO`** — §2 jadvalida yo'q edi; izchillik uchun undan ham hajm chegarasi
   olindi (u baribir 1920px ga siqiladi, ya'ni saqlanadigan natija kichik).
