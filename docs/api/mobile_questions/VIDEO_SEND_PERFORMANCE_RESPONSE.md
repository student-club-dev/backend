# Video yuborish tezligi — backend javobi

`VIDEO_SEND_PERFORMANCE.md` o'qildi. Tahlil aniq va foydali — ayniqsa `Presentation.createForHeight`
ning transmux yo'lini yopib qo'yishi haqidagi qism.

**Qisqa javob:** §6.2 da so'ralgan «chunked/resumable upload endpoint» **allaqachon bor** va
2026-yil iyulidan beri ishlab turibdi. Bitta haqiqiy kamchilik bor edi — uni tuzatdik.
Qolgan hamma narsa (§6.1, §6.3 va «Also worth doing») **klient tomonida**.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.

---

## 0. Bir qarashda

| Hujjatdagi talab | Holat |
|---|---|
| §6.1 transmux, 30 fps, 720p | ⛔️ **Klient ishi** — Media3 sozlamalari, backendda emas |
| §6.2 chunked/resumable endpoint | ✅ **Avvaldan bor** — 5 ta endpoint |
| §6.2 «parts go out as the muxer writes them» | ✅ **Endi mumkin** — quyida, §2 |
| §6.3 WorkManager / foreground service | ⛔️ **Klient ishi** |
| `HttpRequestRetry`, Media3 versiyasi | ⛔️ **Klient ishi** |
| Phase E «server holds it in PROCESSING» | ✅ **Sizga tegishli emas** — §3 |

---

## 1. Bo'lakli yuklash allaqachon bor edi

Hujjatda «*If the backend cannot change soon*» deyilgan — bu eskirgan ma'lumot.
`CHAT_MEDIA_PARITY_RESPONSE.md` §7 da bu yetkazilgan, va §10 ning 8-bandi so'zma-so'z shunday
deydi:

> «Bo'lakli yuklash — ~10 MB dan kattasi uchun. **Bu siz kutgan siqish↔yuklash ustma-ustligini
> ochadi.**»

Endpointlar (hammasi `student-api.json` da, `Authorization: Bearer <talaba tokeni>`):

```
POST   /v1/media/upload/init                     → { uploadId, received: [], chunkSize, totalBytes, expiresAt }
PUT    /v1/media/upload/{uploadId}/part/{index}   ← xom baytlar (multipart EMAS)
GET    /v1/media/upload/{uploadId}               → { received: [0,1,2,…], … }   ← uzilishdan keyin
POST   /v1/media/upload/{uploadId}/complete      → AttachmentDto (id = mediaId)
DELETE /v1/media/upload/{uploadId}               ← bekor qilish
```

Muhim xossalari — aynan siz so'raganlar:

- **`chunkSize` = 5 MB.** Oxirgi bo'lak qisqaroq bo'lishi mumkin, uzunroq emas (`413`).
- **Bo'laklar istalgan tartibda va parallel** yuborilishi mumkin.
- **Qayta yuborish zararsiz** — bir xil indeks o'zini qayta yozadi. Ya'ni uzilgandan keyin
  ko'r-ko'rona retry qilish xavfsiz.
- **`GET` uzilishdan keyin nima kelganini aytadi** — noldan boshlash shart emas.
- Sessiya **24 soat** yashaydi.
- Kvota, ruxsat va disk `init` da tekshiriladi — rad javob bir so'rovga tushadi, gigabaytga emas.

---

## 2. Nima o'zgardi — `complete` endi haqiqiy hajmni oladi

Yagona haqiqiy to'siq shu edi: `init` **aniq** `totalBytes` talab qilardi, `complete` esa
`actualBytes !== totalBytes` bo'lsa rad etardi. Kodlash tugamaguncha yakuniy hajm noma'lum —
demak sessiyani ochib ham bo'lmasdi. Ustma-ustlik shu yerda to'xtab qolardi.

**Endi `init` dagi `totalBytes` — «yuqori chegara», aniq va'da emas.**

```jsonc
// 1. Kodlash boshlanishidan oldin. Chegara sifatida MANBA fayl hajmini bering —
//    siqilgan natija undan katta bo'lmaydi.
POST /v1/media/upload/init
{ "kind": "VIDEO", "conversationId": "…", "fileName": "clip.mp4", "totalBytes": 188743680 }
→ { "uploadId": "upl_…", "chunkSize": 5242880, "received": [], … }

// 2. Muxer yozayotgan paytda — fayl o'sgani sari 5 MB lik bo'laklarni yuboring.
PUT /v1/media/upload/upl_…/part/0     ← 5 MB xom bayt
PUT /v1/media/upload/upl_…/part/1     ← 5 MB
…

// 3. Kodlash tugadi, haqiqiy hajm ma'lum bo'ldi.
POST /v1/media/upload/upl_…/complete
{ "totalBytes": 17301504 }
→ AttachmentDto  (id = mediaId, xabar bilan yuboriladigan)
```

`complete` body **ixtiyoriy**. Hajmni boshidan bilsangiz — `init` da bering va body'siz
`complete` chaqiring, xulq avvalgidek.

### Qoidalar

| Tekshiruv | Xulq |
|---|---|
| Bo'laklar 0,1,2,… uzluksiz bo'lishi kerak | O'rtada tirqish → `422 UPLOAD_INCOMPLETE`, qaysi bo'lak yo'qligi aytiladi |
| Kelgan baytlar < e'lon qilingan hajm | `422 UPLOAD_INCOMPLETE` — necha bayt yetishmayotgani bilan |
| Kelgan baytlar > e'lon qilingan hajm | `422 UPLOAD_SIZE_MISMATCH` |
| Kelgan baytlar > `init` dagi chegara | `422 UPLOAD_SIZE_MISMATCH` — kvota o'sha chegaraga berilgan edi |

