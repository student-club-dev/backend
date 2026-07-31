# Story va boyitilgan profil — backend javobi

`STORY_AND_PROFILE_BACKEND.md` bo'yicha **A qism (Story) va B qism (profil) to'liq bajarildi** —
§16 dagi 5 ta bosqichning barchasi.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.
> Kotlin klientini shu fayldan qayta generatsiya qiling.

---

## 0. Hozirgi holat — yangilangan jadval

| Kerak | Holat |
|---|---|
| Profil rasmi | ✅ `avatarUrl` **saqlanib qoldi** |
| Bir nechta profil rasmi | ✅ `photos[]` + 4 ta endpoint, maks 6 ta |
| Tarjimayi hol (bio) | ✅ 140 belgi, spam filtri bilan |
| Suhbatdoshning telefon raqami | ✅ `phoneVisibility` bilan, odatiy `NOBODY` |
| Bitta talaba profilini olish | ✅ `GET /v1/students/{id}` |
| Story | ✅ to'liq — model, yuklash, feed, ko'rish, o'chirish, cron |
| Fayl xabari | `CHAT_MEDIA_AND_CALLS_BACKEND.md` §1 — bu hujjatda emas |

---

## 1. Fayl yuklash — sizning tavsiyangiz (a) tanlandi

Alohida `story-upload` **qilinmadi**. `POST /v1/media/chat-upload` uchta yangi `kind` bilan
kengaytirildi:

| `kind` | MIME | Hajm | Davomiyligi |
|---|---|---|---|
| `PROFILE_PHOTO` | jpeg/png/webp/heic/heif | 12 MB | — |
| `STORY_IMAGE` | jpeg/png/webp/heic/heif | 12 MB | — |
| `STORY_VIDEO` | mp4/quicktime | 48 MB | **≤ 30 s** |

- `conversationId` bu uchtasi uchun **kerak emas** va yuborilsa ham **e'tiborga olinmaydi**
  (aks holda adashib yuborilgan id story'ni o'sha suhbat a'zolariga ochib qo'yardi).
- Ishlov chat medialari bilan **aynan bir xil**: EXIF (GPS ham) tozalanadi, rasm kichraytiriladi,
  thumbnail + BlurHash chiqadi, video H.264/AAC ga o'giriladi va birinchi kadrdan poster olinadi.
- **9:16 majburlanmaydi** — siz so'raganingizdek, boshqa nisbat ham qabul qilinadi.

Javobdagi `id` — bu `POST /v1/profile/photos` va `POST /v1/stories` ga beriladigan `mediaId`.

### Fayllarni o'qish huquqi

`GET /v1/media/{id}/raw` endi turga qarab uchta qoidadan birini qo'llaydi:

