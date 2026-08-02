# Chat media — Telegram darajasiga chiqarish · Backend spetsifikatsiyasi

Chat medialari bugun ishlaydi, lekin **Telegramdan sezilarli farq qiladi**: fayl turlari
oq ro'yxat bilan cheklangan, chegaralar past, rasm majburan siqiladi, dumaloq video umuman
yo'q, ovozli xabar yarim, yuborish esa uzoq ketadi.

Bu hujjat backendda nima o'zgarishi kerakligini tavsiflaydi. Klient tomonidagi sekinlik
alohida tahlil qilingan — `VIDEO_SEND_PERFORMANCE.md`; bu yerda faqat **backendga bog'liq**
qismi bor (§7).

Yakuniy API kontrakti — `dev/api-client-generator/student-club.json` (OpenAPI v1), **yagona
manba**. WS hodisalari `handoff/03-WEBSOCKET.md` uslubida yoziladi.

---

## 0. Hozirgi holat

`handoff/02-API-CHANGES.md` §4c bo'yicha bugun ishlab turgani:

| `kind` | Limit | Server nima qiladi |
|---|---|---|
| `IMAGE` | 12 MB, ≤ 8192px | EXIF tozalanadi, **1920px ga majburan siqiladi**, WebP, 320px thumb, blurHash |
| `GIF` | 20 MB, ≤ 30s | Ovozsiz takrorlanuvchi MP4 |
| `VIDEO` | 64 MB, ≤ 3 daq | H.264/AAC bo'lsa `READY`, aks holda `PROCESSING` + navbat |
| `VOICE` | 16 MB, ≤ 5 daq | Davomiylik + 48 nuqtali waveform |
| `FILE` | 48 MB | **Oq ro'yxat** — `.apk/.exe/.sh/.jar/.ipa` va ELF/MZ baytlari rad etiladi |

Kvota: daqiqasiga 20 yuklash, kuniga 500 MB.

**Foydalanuvchi ko'rayotgan muammolar:**

1. «Bu turdagi fayllarni yuborib bo'lmaydi» — **oddiy JPEG ham** rad etiladi (§1.1)
2. Rasm sifati tushadi — 1920px WebP majburiy, asl nusxa yuborib bo'lmaydi
3. Dumaloq video xabar yo'q
4. Ovozli xabar Telegramdagidek emas
5. Katta fayl yuborish uzoq ketadi va uzilsa noldan boshlanadi

---

## 1. Fayl turlari — oq ro'yxat olib tashlanadi

**Talab:** har qanday turdagi fayl yuborilsin, Telegramdagidek.

### 1.1 Aniq takrorlanish — bu bugun ishlamayapti

Qurilmada olingan haqiqiy javob (2026-08-01 15:35, Chucker):

```jsonc
// POST /v1/media/chat-upload   kind=FILE
// fayl: Screenshot_20260727_102908_Telegram.jpg  ·  851 678 bayt  ·  oddiy JPEG
{
  "success": false,
  "status": 422,
  "code": "FILE_TYPE_NOT_ALLOWED",
  "message": "Bu turdagi fayllarni yuborib bo'lmaydi"
}
```

Ya'ni `kind = FILE` oq ro'yxatiga **rasm turlari umuman kirmaydi**. Bu shunchaki qattiq
cheklov emas, balki Telegramning eng ko'p ishlatiladigan imkoniyatini butunlay yopadi:
**rasmni siqmasdan, hujjat sifatida yuborish**. Foydalanuvchi «Fayl» orqali skrinshot
yubormoqchi bo'ladi va «Bu turdagi fayllarni yuborib bo'lmaydi» degan xabar oladi.

`kind = FILE` **hech qanday turni** rad etmasligi kerak — jumladan `.jpg`, `.png`, `.mp4`,
`.pdf` va qolgan hammasi. Rasm `IMAGE` sifatida ham, `FILE` sifatida ham yuborilishi mumkin
bo'lsin: birinchisi siqiladi, ikkinchisi asl holida qoladi.

