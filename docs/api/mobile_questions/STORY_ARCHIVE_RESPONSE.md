# Postlar arxivi — backend javobi

`STORY_ARCHIVE_BACKEND.md` **to'liq bajarildi** — §6 dagi 7 ta qabul mezonining barchasi.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.
> Kotlin klientini shu fayldan qayta generatsiya qiling.

---

## 0. Bir qarashda — yangilangan jadval

| | Avval | Endi |
|---|---|---|
| 24 soatdan keyin | qator + fayl o'chardi | ✅ **muallif uchun qoladi** (arxiv) |
| Media fayli | `expiresAt + 24h` da o'chardi | ✅ **1 yil** saqlanadi (§3) |
| Endpoint | yo'q | ✅ `GET /v1/stories/archive` |
| Ko'radigan odam | — | ✅ **faqat muallif** — media baytlari ham |
| Lentaga ta'siri | — | ✅ **yo'q** — `feed` va `mine` o'zgarmadi |

---

## 1. `GET /v1/stories/archive` — tayyor

So'ralganidek, o'zgarishsiz:

```
GET /v1/stories/archive?page=1&size=30
Authorization: Bearer <access>
```

| Parametr | Turi | Sukut | Chegara |
|---|---|---|---|
| `page` | int | `1` | ≥ 1 |
| `size` | int | `30` | 1..100 |