| Tur | Kim o'qiy oladi |
|---|---|
| Chat medialari | suhbat **a'zosi** (o'zgarmadi) |
| `PROFILE_PHOTO` | har qanday tizimga kirgan talaba (ular allaqachon qidiruv natijalarida ko'rinadi) |
| `STORY_*` | egasi yoki unga **bog'langan** odam |

Ya'ni story havolasini begonaga yuborish ham ishlamaydi.

---

## 2. Bosqich 1 — `bio` va `phoneVisibility`

### `bio`

- `varchar(140)`, nullable. Ustunning o'zida ham cheklangan, faqat DTO da emas.
- **Rad etiladi** (`422 BIO_NOT_ALLOWED`): `http(s)://…`, `t.me/…`, `telegram.me/…`, `@handle`,
  yalang'och domen (`arzonkiyim.uz`), va **7+ raqamli ketma-ketlik**.
- Raqamlarni sanashdan oldin ajratgichlar olib tashlanadi — `+998 90 123 45 67` ham rad etiladi,
  aks holda chiroyli formatlangan har qanday raqam o'tib ketardi.
- Bo'sh satr (`""`) yuborilsa → `null` saqlanadi. "Hech qachon yozmagan" va "o'chirgan" bir xil
  holat bo'lishi kerak.
- `UpdateProfileDto`, `UserProfileDto` va `StudentSummaryDto` da bor.

### `phoneVisibility`

- `EVERYONE | CONNECTIONS | NOBODY`, **odatiy `NOBODY`** — siz talab qilganingizdek. Migratsiyada
  ham default shu, ya'ni mavjud hech bir talabaning raqami ochilib qolmaydi.
- `StudentSummaryDto.phoneNumber` — huquq bo'lsa raqam, aks holda `null`.
- **`lastSeenVisibility` bilan bitta yordamchi funksiyadan o'tadi**: `isWithinAudience()`
  (`profiles/domain/audience.ts`). Ikkala sozlama mustaqil — presence ochiq bo'lib raqam yopiq
  bo'lishi mumkin va aksincha (test bilan qamralgan).
- O'z profilingizda o'z raqamingiz doim ko'rinadi.

---

## 3. Bosqich 2 — `GET /v1/students/{id}`

```
GET /v1/students/{id}  →  SearchResultDto
```

**Eslatma:** `StudentSummaryDto` emas, **`SearchResultDto`** qaytadi — bu `StudentSummaryDto` ning
ustiga `connectionStatus` qo'shilgan turi, ya'ni `GET /v1/students` ro'yxatidagi qatorning aynan
o'zi. Sabab: profil ekranidagi 4 ta amal tugmasi ("Bog'lanish" / "Xabar" / …) qaysi holatda
ekanini bilishi kerak, aks holda klient buni aniqlash uchun yana ro'yxatga murojaat qilardi.
Ortiqcha maydonni e'tiborsiz qoldirsangiz bo'ladi.

- `bio`, `photos`, `phoneNumber` — hammasi ichida, har biri o'z maxfiylik sozlamasiga bo'ysunadi.
- `404 STUDENT_NOT_FOUND` — talaba yo'q.
- `403 USER_BLOCKED` — biri ikkinchisini bloklagan.
- O'z id ingiz bilan chaqirsangiz ham ishlaydi.

Route tartibi: `:id` ataylab `search` dan **keyin** e'lon qilingan, aks holda
`GET /v1/students/search` "search" ni id deb qabul qilardi.

---

## 4. Bosqich 3 — profil rasmlari

| Metod | Yo'l | Izoh |
|---|---|---|
| `GET` | `/v1/profile/photos` | O'z rasmlarim, tartib bo'yicha |
| `POST` | `/v1/profile/photos` | `{ mediaId }` → **eng boshiga** |
| `PUT` | `/v1/profile/photos/{id}/main` | Mavjudini asosiy qilish |
| `DELETE` | `/v1/profile/photos/{id}` | O'chirish |

Maksimum **6 ta** → `422 PHOTO_LIMIT_REACHED`. Boshqaning rasmi → `404 PHOTO_NOT_FOUND`.

### ⚠️ `avatarUrl` sinxronizatsiyasi — siz ta'kidlagan joy

Bajarildi va **tranzaksiya ichida**. Uchala yozuv amali (`add`, `makeMain`, `delete`) bitta
tranzaksiyada tartibni qayta hisoblaydi **va** `Student.avatarUrl` ni yozadi. Ikkisi orasida crash
bo'lsa ikkalasi ham qaytadi.

- Yangi rasm doim `sortOrder = 0` ga tushadi → rasm almashtirish **bitta chaqiruv**.
- Birinchisi o'chirilsa keyingisi avtomatik avatar bo'ladi.
- Oxirgisi o'chirilsa `avatarUrl = null` (klient bosh harflarga tushadi).

`avatarUrl` — **hosila maydon**, haqiqat manbai `ProfilePhoto(sortOrder = 0)`. Eski klientlar
buzilmaydi.

### `StudentSummaryDto.photos`

```jsonc
"photos": [
  { "id": "pht_…", "url": "…", "thumbUrl": "…", "width": 1080, "height": 1080 }
]
```

`order` bo'yicha, birinchi element doim `avatarUrl` ga teng. **Bo'sh massiv** = rasm qo'ymagan
talaba → `avatarUrl` ga tushing (u ham `null` bo'lishi mumkin). Maydon har doim mavjud (`null`
emas, bo'sh massiv) — Kotlin uchun `List<StudentPhotoDto>`.

---

## 5. A qism — Story

### Modellar

`stories` + `story_views` — sizning spetsifikatsiyangizdek. `expiresAt` **ustun sifatida
saqlanadi**, hisoblanmaydi. Indekslar: `(author_id, created_at)` va `(expires_at)`.

`viewsCount` denormalizatsiya qilingan — muallif ro'yxati har safar `story_views` ni
agregatsiya qilmaydi.

### Endpointlar

| Metod | Yo'l | Izoh |
|---|---|---|
| `POST` | `/v1/stories` | `{ mediaId, caption? }` |
| `GET` | `/v1/stories/feed` | **Muallif bo'yicha guruhlangan** |
| `GET` | `/v1/stories/mine` | Faol story'larim + haqiqiy `viewsCount` |
| `POST` | `/v1/stories/{id}/view` | **Idempotent**, 120/daqiqa |
| `GET` | `/v1/stories/{id}/views` | **Faqat muallifga**, sahifalangan |
| `DELETE` | `/v1/stories/{id}` | Faqat muallif |

### Feed tartibi

Server tomonida saralangan: avval `hasUnseen = true`, ular ichida `lastCreatedAt` bo'yicha
yangidan eskiga — **klient qayta saralamasin**. Bitta muallifning story'lari guruh ichida
eskidan yangiga (ko'rish tartibi).

```jsonc
{ "result": { "items": [
  { "author": { "...StudentSummaryDto..." },
    "stories": [ { "...StoryDto..." } ],
    "hasUnseen": true,
    "lastCreatedAt": "2026-07-31T08:14:22.531Z" } ] } }
```

### `StoryDto`

Sizning shaklingizga mos. `seen` — so'rovchi ko'rganmi (o'z story'ingizda doim `true`).
`viewsCount` — **faqat muallifga** haqiqiy son, boshqalarga `null`. `durationMs` — video uchun,
rasm uchun `null`.

### Eshik va cheklovlar

- Faqat **bog'langan** talabalar — chat bilan **aynan bir xil** eshik. Bloklangan odam feed'da
  ham ko'rmaydi, id bilan ochsa ham `403 STORY_FORBIDDEN`.
- Bir vaqtda **10 ta** faol, kuniga **20 ta** → `422 STORY_LIMIT_REACHED`.
  Kunlik hisob **o'chirilganlarni ham sanaydi**, aks holda "qo'y-o'chir" cheksiz kvota bo'lardi.
- O'z story'ingizni ko'rish `viewsCount` ni oshirmaydi.
- **Push yuborilmaydi** — siz so'raganingizdek.

### Muddati o'tganini tozalash

Ikki bosqich, sizning §5 ingizdek:

1. **Ko'rinish** — repozitoriy darajasidagi har bir o'qish
   `WHERE expires_at > now() AND deleted_at IS NULL` bilan. Bu shart metodlarning **ichida**,
   chaqiruvchiga qoldirilmagan: cron kechiksa ham eski story qaytishi mumkin emas.
2. **Disk** — `StoryCleanupCron`, har **10 daqiqada**, `expiresAt < now() - 24h` bo'lganlarni
   tozalaydi. `MediaAsset` o'chiriladi, `Story` va `StoryView` unga cascade bilan ergashadi;
   baytlar qatordan **oldin** o'chadi.

`DELETE /v1/stories/{id}` — soft delete: javoblardan darhol yo'qoladi, fayl 24 soatdan keyin
cron bilan o'chadi (kesh va CDN uchun, siz aytganingizdek).

### ⚠️ `GET /{id}/views` va maxfiylik

Sizning talabingizdek, ko'rganlar ro'yxati **`lastSeenVisibility` ga bo'ysunmaydi** — story'ni
ochgan odam o'zini ko'rsatgan bo'ladi. Bu Swagger'da ham, shu yerda ham hujjatlashtirilgan.
Sabab: aks holda ro'yxat va `viewsCount` bir-biriga zid bo'lib qolardi.

---

## 6. §12 «Postlar» bo'limi — qaror sizda

Hech narsa qilinmadi. Siz to'g'ri aytdingiz: bu mahsulot qarori, backend qarori emas.
`GET /v1/students/{id}/listings` **qo'shilmadi**. Mahsulot (b) ni tanlasa, ayting — kichik ish.

Tavsiyam sizniki bilan bir xil: hozircha bo'limni olib tashlash.

---

## 7. Xato kodlari

| Kod | HTTP | Qachon |
|---|---|---|
| `STORY_LIMIT_REACHED` | 422 | 10 ta faol yoki kuniga 20 ta |
| `STORY_NOT_FOUND` | 404 | Yo'q, o'chirilgan yoki muddati o'tgan |
| `STORY_FORBIDDEN` | 403 | Bog'lanmagan / bloklangan; `views` da — muallif emas |
| `PHOTO_LIMIT_REACHED` | 422 | 6 tadan ko'p profil rasmi |
| `PHOTO_NOT_FOUND` | 404 | Rasm yo'q yoki boshqaniki |
| `BIO_NOT_ALLOWED` | 422 | Bio'da havola / raqam |
| `MEDIA_TOO_LONG` | 422 | Story videosi 30 s dan uzun (yuklashda) |
| `MEDIA_NOT_READY` | 422 | Video hali transkod bo'lyapti |
| `MEDIA_NOT_FOUND` | 422 | `mediaId` yo'q, sizniki emas yoki turi noto'g'ri |
| `MEDIA_ALREADY_USED` | 422 | Bu `mediaId` allaqachon story/rasm sifatida ishlatilgan |

> **`MEDIA_ALREADY_USED` haqida:** bitta yuklash — bitta story yoki bitta rasm (`media_id` unique).
> Ikki marta bosilgan tugma yoki javob yetib bormagandan keyingi retry shu xatoga tushadi.
> Ikkinchisini qo'yish uchun faylni qaytadan yuklang. Bu 500 emas, klient ishlata oladigan 422.

---

## 8. §15 Qabul mezonlari — holat

### Story

| Mezon | Holat |
|---|---|
| Rasm story qo'yiladi va 24 soatdan keyin yo'qoladi (cron kechikkanda ham) | ✅ repozitoriy filtri + unit test |
| 30 s video o'tadi, 40 s → `422 MEDIA_TOO_LONG` | ✅ `MEDIA_LIMITS[STORY_VIDEO].maxDurationMs = 30_000`, yuklashda tekshiriladi ⚠️ jonli ffmpeg bilan sinalmagan |
| Bog'lanmaganning story'si feed'ga tushmaydi, id bilan ham `403` | ✅ unit test |
| Bloklangan odamning story'si ko'rinmaydi | ✅ (bir xil `areConnected` bloklarni ham qamraydi) |
| Bitta story'ni 5 marta ochish `viewsCount` ni 1 ga oshiradi | ✅ `story_views` PK + `skipDuplicates` |
| `GET /{id}/views` faqat muallifga, boshqasiga `403` | ✅ unit test |
| Feed'da ko'rilmaganlar birinchi | ✅ unit test |
| 11-story → `422 STORY_LIMIT_REACHED` | ✅ unit test |

### Profil

| Mezon | Holat |
|---|---|
| 3 ta rasm qo'yiladi, `photos` tartib bo'yicha qaytadi | ✅ |
| 2-rasm asosiy qilinganda `avatarUrl` ham o'zgaradi | ✅ tranzaksiya ichida |
| Asosiy rasm o'chirilganda keyingisi avatar bo'ladi | ✅ |
| 7-rasm → `422 PHOTO_LIMIT_REACHED` | ✅ unit test |
| Bio'ga `t.me/kanal` yozib bo'lmaydi | ✅ unit test |
| `phoneVisibility` odatiy `NOBODY`, raqam `null` keladi | ✅ unit test + migratsiya default |
| `GET /v1/students/{id}` suhbatsiz ham ishlaydi | ✅ |
| Spec'da bitta ham tipsiz `{"type":"object","nullable":true}` yo'q | ✅ **skript bilan tekshirildi: 0 ta** |

### ⚠️ Nima tekshirilmagan

- **`./gradlew :dev:api-client-generator:generateAllApi`** — bu sizning repongizda, men ishga
  tushira olmadim. Spec toza (tipsiz nullable object yo'q), lekin generatorning o'zi
  tasdiqlanmagan.
- **Jonli end-to-end oqim** (haqiqiy fayl yuklash → story qo'yish → feed). Unit testlar
  (881 ta, hammasi yashil) va DI grafi tekshirilgan; e2e testlar bu ish uchun yozilmadi.
- **40 soniyalik video rad etilishi** — cheklov kodda va `MEDIA_LIMITS` da, lekin haqiqiy ffprobe
  bilan sinalmagan.

---

## 9. Orqaga moslik

Barcha yangi maydonlar **qo'shimcha**:

- `avatarUrl` **saqlanib qoldi** va endi `photos[0].url` bilan sinxron.
- `bio`, `photos`, `phoneNumber` — yangi maydonlar; eski klient ularni o'qimaydi va buzilmaydi.
- Migratsiyalarning hammasi additive: nullable ustunlar, default'li ustunlar, yangi jadvallar.
  `media_assets.conversation_id` dan `NOT NULL` olib tashlandi — bu faqat kengaytirish, mavjud
  qatorlar tegilmaydi.

**Bitta breaking o'zgarish bor** va u stiker hujjatida: `MessageDto.sticker` ning `packId`/`emoji`
maydonlari nullable bo'ldi. Batafsil — `STICKER_SEARCH_RESPONSE.md` §2.

---

## 10. Migratsiyalar

| Migratsiya | Nima qiladi |
|---|---|
| `20260731064655_external_sticker_on_message` | `messages` ga 6 ta nullable stiker ustuni |
| `20260731070040_student_bio_and_phone_visibility` | `students.bio`, `students.phone_visibility` (default `NOBODY`) + `PhoneVisibility` enum |
| `20260731071402_profile_photos_and_stories` | `MediaKind` ga 3 ta qiymat, `media_assets.conversation_id` nullable, `profile_photos` / `stories` / `story_views` jadvallari |

Uchalasi ham dev bazaga qo'llandi va tekshirildi. Barchasi xavfsiz: rewrite yo'q, backfill yo'q,
destructive amal yo'q.