### 1.2 Asosiy shart — `kind = FILE` **baytma-bayt o'zgarmaydi**

Bu bo'limning yagona qoidasi: **fayl qanday yuborilgan bo'lsa, shundayligicha saqlansin va
shundayligicha qaytarilsin.**

`kind = FILE` uchun quyidagilar **olib tashlanadi**:

| Nima | Hozir | Bo'lsin |
|---|---|---|
| Kengaytma bo'yicha rad etish (`.apk`, `.exe`, `.sh`, `.jar`, `.ipa`, …) | rad etadi | **yo'q** |
| ELF / MZ sehrli baytlari bo'yicha rad etish | rad etadi | **yo'q** |
| Kengaytma ↔ tur mosligi («PDF deb atalgan PNG») | rad etadi | **yo'q** |
| Qayta kodlash / siqish / format o'zgartirish | — | **yo'q** |
| Metama'lumotni (EXIF va boshqalar) tozalash | — | **yo'q** |

Saqlanadi: hajm chegarasi, kvota va `conversationId` bo'yicha ruxsat tekshiruvi. Bular
faylning **mazmuniga tegmaydi**.

**Qabul mezoni** (backend jamoasi shu bilan tekshirsin):

```bash
sha256sum original.bin
# yuklash → GET /v1/media/{id}/raw > downloaded.bin
sha256sum downloaded.bin
# ikkala hash BIR XIL bo'lishi shart
```

Bu har qanday tur uchun ishlashi kerak: `.jpg`, `.apk`, `.zip`, `.psd`, `.sqlite`, kengaytmasiz
fayl — farqi yo'q.

> ⚠️ §1.3 dagi qattiqlashtirish bunga **zid emas**: u faqat javob **sarlavhalarini**
> o'zgartiradi (`Content-Type`, `Content-Disposition`), faylning baytlariga tegmaydi.
> Sarlavha o'zgarishi hash'ga ta'sir qilmaydi.

> 📌 Bir narsani bilib qo'ying: rasm `FILE` sifatida o'zgarmasdan ketsa, uning **EXIF'i ham
> ketadi** — jumladan suratga olingan joyning GPS koordinatalari. Telegram ham hujjat
> sifatida yuborilganda aynan shunday qiladi (u EXIF'ni faqat siqilgan rasmda tozalaydi),
> ya'ni bu Telegramga mos xulq. Lekin foydalanuvchi buni bilmasligi mumkin — ilovada
> «asl holida yuboriladi» degan eslatma ko'rsatishimiz to'g'ri bo'lardi.

### 1.3 ⚠️ Buni tarqatish tomonini qattiqlashtirmasdan qilish mumkin emas

Bu haqda ochiq aytishim kerak: oq ro'yxat o'zi shunchaki to'siq emas, u **serverni himoya
qilib turibdi**. Uni olib tashlab, boshqa hech narsani o'zgartirmasangiz, ikkita real muammo
paydo bo'ladi:

- **Saqlanadigan XSS.** Kimdir `.html` yoki `.svg` yuklasa va `GET /v1/media/{id}/raw` uni
  `text/html` bilan bersa, u sizning domeningizda ishlaydigan skriptga aylanadi — ya'ni
  boshqa foydalanuvchining sessiyasini o'g'irlashi mumkin.
- **Zararli dastur xostingi.** `api.studentclub.uz` havolasi orqali `.apk` tarqatiladi va
  domen obro'si sizniki.

Shuning uchun oq ro'yxat **quyidagilar bilan almashtiriladi** (Telegram ham aynan shunday
qiladi — u ham hamma turni qabul qiladi, lekin hech qachon brauzerda ochib bermaydi):

