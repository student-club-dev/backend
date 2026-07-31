# Story va boyitilgan profil — Backend spetsifikatsiyasi

Bu hujjat **Student Club** ilovasiga ikkita mustaqil imkoniyat qo'shish uchun backendda
nima qilinishi kerakligini tavsiflaydi:

- **A qism — Story:** 24 soatdan keyin o'chadigan lavhalar (rasm/video), ko'rganlar
  ro'yxati, avatar atrofidagi halqa.
- **B qism — Boyitilgan profil:** bir nechta profil rasmi (Telegram'dagidek surib
  ko'riladigan), tarjimayi hol, telefon raqamini ko'rsatish maxfiyligi va talaba
  profilini alohida olish.

> **Bu hujjat `CHAT_MEDIA_AND_CALLS_BACKEND.md` dan MUSTAQIL.** Ular bir-birini
> takrorlamaydi: u yerda chat medialari va qo'ng'iroq, bu yerda profil va Story.
> Yagona umumiy nuqta — fayl yuklash: Story video uchun **o'sha hujjatning §1
> (`POST /v1/media/chat-upload`) kengaytmasi kerak** yoki quyidagi §3 dagi alohida
> endpoint. Ikkitasidan **bittasi** yetarli.

Yakuniy API kontrakti — `dev/api-client-generator/student-club.json` (OpenAPI v1).
**U yagona manba**: Kotlin klienti o'sha yerdan generatsiya qilinadi.

---

## 0. Hozirgi holat

| Kerak | Backend holati |
|---|---|
| Profil rasmi | ⚠️ **bitta** satr: `UserProfileDto.avatarUrl` |
| Bir nechta profil rasmi | ❌ yo'q |
| Tarjimayi hol (bio) | ❌ maydonning o'zi yo'q |
| Suhbatdoshning telefon raqami | ❌ `StudentSummaryDto` da yo'q (faqat o'z profilingda) |
| Bitta talaba profilini olish | ❌ `GET /v1/students/{id}` yo'q — faqat ro'yxat |
| Story | ❌ butunlay yo'q |
| Fayl xabari («Fayllar» bo'limi) | ❌ yo'q — qarang `CHAT_MEDIA_AND_CALLS_BACKEND.md` §1 |

Ilovada profil ekrani **allaqachon tayyor** (chat sarlavhasi bosilganda ochiladi) va
Telegram maketiga mos: katta avatar, 4 ta amal tugmasi, ma'lumot kartasi, «Postlar /
Media / Fayllar / Havolalar» bo'limlari. Backend bermaydigan qatorlar hozir **«tez orada»**
deb turibdi — bu hujjat aynan o'shalarni yopadi.

### ⚠️ Orqaga moslik qoidasi

Barcha yangi maydonlar **ixtiyoriy (nullable)** bo'lsin va `avatarUrl` **saqlanib qolsin**.
Ilovaning tarqatilgan versiyalari faqat `avatarUrl` ni biladi; u yo'qolsa yoki massivga
aylansa, ular avatarni umuman ko'rsatolmay qoladi.

---

# A QISM — STORY

## 1. Umumiy qoidalar

- Story — **rasm yoki qisqa video**, e'lon qilingandan **24 soat** keyin avtomatik yo'qoladi.
- Faqat **bog'langan** talabalar ko'radi (chat bilan bir xil eshik — `Connections`).
  Bog'lanmagan odam story'ni ham, ko'rganlar sonini ham ko'rmaydi.
- Bitta talaba bir vaqtda **10 tagacha** faol story'ga ega bo'lishi mumkin.
- Story **tahrirlanmaydi** — faqat qo'yiladi va o'chiriladi.

## 2. Modellar

```
Story
  id            ULID, PK
  authorId      Student.id
  kind          IMAGE | VIDEO
  mediaId       MediaAsset.id
  caption       varchar(200), nullable
  createdAt     timestamptz
  expiresAt     timestamptz  — createdAt + 24h (ustun sifatida saqlansin, hisoblanmasin:
                               indeks va tozalash cron'i shunga tayanadi)
  viewsCount    int, default 0
  deletedAt     timestamptz, nullable — qo'lda o'chirilgan

StoryView
  storyId       Story.id
  viewerId      Student.id
  viewedAt      timestamptz
  PRIMARY KEY (storyId, viewerId)   — bir odam bir marta hisoblanadi
```

**Indekslar:** `Story(authorId, createdAt DESC)` va `Story(expiresAt)` — birinchisi lentani,
ikkinchisi tozalashni tez qiladi.

## 3. Story fayli yuklash

Ikki yo'ldan **bittasi**:

**(a) Tavsiya —** `CHAT_MEDIA_AND_CALLS_BACKEND.md` §1.1 dagi `POST /v1/media/chat-upload`
ga `kind` qiymatlariga `STORY_IMAGE | STORY_VIDEO` qo'shiladi va `conversationId` story
uchun **ixtiyoriy** bo'ladi. Bitta yuklash quvuri qoladi.

**(b)** Alohida `POST /v1/media/story-upload` — o'sha qoidalar bilan.

**Limitlar:**

| Tur | MIME | Hajm | Davomiyligi |
|---|---|---|---|
| `STORY_IMAGE` | `image/jpeg`, `image/png`, `image/webp`, `image/heic` | 12 MB | — |
| `STORY_VIDEO` | `video/mp4`, `video/quicktime` | 48 MB | **≤ 30 soniya** |

Server rasm uchun EXIF'ni tozalaydi (GPS!), video uchun H.264/AAC ga o'giradi va birinchi
kadrdan `thumbUrl` chiqaradi — chat medialari bilan **aynan bir xil** ishlov.

> ⚠️ Story tik ekran uchun: klient 9:16 nisbatda kesib yuboradi, lekin server buni
> **majburlamasin** — boshqa nisbatdagi rasm ham qabul qilinsin va UI uni "fit" qilib
> ko'rsatadi.

## 4. Endpointlar

### 4.1 `POST /v1/stories` — story qo'yish

```json
{ "mediaId": "med_01J…", "caption": "Imtihon tugadi 🎓" }
```

Javob — `StoryDto` (§4.6). Xatolar: `MEDIA_NOT_FOUND`, `MEDIA_ALREADY_USED`,
`STORY_LIMIT_REACHED` (10 tadan ko'p), `MEDIA_TOO_LONG` (30 s dan uzun video).

### 4.2 `GET /v1/stories/feed` — lenta

Bog'langanlarning **faol** story'lari, **muallif bo'yicha guruhlangan**. Guruhlash server
tomonida bo'lishi muhim: klient avatarlar qatorini shundan chizadi.

```json
{
  "result": {
    "items": [
      {
        "author": { "...StudentSummaryDto..." },
        "stories": [ { "...StoryDto..." } ],
        "hasUnseen": true,
        "lastCreatedAt": "2026-07-29T08:14:22.531Z"
      }
    ]
  }
}
```

**Tartib:** avval `hasUnseen = true` bo'lganlar, ular ichida `lastCreatedAt` bo'yicha
yangidan eskiga. Klient shu tartibda chizadi va o'zi qayta saralamaydi.

`hasUnseen` — shu muallifning **ko'rilmagan** story'si bormi. Avatar atrofidagi halqa
aynan shunga qarab yonadi.

### 4.3 `GET /v1/stories/mine` — o'z story'larim

Faol story'larim + har birining `viewsCount` i. Muddati o'tganlari **qaytmaydi**.

### 4.4 `POST /v1/stories/{id}/view` — ko'rildi

Javob tanasi yo'q (`result: null`). **Idempotent** — takror chaqiruv `viewsCount` ni
oshirmaydi (`StoryView` birlamchi kaliti shuni kafolatlaydi).

Bu chaqiruv **eng ko'p ishlatiladigan** endpoint bo'ladi (har lavha ochilganda), shuning
uchun yengil bo'lsin va `viewsCount` ni alohida hisoblab yubormasin — `StoryView` ga
`INSERT … ON CONFLICT DO NOTHING`, so'ng shartli `UPDATE`.

### 4.5 `GET /v1/stories/{id}/views` — kim ko'rgan

**Faqat muallifga.** Boshqasiga `403 FORBIDDEN`.
`?page=1&size=30` → `{ items: StudentSummaryDto[], page, size, total, hasNext }`.

⚠️ Ko'rganlar ro'yxati **`lastSeenVisibility` ga bo'ysunmaydi** — story'ni ko'rgan odam
o'zini ko'rsatgan bo'ladi. Lekin bu qoida hujjatlashtirilsin, aks holda maxfiylik
kutilmasi buziladi.

### 4.6 `DELETE /v1/stories/{id}` — o'chirish

Faqat muallif. `deletedAt` qo'yiladi va fayl 24 soatdan keyin cron bilan o'chadi
(darhol emas — kesh va CDN uchun).

### 4.7 `StoryDto`

```json
{
  "id": "sty_01J…",
  "authorId": "std_01H…",
  "kind": "IMAGE",
  "url": "https://cdn.elonuz.uz/stories/…webp",
  "thumbUrl": "https://cdn.elonuz.uz/stories/…_t.webp",
  "width": 1080, "height": 1920,
  "durationMs": null,
  "caption": "Imtihon tugadi 🎓",
  "createdAt": "2026-07-29T08:14:22.531Z",
  "expiresAt": "2026-07-30T08:14:22.531Z",
  "seen": false,
  "viewsCount": 12
}
```

- `seen` — **so'rovchi** ko'rganmi (o'z story'sida doim `true`).
- `viewsCount` — **faqat muallifga** haqiqiy son, boshqalarga `null`.
- `durationMs` — video uchun; rasm uchun `null` (klient rasmni 5 soniya ko'rsatadi).

## 5. Muddati o'tganini tozalash

Cron (har 10 daqiqada):

1. `expiresAt < now()` bo'lgan story'lar javoblardan **darhol** yo'qoladi (so'rovlarda
   `WHERE expiresAt > now() AND deletedAt IS NULL` sharti bo'lsin — cron kechiksa ham
   eskisi ko'rinmasligi shart).
2. `expiresAt < now() - 24h` bo'lganlarning **fayllari** bucket'dan o'chadi va qator
   `StoryView` lari bilan birga tashlanadi.

## 6. Push

Story uchun push **yubormang**. Story — «kim ko'rsa ko'radi» formati; har lavha uchun
bildirishnoma spam bo'lib ketadi va foydalanuvchi push'larni butunlay o'chirib qo'yadi.

## 7. Limitlar

- Kuniga **20 ta** story (10 tasi bir vaqtda faol bo'lishi mumkin).
- `POST /v1/stories/{id}/view` — daqiqasiga **120 ta** (tez surib ko'rish normal).
- Bloklangan odamning story'si lentaga **tushmaydi** va uni ochib ham bo'lmaydi (`403`).

---

# B QISM — BOYITILGAN PROFIL

## 8. Bir nechta profil rasmi

Telegram'da profil rasmlari **to'plam**: yuqorida chiziqchalar, surib ko'riladi, eng
oxirgisi joriy avatar bo'ladi. Ilovadagi ekran buni **allaqachon qo'llab-quvvatlaydi** —
faqat bitta rasm kelayotgani uchun bitta chiziqcha ko'rinadi.

### 8.1 Model

```
ProfilePhoto
  id          ULID, PK
  studentId   Student.id
  mediaId     MediaAsset.id
  url, thumbUrl, width, height
  order       int — 0 = joriy avatar
  createdAt
```

### 8.2 Endpointlar

| Metod | Yo'l | Izoh |
|---|---|---|
| `POST` | `/v1/profile/photos` | `{ mediaId }` → yangi rasm **eng boshiga** qo'yiladi (`order = 0`), qolganlari suriladi |
| `GET` | `/v1/profile/photos` | O'z rasmlarim, `order` bo'yicha |
| `DELETE` | `/v1/profile/photos/{id}` | O'chirish; birinchisi o'chsa keyingisi avatar bo'ladi |
| `PUT` | `/v1/profile/photos/{id}/main` | Mavjud rasmni asosiy qilish (`order = 0`) |

**Maksimum 6 ta** rasm — undan ko'pi `422 PHOTO_LIMIT_REACHED`.

### 8.3 `avatarUrl` bilan bog'liqlik — MUHIM

> `order = 0` bo'lgan rasm o'zgarganda server **`Profile.avatarUrl` ni ham yangilasin**.

Sababi: tarqatilgan eski klientlar faqat `avatarUrl` ni o'qiydi. Ikkisi ajralib qolsa,
foydalanuvchi rasmini almashtiradi-yu, do'stlarining yarmi eski rasmni ko'rib turadi.
Ya'ni `avatarUrl` — **hosila maydon**, haqiqat manbai `ProfilePhoto(order = 0)`.

### 8.4 `StudentSummaryDto` kengaytmasi

```json
{
  "avatarUrl": "https://…",
  "photos": [
    { "id": "pht_01J…", "url": "https://…", "thumbUrl": "https://…", "width": 1080, "height": 1080 }
  ]
}
```

`photos` — **ixtiyoriy massiv**, `order` bo'yicha. Birinchi element doim `avatarUrl` bilan
bir xil bo'lishi kerak (§8.3). Bo'sh yoki yo'q bo'lsa klient `avatarUrl` ga tushadi.

## 9. Tarjimayi hol (bio)

`UpdateProfileDto` va `UserProfileDto` ga:

```json
{ "bio": "5/5 · Dasturiy injiniring" }
```

- `varchar(140)`, nullable.
- Havola va telefon raqami **filtrlansin** (spam profil bio orqali reklama tarqatadi):
  `http(s)://…`, `t.me/…`, `@kanal` va 7+ raqamli ketma-ketlik rad etilsin →
  `422 BIO_NOT_ALLOWED`.
- `StudentSummaryDto` ga ham qo'shilsin — profil ekranida ko'rsatiladi.

## 10. Telefon raqami va maxfiylik

Hozir `phoneNumber` **faqat o'z profilingda** bor. Telegram'dagidek ko'rsatish uchun:

### 10.1 Yangi sozlama

`UpdateProfileDto.phoneVisibility`: `EVERYONE | CONNECTIONS | NOBODY`, **odatiy `NOBODY`**.

> Odatiy qiymat `NOBODY` bo'lishi shart. Talabalar raqamini ko'rsatishga rozilik
> bermagan; uni sukut bo'yicha ochish — maxfiylikni buzish va real xavf (spam qo'ng'iroq).

### 10.2 `StudentSummaryDto.phoneNumber`

Ko'rish huquqi bo'lsa raqam, aks holda `null`. `lastSeenVisibility` bilan **aynan bir xil**
mantiq — ikkalasi bitta yordamchi funksiyadan o'tsin.

## 11. `GET /v1/students/{id}` — bitta talaba profili

Hozir bitta talabani olishning yo'li yo'q: ilova `GET /v1/conversations` javobidan kelgan
nusxadan foydalanadi, ya'ni **suhbat ochilmagan odamning profilini ko'rsatib bo'lmaydi**.

```
GET /v1/students/{id}  →  StudentSummaryDto (photos, bio, phoneNumber bilan)
```

`404` — talaba yo'q; `403` — bloklangan.

## 12. «Postlar» bo'limi

Profil ekranida «Postlar» bo'limi bor (Telegram maketi), lekin ilovada **bunday tushuncha
yo'q**. Ikki yo'l:

- **(a) Tavsiya:** bo'lim **olib tashlansin** — ilovada post yo'q, bo'sh tab foydalanuvchini
  chalg'itadi. Klientda buni o'chirish bir qator.
- **(b)** Agar keyinchalik «talaba e'lonlari» (ijara, xizmat, ish) profilga chiqarilsa,
  o'shalar shu bo'limda ko'rsatiladi — u holda `GET /v1/students/{id}/listings` kerak.

**Qaror backend jamoasidan emas, mahsulotdan kutiladi.** Hozircha bo'lim «tez orada»
holatida turibdi.

## 13. «Fayllar» bo'limi

Chatda fayl xabari yo'q — bu `CHAT_MEDIA_AND_CALLS_BACKEND.md` §1 (`kind = FILE`) bilan
yopiladi. Bu hujjatda takrorlanmaydi.

---

## 14. Xatolar

| Kod | HTTP | Qachon |
|---|---|---|
| `STORY_LIMIT_REACHED` | 422 | 10 tadan ko'p faol story |
| `STORY_NOT_FOUND` | 404 | Yo'q, o'chirilgan yoki muddati o'tgan |
| `STORY_FORBIDDEN` | 403 | Bog'lanmagan yoki bloklangan |
| `PHOTO_LIMIT_REACHED` | 422 | 6 tadan ko'p profil rasmi |
| `PHOTO_NOT_FOUND` | 404 | Rasm yo'q yoki boshqa foydalanuvchiniki |
| `BIO_NOT_ALLOWED` | 422 | Bio'da havola / telefon raqami |
| `MEDIA_TOO_LONG` | 422 | Story videosi 30 soniyadan uzun |

---

## 15. Qabul mezonlari (Definition of Done)

### Story

- [ ] Rasm story qo'yiladi va **24 soatdan keyin** lentadan yo'qoladi (cron kechikkanda ham).
- [ ] 30 soniyalik video story qo'yiladi; 40 soniyalik `422 MEDIA_TOO_LONG` beradi.
- [ ] Bog'lanmagan talabaning story'si lentaga **tushmaydi**, id bilan ochilsa ham `403`.
- [ ] Bloklangan odamning story'si ko'rinmaydi.
- [ ] Bitta story'ni 5 marta ochish `viewsCount` ni **1** ga oshiradi.
- [ ] `GET /v1/stories/{id}/views` faqat muallifga ishlaydi, boshqasiga `403`.
- [ ] `GET /v1/stories/feed` da ko'rilmaganlari **birinchi** keladi.
- [ ] 11-story `422 STORY_LIMIT_REACHED` beradi.

### Profil

- [ ] 3 ta profil rasmi qo'yiladi; `photos` massivi `order` bo'yicha qaytadi.
- [ ] 2-rasm asosiy qilinganda **`avatarUrl` ham o'zgaradi** — eski klient yangi rasmni ko'radi.
- [ ] Asosiy rasm o'chirilganda keyingisi avtomatik avatar bo'ladi.
- [ ] 7-rasm `422 PHOTO_LIMIT_REACHED` beradi.
- [ ] Bio'ga `t.me/kanal` yozib bo'lmaydi (`422 BIO_NOT_ALLOWED`).
- [ ] `phoneVisibility` odatiy **`NOBODY`**; o'zgartirilmagan akkauntning raqami
      `StudentSummaryDto` da `null` bo'lib keladi.
- [ ] `GET /v1/students/{id}` suhbat ochilmagan talaba uchun ham ishlaydi.
- [ ] Spec'da bitta ham `{"type":"object","nullable":true}` maydon yo'q va
      `./gradlew :dev:api-client-generator:generateAllApi` xatosiz o'tadi.

---

## 16. Bosqichlar

| Bosqich | Ish | Nega shu tartibda |
|---|---|---|
| **1** | `bio` + `phoneVisibility` + `StudentSummaryDto` kengaytmasi | Eng arzon; profil ekranidagi «tez orada» qatorlarining yarmi darhol to'ladi |
| **2** | `GET /v1/students/{id}` | Kichik, lekin profilni suhbatdan tashqarida ochish imkonini beradi |
| **3** | `ProfilePhoto` + 4 ta endpoint + `avatarUrl` sinxronizatsiyasi | UI tayyor — faqat massiv kerak |
| **4** | Story: model, yuklash, `POST /v1/stories`, `GET /feed`, `POST /view` | Asosiy oqim |
| **5** | `GET /{id}/views`, `DELETE`, tozalash cron'i | Story'ni yakunlaydi |

---

## 17. Backend ishlab chiquvchisiga topshiriq (qisqa shakl)

> **Vazifa:** Student Club'ga Story va boyitilgan profil qo'shish.
>
> **Profil (avval, arzon):** `UpdateProfileDto`/`UserProfileDto` ga **`bio`** (140 belgi;
> havola, `t.me`, `@kanal` va 7+ raqamli ketma-ketlik rad etilsin — spam profil orqali
> reklama tarqatadi) va **`phoneVisibility`** (`EVERYONE|CONNECTIONS|NOBODY`, **odatiy
> `NOBODY`**) qo'shiladi. `StudentSummaryDto` ga `bio`, `phoneNumber` (ko'rish huquqi
> bo'lmasa `null` — `lastSeenVisibility` bilan bir xil mantiq) va `photos` massivi
> qo'shiladi. Yangi `GET /v1/students/{id}` — hozir bitta talabani olishning yo'li yo'q.
>
> **Bir nechta profil rasmi:** `ProfilePhoto` jadvali + `POST/GET /v1/profile/photos`,
> `DELETE /v1/profile/photos/{id}`, `PUT /v1/profile/photos/{id}/main`; maksimum 6 ta.
> ⚠️ **`order = 0` o'zgarganda `Profile.avatarUrl` ham yangilansin** — tarqatilgan eski
> klientlar faqat `avatarUrl` ni o'qiydi, ikkisi ajralsa foydalanuvchi rasmini
> almashtiradi-yu, do'stlarining yarmi eskisini ko'rib turadi.
>
> **Story:** `Story` + `StoryView` jadvallari. Rasm/video, **24 soat**, `expiresAt`
> ustun sifatida saqlansin (hisoblanmasin). Endpointlar: `POST /v1/stories`,
> `GET /v1/stories/feed` (**muallif bo'yicha guruhlangan**, ko'rilmaganlari birinchi),
> `GET /v1/stories/mine`, `POST /v1/stories/{id}/view` (**idempotent** — takror ko'rish
> hisobni oshirmasin), `GET /v1/stories/{id}/views` (**faqat muallifga**),
> `DELETE /v1/stories/{id}`. Eshik chat bilan bir xil: faqat **bog'langan** talabalar,
> bloklangan ko'rmaydi. Bir vaqtda 10 ta faol story, kuniga 20 ta.
> So'rovlarda `WHERE expiresAt > now()` sharti **majburiy** — cron kechiksa ham eski
> story ko'rinmasligi kerak. **Story uchun push YUBORILMASIN.**
>
> **Fayl yuklash:** `CHAT_MEDIA_AND_CALLS_BACKEND.md` §1.1 dagi `chat-upload` ga
> `STORY_IMAGE | STORY_VIDEO` qo'shilsa yetarli (video ≤ 30 s, 48 MB; H.264/AAC ga
> o'giriladi, EXIF tozalanadi) — alohida endpoint shart emas.
>
> **Barcha o'zgarishlar `student-club.json` (OpenAPI v1) ga kiritilsin** — Kotlin klienti
> o'sha yerdan generatsiya qilinadi. Maydonlar **aniq tiplansin**
> (`{"type":"string","nullable":true}`, `integer`, `array`), tipsiz
> `{"type":"object","nullable":true}` **qolmasin** — undan generator `Any?` chiqaradi va
> klient kompilyatsiya bo'lmaydi. Yangi maydonlarning barchasi **ixtiyoriy** bo'lsin va
> `avatarUrl` saqlanib qolsin.
> Qabul mezonlari — §15, tartib — §16.
