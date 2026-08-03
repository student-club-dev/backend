# Postlar arxivi (`Arxivlangan postlar`) · Backend spetsifikatsiyasi

Profil ekrani Telegram maketiga keltirildi: eski «E'lonlarim / Saqlangan / Arizalarim»
bo'limlari o'rnida endi **«Postlar»** va **«Arxivlangan postlar»** turadi.

Post — bu o'sha **story** (`handoff/07-STORIES.md`), boshqa model emas. Farqi bitta:
Telegramda 24 soat tugagach post **yo'qolmaydi**, faqat egasi ko'radigan arxivga o'tadi.
Bugun bizda esa u butunlay o'chadi — `expiresAt < now()` bo'lgan qator hamma javobdan
tushib qoladi, fayli esa 24 soatdan keyin bucket'dan o'chiriladi
(`STORY_AND_PROFILE_BACKEND.md` §A/«Tozalash»).

Ya'ni klientda ko'rsatadigan narsa yo'q: arxiv **butunlay backendga bog'liq**.

Yakuniy API kontrakti — `dev/api-client-generator/student-club.json` (OpenAPI v1, **yagona
manba**). Endpoint u yerga allaqachon qo'shilgan va klient generatsiya qilingan; bu hujjat
uning serverdagi xulqini tavsiflaydi.

---

## 0. Bir qarashda

| | Hozir | Kerak |
|---|---|---|
| 24 soatdan keyin | qator javoblardan yo'qoladi | **muallif uchun qoladi** (arxiv) |
| Media fayli | `expiresAt + 24h` da o'chadi | muallif uchun saqlanadi (§3) |
| Endpoint | yo'q | `GET /v1/stories/archive` |
| Ko'radigan odam | — | **faqat muallif** |
| Lentaga ta'siri | — | **yo'q** — `feed` va `mine` o'zgarmaydi |

---

## 1. `GET /v1/stories/archive`

Muddati o'tgan **o'z** lavhalarim. Sahifalanadi — arxiv har kuni 20 tagacha post bilan
o'sadi (`StoryLimits.MAX_PER_DAY`).

```
GET /v1/stories/archive?page=1&size=30
Authorization: Bearer <access>
```

| Parametr | Turi | Sukut | Chegara |
|---|---|---|---|
| `page` | int | `1` | ≥ 1 |
| `size` | int | `30` | 1..100 |

**Javob** (`StoryArchivePageDto`) — konvert ichida, qolgan endpointlardagidek:

```jsonc
{
  "items": [ /* StoryDto — `/mine` dagi bilan AYNAN bir xil shakl */ ],
  "page": 1,
  "size": 30,
  "total": 84,
  "hasNext": true
}
```

**Tartib:** `createdAt DESC` — yangidan eskiga. (`/mine` dan farqli: u ko'rish tartibida,
eskidan yangiga beradi. Arxiv — ko'rish lentasi emas, ro'yxat.)

**Shart:** `authorId = me AND expiresAt <= now() AND deletedAt IS NULL`.