| Nima | Qanday |
|---|---|
| `Content-Type` | `kind = FILE` uchun **doim** `application/octet-stream`. Faylning haqiqiy turi hech qachon javob sarlavhasiga chiqmaydi |
| `Content-Disposition` | **doim** `attachment; filename="…"` — hech qachon `inline` |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | `default-src 'none'; sandbox` |
| Origin | Ideal holda media alohida domendan berilsin (`media.studentclub.uz`) — o'shanda XSS bo'lsa ham asosiy domen cookie'lariga yeta olmaydi |

`IMAGE`/`GIF`/`VIDEO`/`VOICE` uchun bu qoida **qo'llanmaydi** — ular baribir dekodlanadi va
haqiqiy turi tekshiriladi, ya'ni ularda `inline` xavfsiz.

Asl nom tozalash (`../../etc/passwd` → `passwd`) **saqlanadi** — bu yo'l traversali, tur
cheklovi emas.

> 📌 Bitta huquqiy eslatma: Google Play siyosati boshqa ilovalarni tarqatadigan ilovalarga
> alohida talab qo'yadi. `.apk` almashish odatiy chat ichida qolsa muammo emas, lekin buni
> bilib turganingiz ma'qul.

---

## 2. Chegaralar — **olib tashlanadi**

**Talab:** `POST /v1/media/chat-upload` da hajm (MB) va davomiylik (daqiqa) chegarasi
**bo'lmasin** — hech bir `kind` uchun. Bu **story yuklashga ham** tegishli
(`STORY_IMAGE`, `STORY_VIDEO`): bugun ular 12 MB / 48 MB · 30 s bilan cheklangan,
bundan keyin hajm bo'yicha cheklanmasin.

**Yagona istisno — story davomiyligi: `STORY_VIDEO` ≤ 1 daqiqa.** Bu texnik emas,
**mahsulot** qarori: lavha qisqa formatda qoladi (Telegramda 60 s, Instagram'da 60 s).
Hajmi esa cheklanmaydi — 1 daqiqalik 4K video ham qabul qilinsin.

| `kind` | Hozir | Bo'lsin |
|---|---|---|
| `FILE` | 48 MB | **chegara yo'q** |
| `VIDEO` | 64 MB · 3 daq | **chegara yo'q** |
| `IMAGE` | 12 MB | **chegara yo'q** |
| `VOICE` | 16 MB · 5 daq | **chegara yo'q** |
| `GIF` | 20 MB · 30 s | **chegara yo'q** |
| `STORY_IMAGE` | 12 MB | **chegara yo'q** |
| `STORY_VIDEO` | 48 MB · 30 s | **hajm: chegara yo'q · davomiylik: ≤ 60 s** |

Ya'ni `413 PAYLOAD_TOO_LARGE`, `MEDIA_TOO_LARGE`, `VIDEO_TOO_LONG`, `VOICE_TOO_LONG` va
shu turdagi javoblar **umuman qaytmaydi** — bitta holatdan tashqari: `STORY_VIDEO`
60 soniyadan uzun bo'lsa `422 STORY_VIDEO_TOO_LONG` (xabarda ruxsat etilgan davomiylik
ko'rsatilsin, klient uni foydalanuvchiga aynan shunday chiqaradi).

### 2.1 Buni ishlaydigan qilish uchun nima kerak

Chegarani sonini o'zgartirish bilan emas, **oqim bilan** olib tashlanadi — aks holda
birinchi 1 GB lik fayl serverni yiqitadi:

1. **nginx** — `client_max_body_size 0;` (`/v1/media/chat-upload` uchun) va
   `proxy_request_buffering off;`. Hozirgi `client_max_body_size 64m` fayl NestJS'ga
   yetib bormasdan `413` beradi, ya'ni kodda nima yozilganining farqi yo'q.
2. **NestJS** — fayl **xotiraga o'qilmasin**: multipart oqimi to'g'ridan-to'g'ri
   bucket'ga (`S3 multipart upload` / diskka stream). `memoryStorage` bilan 1 GB lik
   fayl 1 GB RAM degani.
3. **Transkod navbati** — uzun video sinxron ishlanmasin: yuklash `PROCESSING` qaytarsin,
   `media:ready` WS hodisasi tayyor bo'lganda kelsin (bu mexanizm allaqachon bor).
4. **§7 dagi bo'lakli yuklash** — cheklov olib tashlangach u **majburiy** bo'ladi: bir
   martalik so'rov bilan yuborilgan 2 GB lik fayl uzilsa noldan boshlanadi va mobil
   internetda hech qachon yetib bormaydi.

⚠️ **Halol ogohlantirish:** "chegara yo'q" degani texnik jihatdan ham cheksiz degani emas —
bucket hajmi, disk va tarmoq baribir chegara. Shuning uchun mahsulot darajasidagi chegara
olib tashlansin, lekin infratuzilma darajasida **himoya qolsin**:

- kvota: **daqiqasiga 60 yuklash, kuniga 20 GB** (bitta hisob uchun) — bu oddiy
  foydalanuvchiga hech qachon tegmaydi, lekin skript bilan bucket to'ldirishni to'xtatadi;
- bitta ochiq yuklash sessiyasi **24 soat** yashasin, tugallanmagani tozalansin;
- disk 85% ga to'lganda `503` bilan rad etilsin (jimgina yiqilgandan ko'ra tushunarli).