⚠️ **Bitta xato kodi o'zgardi.** Oxirgi bo'lak kalta kelsa avval `UPLOAD_SIZE_MISMATCH` qaytardi,
endi **`UPLOAD_INCOMPLETE`**. Sabab: ikkala holatda ham yechim bir xil — yetishmagan baytni qayta
yuborish (bo'lakni qayta yozish tekin). `UPLOAD_SIZE_MISMATCH` endi faqat «aytganingizdan **ko'p**
yubordingiz» degani.

### Bitta muhandislik ogohlantirishi

Bu usul faqat **yozilgan baytlar keyin o'zgarmasa** ishlaydi. MP4 da `moov` atomi odatda oxiriga
yoziladi — u holda muammo yo'q. Lekin **faststart** (moov'ni boshiga ko'chirish) yoqilgan bo'lsa,
muxer faylni oxirida qayta yozadi va allaqachon yuborilgan bo'laklar eskiradi.

Media3 `Transformer` ning bu boradagi xulqini tekshiring. Agar boshidagi baytlar o'zgarsa —
o'zgargan bo'laklarni qayta yuboring (indeks bir xil, ustiga yoziladi, xato emas).

---

## 3. Server sizning videongizni qayta kodlamaydi

Hujjatning Phase E qismida «*The server may then hold the video in `PROCESSING`*» deyilgan.
**Sizning holatingizda bunday bo'lmaydi.**

`chat-media.service.ts:485`:

```ts
const alreadyPlayable = probe.videoCodec === 'h264' && (!probe.hasAudio || probe.audioCodec === 'aac');
const keepAsSent = quality === MediaQuality.ORIGINAL || alreadyPlayable;
status: keepAsSent ? MediaStatus.READY : MediaStatus.PROCESSING
```

Sizning Media3 sozlamangiz `setVideoMimeType(VIDEO_H264)` + `setAudioMimeType(AUDIO_AAC)` —
ya'ni chiqish doim H.264/AAC. Demak server **hech narsa qayta kodlamaydi**, `complete` darrov
`READY` qaytaradi. Serverda kutish yo'q.

(`quality: "ORIGINAL"` yuborsangiz ham qayta kodlanmaydi — kodek nima bo'lishidan qat'i nazar.)

---

## 4. Qolgan tavsiyalar — klient tomonida

Ochiq aytamiz: bular backend repozitoriysida emas, biz qila olmaymiz. Lekin tahlilingiz to'g'ri
va §6.1 **eng katta yutuq** — hujjatning o'zi aytganidek, 30s/4K holatini «minutlardan bir necha
soniyaga» tushiradi:

| Tavsiya | Qayerda |
|---|---|
| Manba balandligi ≤ maqsad bo'lsa bo'sh `Effects` → transmux | `VideoCompressor.android.kt` |
| 60 fps → 30 fps cheklash | `VideoCompressor.android.kt` |
| 1080p/3.5 Mbps → 720p/1.5–2 Mbps | `VideoCompressor.android.kt` |
| `copyToCache` ni olib tashlash, kameraga `File.renameTo` | `VideoPicker.android.kt` |
| WorkManager / foreground service | `ChatViewModel.kt` |
| `HttpRequestRetry` | `HttpClientFactory.kt` |

Diqqat: §6.1 va §6.2 **birga** ishlaganda ma'noli. Faqat ustma-ustlik qilib, 1080p/60fps
kodlashni qoldirsangiz — kodlash baribir uzoq davom etadi, shunchaki yuklash bilan yashiringan
bo'ladi.

---

## 5. Testlar

`npx jest` — **1639 test o'tdi**, yiqilgani yo'q. Media modulida 104 ta. Shu ish uchun
qo'shilganlar:

```
✓ init dagi chegaradan kichik haqiqiy hajm qabul qilinadi   ← ustma-ustlikning o'zi
✓ hajmni boshidan bilgan klient body'siz complete chaqira oladi (orqaga moslik)
✓ kalta dum → UPLOAD_INCOMPLETE (SIZE_MISMATCH emas)
✓ e'lon qilinganidan ko'p kelsa → UPLOAD_SIZE_MISMATCH
✓ init dagi chegaradan oshsa → UPLOAD_SIZE_MISMATCH (kvota o'shanga berilgan)
✓ o'rtadagi tirqish → qaysi bo'lak yo'qligi aytiladi
```

Xavfsizlik jihatidan hech narsa bo'shashmadi: bir sessiya diskka yoza oladigan maksimal bayt
**o'zgarmadi** (bo'lak indeksi chegarasi va bo'lak hajmi cheklovi tegilmagan), kvota esa ikki
marta tekshiriladi — `init` da chegara bo'yicha, `complete` da haqiqiy hajm bo'yicha.

---

## 6. Sizdan kerak bo'lgan narsa yo'q

Kontrakt kengaydi, buzilmadi. Hozirgi generatsiya qilingan klient ishlayveradi — `complete`
body'si ixtiyoriy. Ustma-ustlikni qo'shmoqchi bo'lsangiz `student-api.json` dan qayta
generatsiya qiling va §2 dagi tartibni bajaring.

Savol bo'lsa yozing.