**Xatolar:** `401 UNAUTHORIZED` · `403 FORBIDDEN` (STUDENT bo'lmagan hisob).

### 1.1 `StoryDto` maydonlari arxivda

Shakl o'zgarmaydi, lekin ikkita maydonning ma'nosi boshqacha:

- `viewsCount` — **saqlanadi**. Post arxivga o'tganda ko'rishlar soni muzlaydi (yangi
  ko'rish bo'lishi mumkin emas). Uni `null` qilib yubormang: profil to'ridagi ko'rsatkich
  aynan shu.
- `seen` — doim `true` (o'z postingiz), klient uni arxivda umuman ishlatmaydi.
- `expiresAt` o'tmishda qoladi — **bu normal**, klient uni faqat sana sifatida o'qiydi.

---

## 2. Nima **o'zgarmaydi** — muhim

1. `GET /v1/stories/feed` — muddati o'tgan post u yerga **hech qachon** tushmaydi.
2. `GET /v1/stories/mine` — faqat faol postlar (`expiresAt > now()`). Arxiv aralashmaydi.
3. `GET /v1/stories/{id}/views` — arxivdagi post uchun ham ishlaydi (muallifga).
4. `DELETE /v1/stories/{id}` — arxivdagi postga ham qo'llanadi va uni **butunlay**
   o'chiradi (fayli bilan). Klientdagi «o'chirish» tugmasi shuni chaqiradi.

⚠️ Eng muhimi: **arxiv boshqa hech kimga ko'rinmasin.** Boshqa odamning arxivini
so'raydigan endpoint yo'q va bo'lmaydi ham; `GET /v1/stories/{id}` (agar qo'shilsa) muddati
o'tgan postni faqat muallifga qaytarsin, qolganlarga `404`.

---

## 3. Media saqlash — asosiy o'zgarish

Hozir: `expiresAt < now() - 24h` bo'lganlarning fayllari bucket'dan o'chadi va qator
tozalanadi. Arxiv bilan bu **muallif uchun** to'xtatiladi:

- Fayl **saqlanib qoladi** (media yozuvi ham) — arxiv usiz bo'sh to'rtburchaklar bo'lardi.
- Ko'rish huquqi toraytiriladi: arxivdagi media'ni **faqat muallif** o'qiy oladi. Bugungi
  qoida «muallif + unga bog'langan odam» (`handoff/07-STORIES.md` §11.2) — muddati
  o'tganda bog'langanlar qismi **olib tashlanadi**.
- `StoryView` qatorlari ham qoladi (ko'rganlar ro'yxati arxivda ham ochiladi).

**Saqlash muddati.** Cheksiz saqlash bucket'ni cheksiz o'stiradi. Taklif: arxiv
**1 yil** saqlansin, undan keyin fayl o'chirilib qator `archivedMediaPurged = true` bilan
qolsin (klient bunday postni kulrang katak sifatida chizadi). Agar 1 yil ko'p bo'lsa —
90 kun ham yaraydi, lekin qiymat **hujjatlashtirilsin**: klient «arxivim qayoqqa ketdi?»
degan savolga javob bera olishi kerak.

**Hisob-kitob (o'lchamni tasavvur qilish uchun):** 1000 faol talaba × kuniga 3 post ×
o'rtacha 3 MB ≈ **9 GB/kun**, ya'ni yiliga ~3 TB. Shuning uchun arxiv medialari
**siqilgan** ko'rinishda saqlansin: video uchun 720p, rasm uchun 1600px yetarli — arxiv
qayta yuboriladigan manba emas, xotira uchun ro'yxat.

---

## 4. Ma'lumotlar bazasi

Yangi jadval **kerak emas** — `Story` ning o'zi yetarli, faqat tozalash joblari
o'zgaradi:

```sql
-- Muddati o'tganini o'chirish O'RNIGA: faqat bog'langanlar uchun yopiladi.
-- (Qator `deletedAt IS NULL` bo'lib qolaveradi.)
ALTER TABLE story ADD COLUMN archived_media_purged boolean NOT NULL DEFAULT false;

-- Arxiv so'rovi uchun indeks — mavjud `(authorId, createdAt DESC)` yetarli.
```

Cron:

| Job | Hozir | Kerak |
|---|---|---|
| `expireStories` | `expiresAt < now()` → qator + fayl o'chadi | **faqat ko'rinishni yopadi** (hisoblanadigan shart, ish qilmasa ham bo'ladi) |
| `purgeArchive` | yo'q | `expiresAt < now() - RETENTION` → fayl o'chadi, `archived_media_purged = true` |

---

## 5. Klient tomoni (tayyor, kutmoqda)

- `StoryRepository.archive(page, size)` — `Resource<StoryArchivePage>`
  (`dev/feature/stories/domain`).
- `MyPostsViewModel` — «Postlar» (`/mine`) va «Arxivlangan postlar» (`/archive`) ni
  **bir vaqtda** yuklaydi, profil ochilganda bitta marta.
- `MyPostsSection` — uch ustunli to'r; faol postda ko'rishlar soni, arxivda sana.
- Backend endpoint'i chiqmaguncha: `404`/`501` **xato oynasini ko'rsatmaydi**, bo'lim
  oddiy bo'sh holatda turadi. Ya'ni serverni kutish foydalanuvchiga xato bo'lib ko'rinmaydi.

---

## 6. Qabul mezonlari

- [ ] Post qo'yiladi → «Postlar» bo'limida ko'rinadi, ko'rishlar soni o'sadi.
- [ ] 24 soat o'tadi → lentadan va `/mine` dan yo'qoladi, **`/archive` da paydo bo'ladi**.
- [ ] Arxivdagi postning rasmi/videosi ochiladi (muallif tokeni bilan).
- [ ] Bog'langan odam arxivdagi media havolasini so'rasa — `404`.
- [ ] `page=2` ikkinchi sahifani beradi, `hasNext` oxirgi sahifada `false`.
- [ ] Arxivdagi post o'chirilsa `/archive` dan yo'qoladi va fayli bucket'dan ketadi.
- [ ] `GET /v1/stories/{id}/views` arxivdagi post uchun ham ro'yxat qaytaradi.