Javob — `StoryArchivePageDto`, konvert ichida:

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": { "items": [ /* StoryDto */ ], "page": 1, "size": 30, "total": 84, "hasNext": true },
  "error": null
}
```

- **Tartib:** `createdAt DESC` — yangidan eskiga. ✅
- **Shart:** `authorId = me AND expiresAt <= now() AND deletedAt IS NULL`. ✅
- `authorId` **tokendan** olinadi — parametr yo'q, ya'ni boshqa odamning arxivini so'rashning
  imkoni yo'q. IDOR mumkin emas.
- **Xatolar:** `401 UNAUTHORIZED` · `403 FORBIDDEN` (STUDENT bo'lmagan hisob).

### `StoryDto` arxivda

| Maydon | Arxivda |
|---|---|
| `viewsCount` | ✅ **haqiqiy son, muzlatilgan** — `null` emas |
| `seen` | ✅ doim `true` |
| `expiresAt` | ✅ o'tmishda — bu normal |

---

## 2. ⚠️ Bitta yangi maydon — `archivedMediaPurged`

**Bu specdan chetga chiqish, e'tibor bering.** §1.1 «shakl o'zgarmaydi» degan edi, lekin §3
«fayl o'chgach klient kulrang katak chizsin» deb talab qiladi — hozirgi shaklda buni
bildiradigan hech narsa yo'q edi. Shuning uchun `StoryDto` ga bitta `boolean` qo'shildi:

```jsonc
"archivedMediaPurged": false
```

- `true` bo'lsa: 1 yil o'tgan, fayl o'chirilgan, `url` endi **404** qaytaradi →
  **kulrang katak chizing, rasm yuklamang.**
- Faol postda **doim `false`** — `/feed` va `/mine` uchun amalda hech narsa o'zgarmaydi.
- Maydon **qo'shildi**, hech narsa o'chirilmadi va nomi o'zgarmadi. Hozirgi generatsiya
  qilingan klient uni shunchaki e'tiborsiz qoldiradi va ishlayveradi — qayta generatsiya
  qilganda o'zi paydo bo'ladi.

Agar buni xohlamasangiz, ayting — muqobili `url` ni nullable qilish, lekin u **buzuvchi**
o'zgarish bo'lardi.

---

## 3. Nima o'zgarmadi — tekshirildi

| Spec §2 | Holat |
|---|---|
| `GET /stories/feed` — muddati o'tgan post tushmaydi | ✅ o'zgarmadi |
| `GET /stories/mine` — faqat faol postlar | ✅ o'zgarmadi |
| `GET /stories/{id}/views` — arxivdagi post uchun ham ishlaydi | ✅ **tuzatildi** (avval 404 berardi) |
| `DELETE /stories/{id}` — arxivdagi postni butunlay o'chiradi | ✅ ishlaydi |
| `POST /stories/{id}/view` — arxivdagi postga yangi ko'rish qo'shilmaydi | ✅ 404 |

**Arxiv boshqa hech kimga ko'rinmaydi.** Boshqa odamning arxivini so'raydigan endpoint yo'q.
`GET /stories/{id}/views` da begona odam:

- **faol** post uchun → `403` (avvalgidek),
- **arxivdagi** post uchun → `404` — ya'ni «bunday post bor» degan ma'lumot ham bermaydi.

---

## 4. Media — asosiy o'zgarish (§3)

`GET /v1/media/{id}/raw` endi story fayllari uchun ikki bosqichli:

| Postning holati | Kim o'qiy oladi |
|---|---|
| Faol (`expiresAt > now`) | egasi **yoki bog'langan** odam (avvalgidek) |
| Arxivda (`expiresAt <= now`) | ✅ **faqat egasi** — bog'langanlar `404` oladi |

Bu tekshiruv **media modulida** turibdi, stories modulida emas: faylga to'g'ridan-to'g'ri
havola stories modulini umuman aylanib o'tadi, shuning uchun qoidani boshqa joyga qo'yish
teshik qoldirardi.

`StoryView` qatorlari ham qoladi — ko'rganlar ro'yxati arxivda ham ochiladi. ✅

### Saqlash muddati: **1 yil** (365 kun)

Siz taklif qilgan asosiy variant tanlandi — `STORY_ARCHIVE_RETENTION_DAYS=365` (env orqali
sozlanadi, o'zgartirish oson). Foydalanuvchiga aytadigan javob:

> **Arxivdagi postlar 1 yil saqlanadi. Undan keyin rasm/video o'chadi, postning o'zi
> ro'yxatda qoladi.**

1 yildan keyin: fayl bucket'dan ketadi, qator **qoladi**, `archivedMediaPurged = true`
bo'ladi (§2 ga qarang).

### Siqish (720p / 1600px) — qilinmadi, sababi bor

§3 arxiv medialari siqilgan saqlanishini tavsiya qilgan edi. **Fayllar allaqachon
yuklashda normallashtiriladi:**

- rasm → uzun tomoni **1920px** ga kichraytiriladi, WebP ga o'giriladi, EXIF tozalanadi;
- video → **H.264/AAC** ga qayta kodlanadi.

Arxivga o'tganda ikkinchi marta qayta kodlash — bu alohida ffmpeg cron job'i, ya'ni
arxivning o'zidan kattaroq ish, va CPU narxi doimiy. Disk o'sishi muammoga aylansa,
alohida vazifa sifatida qo'shamiz. Hozircha 1920px/H.264 yetarli deb hisoblaymiz.

---

## 5. Ma'lumotlar bazasi va cron

Yangi jadval kerak bo'lmadi, siz aytganingizdek. `stories` ga bitta ustun qo'shildi:

```sql
ALTER TABLE "stories" ADD COLUMN "archived_media_purged" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "stories_deleted_at_idx" ON "stories"("deleted_at");
```

Ikkinchi indeks — cron o'zgargani uchun (pastga qarang): o'chirish sweep'i endi `expires_at`
o'rniga `deleted_at` bo'yicha qidiradi, indekssiz u har 10 daqiqada butun jadvalni skanerlardi.
Arxiv so'rovi uchun esa siz aytgandek mavjud `(author_id, created_at)` yetarli bo'ldi.

| Job | Avval | Endi |
|---|---|---|
| `sweepDeleted` (10 daq) | `expiresAt < now-24h` → qator + fayl | **faqat `deletedAt < now-24h`** → qator + fayl |
| `sweepArchive` (kuniga 03:00) | yo'q | `expiresAt < now-365d` → **faqat fayl**, qator qoladi + `archived_media_purged = true` |

Muhim nuqta: fayl o'chsa ham `MediaAsset` **qatori qoladi** — `Story` unga cascade bilan
bog'langan, ya'ni qatorni o'chirish arxivdagi postni ham o'chirib yuborardi.

---

## 6. Deploy paytida bilib qo'yish kerak bo'lgan 2 narsa

**1. Birinchi kuni arxiv deyarli bo'sh bo'ladi.** Eski cron 24 soatdan oshgan hamma postni
allaqachon o'chirib yuborgan — tiklab bo'lmaydi. Arxivga faqat oxirgi ~48 soatlik postlar
tushadi va keyin asta to'ladi. **Klientda bo'sh holat ko'rinsa, bu xato emas** — §5 dagi
«backend chiqmaguncha bo'sh holat» xulqi shu kunlar uchun ayni muddao.

**2. Migratsiya orqaga mos.** Qo'shilgan ustunning defaulti bor, indeks esa additive —
ya'ni eski kod ham yangi sxemada muammosiz ishlaydi. Deploy tartibi Compose'da o'zi
to'g'ri: `migrate` servisi tugagandan keyingina `backend` ko'tariladi.

> Eski koddagi cron `expiresAt < now-24h` bo'lganlarni o'chirar edi — bu endi aynan arxiv.
> `container_name: elonuz-backend` tufayli bir vaqtda ikkita backend konteyner ishlay
> olmaydi, shuning uchun bu jiddiy xavf emas; deploy'ni to'liq xotirjam qilish uchun
> backend'ni avval to'xtatib olish kifoya (§ pastdagi buyruqlar).

**Yangi env o'zgaruvchisi majburiy emas.** `STORY_ARCHIVE_RETENTION_DAYS` ning kodda
defaulti 365 — serverdagi mavjud `.env` ni o'zgartirmasa ham ishlaydi.

---

## 7. Qabul mezonlari (§6)

| Mezon | Holat |
|---|---|
| Post qo'yiladi → «Postlar» da ko'rinadi, ko'rishlar o'sadi | ✅ o'zgarmadi |
| 24 soat → lentadan va `/mine` dan yo'qoladi, `/archive` da paydo bo'ladi | ✅ |
| Arxivdagi postning rasmi/videosi ochiladi (muallif tokeni bilan) | ✅ |
| Bog'langan odam arxivdagi media havolasini so'rasa → `404` | ✅ |
| `page=2` ikkinchi sahifa, oxirgi sahifada `hasNext=false` | ✅ |
| Arxivdagi post o'chirilsa `/archive` dan yo'qoladi, fayli bucket'dan ketadi | ✅ (fayl 24 soat grace bilan) |
| `GET /stories/{id}/views` arxivdagi post uchun ham ro'yxat qaytaradi | ✅ |

---

## 8. Testlar

**Unit:** `npx jest` — 1633 ta test o'tdi, yiqilgani yo'q.

**E2E (haqiqiy bazaga qarshi):** `test/story-archive.e2e-spec.ts` — **12 ta test**, §6 dagi
qabul mezonlarining har biri. Bu alohida yozildi, chunki unit testlar repozitoriyni mock
qiladi — ya'ni feature'ning o'zi bo'lgan SQL shartlari (`expiresAt <= now()` arxiv uchun,
`expiresAt > now()` media uchun, ikkita purge so'rovi) u yerda umuman tekshirilmagan edi.

```
✓ yangi post /mine da, arxivda emas
✓ muddati o'tgan post lentadan va /mine dan chiqib, /archive ga tushadi
✓ viewsCount muzlaydi (null bo'lmaydi), seen=true, expiresAt o'tmishda
✓ tartib createdAt DESC; page=1/page=2 har xil, oxirgi sahifada hasNext=false
✓ boshqa odamning arxivi ko'rinmaydi
✓ /{id}/views arxivda muallifga ishlaydi; bog'langanga va begonaga 404
✓ media: faol → bog'langan ocha oladi; arxivda → faqat muallif (boshqalarga 404)
✓ arxivdagi postga yangi ko'rish qo'shilmaydi (404)
✓ arxivdagi post o'chirilsa /archive dan yo'qoladi
✓ purgeDeleted arxivga tegmaydi (10 kunlik post ham joyida qoladi)
✓ retention'dan keyin fayl o'chadi, POST QOLADI, archivedMediaPurged=true
✓ ikkinchi sweep o'sha qatorlarni qayta olmaydi
```

Ishga tushirish: `OTP_CHANNEL=dev SMS_PROVIDER=dev npx jest --config ./test/jest-e2e.json test/story-archive.e2e-spec.ts`

---

## 9. Sizdan javob kutiladigan yagona savol

`archivedMediaPurged` maydoni (§2) — qo'shilganicha qoldiramizmi, yoki boshqa yechim
xohlaysizmi? Qolgan hamma narsa spec bo'yicha, o'zgarishsiz.