Bu himoyalar foydalanuvchiga **chegara bo'lib ko'rinmaydi**: ular hajmga emas, tezlikka va
serverning holatiga qarab ishlaydi.

### 2.2 Klient tomoni

Klientdagi tekshiruvlar (`StoryLimits`, video tanlagichdagi 64 MB / 30 s to'siqlari)
backend chegarani olib tashlaganidan **keyin** yechiladi — hozir yechilsa ilova serverdan
`413` oladi va foydalanuvchi sababini bilmaydi. Ya'ni bu bandning klient qismi shu
endpoint yangilanishiga bog'liq.

Story davomiyligi esa **klientda ham qoladi**: 60 soniyadan uzun video tanlansa u
yuklashdan oldin rad etilsin (yoki kesish taklif qilinsin) — bir daqiqalik chegarani
foydalanuvchi yuklash tugagach emas, tanlagan zahoti bilishi kerak.

---

## 3. Rasm sifati

Hozir har bir rasm 1920px WebP ga siqiladi — asl nusxani yuborishning iloji yo'q.

Telegramdagidek ikkita yo'l kerak:

| Rejim | `kind` | Server nima qiladi |
|---|---|---|
| Odatiy | `IMAGE` | Hozirgidek: EXIF tozalanadi, 1920px, WebP, thumb, blurHash |
| **Asl sifat** | `IMAGE_ORIGINAL` (yangi) | **Faqat EXIF tozalanadi** (GPS!). Piksellarga tegilmaydi, format saqlanadi. Thumb va blurHash baribir generatsiya qilinadi |

`IMAGE_ORIGINAL` xabarda ham `type = IMAGE` bo'lib qoladi — klient uchun farq faqat sifatda.

Bu `kind = FILE` (§1.2) bilan **almashtirilmaydi**, ikkalasi ham kerak va Telegramda ham
ikkalasi bor:

| | Chatda qanday ko'rinadi | Baytlar |
|---|---|---|
| `IMAGE_ORIGINAL` | **Rasm** bo'lib — mozaikada, bosilsa ko'rgichda ochiladi | EXIF tozalanadi, qolgani asl |
| `FILE` | **Hujjat** qatori bo'lib — nomi va hajmi bilan | To'liq o'zgarmaydi |

Orientatsiya EXIF'dan pikselga qo'llanishi **ikkalasida ham** shart: aks holda asl sifatda
yuborilgan rasm yonboshlab ko'rinadi.

---

## 4. Video

### 4.1 Video — ishlayapti, o'zgarish shart emas

Qurilmada tekshirildi (2026-08-01): 720×406, 2.6 MB, 9.2 s lavha `status: "READY"` bilan
qabul qilindi va xabar `seq = 57` bo'lib ketdi. Klient siqishi H.264 chiqargani uchun
transkod navbatiga umuman tushmaydi.

Ilgari bu bo'limda «`PROCESSING` xabarni bloklayapti» degan taxmin bor edi — **u noto'g'ri
bo'lib chiqdi**, chatdagi «yuborilmadi» aslida faylga tegishli edi (§1.1).

### 4.2 Sifat darajalari

Yuklashda ixtiyoriy `quality` maydoni: `AUTO` (sukut) · `HIGH` · `ORIGINAL`.

- `ORIGINAL` — transkod umuman qilinmaydi, fayl qanday kelgan bo'lsa shunday saqlanadi
  (faqat `ffprobe` metadata va poster kadr olinadi)
- Qolganlarida hozirgidek: H.264/AAC bo'lsa `READY`, aks holda navbat

### 4.3 Bir nechta sifat oqimi

Telegram bitta videoni bir necha sifatda saqlaydi va qabul qiluvchi tarmog'iga qarab
tanlaydi. Bu **ikkinchi bosqich** uchun, lekin modelda joy qoldirilsin:
`attachment.variants: [{ height, bitrate, url }]`.

---

## 5. Dumaloq video xabar (video note)

Telegramning «kружoк» i. Butunlay yangi tur.

| Nima | Qiymat |
|---|---|
| `kind` | `VIDEO_NOTE` |
| Xabar `type` | `VIDEO_NOTE` |
| O'lcham | Kvadrat, 384×384 (klient shunday yozadi va yuboradi) |
| Davomiylik | ≤ 60 s |
| Hajm | ≤ 12 MB |
| Kodek | H.264/AAC, doim `READY` bo'lishi kutiladi |
| `body` | **Taqiqlangan** — izoh yo'q (GIF/VOICE/STICKER kabi) |
| Poster | Birinchi kadr, kvadrat |

Server tomonda maxsus ishlov shart emas — `VIDEO` bilan bir xil quvur, faqat alohida `kind`,
o'z chegaralari va `body` taqiqi. Kvadratligini server **tekshirsin** (nisbat 1:1 emas →
`422 MEDIA_NOT_SQUARE`), aks holda klient xatosi qabul qiluvchida buzuq dumaloq bo'lib
ko'rinadi.

---

## 6. Ovozli xabar

Bugun bor: davomiylik + 48 nuqtali waveform. Yetishmayotgani:

| Nima | Talab |
|---|---|
| Format | **OGG/Opus** ham qabul qilinsin (m4a/AAC qolsin). Opus ~2 barobar yengil va Telegram shuni ishlatadi |
| Waveform | 48 → **100 nuqta**. Uzun xabarda 48 nuqta juda dag'al ko'rinadi |
| Davomiylik | 5 daq → 2 soat (§2) |
| Transkript | **Ixtiyoriy, ikkinchi bosqich.** `attachment.transcript: string?` maydoni modelga hozirdan qo'shilsin |

> ⚠️ Opus **bepul emas**, shuning uchun eski format ham qolishi kerak. Bizning yozgichimiz
> hozir MPEG-4/AAC (`.m4a`) yozadi va bu ataylab tanlangan — u ikkala platformada ham tizim
> API'si bilan ishlaydi. Android'da Opus'ga o'tish API 29+ talab qiladi, iOS'da esa tizim
> yozgichi Opus'ni umuman qo'llamaydi (qo'shimcha kutubxona kerak). Ya'ni server **ikkalasini
> ham** qabul qilishi shart, aks holda eski qurilmalarda ovoz umuman yuborilmay qoladi.

---

## 7. Tezlik — bo'lakli va tiklanadigan yuklash

Bu bo'lim eng ko'p ta'sir beradigani.

### Muammo

Hozir yuklash — **bitta uzluksiz `POST multipart`**. Buning uchta oqibati bor:

1. **Tiklab bo'lmaydi.** 500 MB dan 490 MB ketgach tarmoq uzilsa, hammasi noldan boshlanadi.
2. **Siqish bilan yuklashni ustma-ust qo'yib bo'lmaydi.** Klient avval butun faylni siqib
   tugatishi, keyingina yuborishni boshlashi kerak — ikkisi ketma-ket. Telegram ularni
   ustma-ust bajaradi va aynan shuning uchun «darhol» tuyuladi.
3. 2 GB chegara (§2) bitta so'rovda umuman amalga oshmaydi.

### Kerakli endpointlar

```
POST   /v1/media/upload/init      { kind, conversationId, fileName, totalBytes }
                                  → { uploadId, chunkSize, expiresAt }

PUT    /v1/media/upload/{uploadId}/part/{index}     (binary, Content-Range)
                                  → { received: [0,1,2,…] }

POST   /v1/media/upload/{uploadId}/complete
                                  → AttachmentDto   (hozirgi `chat-upload` bilan bir xil)

GET    /v1/media/upload/{uploadId}
                                  → { received: [...] }   // tiklash uchun
DELETE /v1/media/upload/{uploadId}
```

Talablar:

- Bo'laklar **istalgan tartibda** va **parallel** kelishi mumkin
- Bo'lak qayta yuborilsa — idempotent (o'sha indeks qayta yoziladi, xato emas)
- `uploadId` kamida **24 soat** yashaydi — foydalanuvchi metroga kirib chiqqach davom etsin
- `complete` gacha hech qanday `mediaId` yaratilmaydi
- Tugallanmagan yuklashlar kvotaga kirmaydi, lekin 24 soatdan keyin tozalanadi

Eski `POST /v1/media/chat-upload` **saqlanadi** — kichik fayllar uchun bitta so'rov baribir
tezroq. Chegara: ~10 MB dan kichigi eski yo'ldan, kattasi bo'lakli.

### Buning klientga beradigani

Bo'lakli yuklash bo'lgach klient siqishni yuklash bilan ustma-ust qila oladi: muxer fayl
oxirini yozayotganda boshi allaqachon ketayotgan bo'ladi. `VIDEO_SEND_PERFORMANCE.md` §6 da
bu «Top 3» ning ikkinchisi va aynan backendga bog'liq bo'lgani.

---

## 8. Nima qachon kerak

| № | Ish | Nega shu tartibda |
|---|---|---|
| 1 | §1 — fayl turlari + tarqatishni qattiqlashtirish | **Bugun ishlamayotgan narsa** (§1.1 dagi 422). Ikkalasi **birga** chiqishi shart |
| 2 | §7 — bo'lakli yuklash | Qolgan hamma narsa (2 GB, tezlik, ustma-ustlik) shunga bog'liq |
| 3 | §2 — chegaralar | §7 dan keyin ma'noga ega |
| 4 | §3 — asl sifatli rasm | Mustaqil, istalgan payt |
| 5 | §5 — dumaloq video | Yangi imkoniyat |
| 6 | §6 — ovoz (Opus + 100 nuqta) | Yangi imkoniyat |

---

## 9. Klient tomoni

Sekinlikning bir qismi bizning tomonda (ortiqcha qayta kodlash, yuqori maqsadli bitreyt) va
u **sizdan hech narsa talab qilmaydi** — o'zimiz tuzatamiz.

Sizdan bog'liq bo'lgan yagona narsa — §7 dagi bo'lakli yuklash. Usiz siqish bilan yuklashni
ustma-ust qo'yib bo'lmaydi va yuborish har doim ikkalasining **yig'indisi** qadar davom
etadi.
