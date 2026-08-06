# 15 — O'chirish va bloklash (talaba, biznes egasi, e'lonlar)

> 🔄 **Bu hujjat qayta yozildi.** Oldingi versiyada hisobni o'chirish "yumshoq" edi — qator joyida
> qolib, `status = DELETED` yozilardi. **Endi u haqiqiy `DELETE`:** qator bazadan butunlay
> o'chadi.
>
> Shu bilan birga **bloklash** (`ban`) kuchaytirildi: endi bloklangan biznes egasining e'lonlari
> talaba feed'idan ham yo'qoladi (ilgari faqat kirish to'silardi).
>
> Ikkalasining farqi endi aniq: **bloklash = vaqtincha o'chirib qo'yish, qaytariladi** ·
> **o'chirish = butunlay yo'q qilish, qaytarilmaydi.**

---

## 1. Ikki amal, ikki maqsad

| | 🔒 **Bloklash** (`ban`) | 🗑️ **O'chirish** (`delete`) |
|---|---|---|
| Bazada nima bo'ladi | `status = BANNED` yoziladi | **qator o'chadi** |
| Foydalanuvchi | kira olmaydi (403 `ACCOUNT_BANNED`) | mavjud emas |
| Ma'lumotlari | **hammasi joyida** | **hammasi yo'q** |
| Ro'yxatlarda | ko'rinadi (`status=BANNED` filtri bilan) | **umuman yo'q** |
| Biznes egasining e'lonlari | feed'dan yo'qoladi | butunlay o'chadi |
| Qaytarish | ✅ `unban` — hammasi tiklanadi | ❌ **imkonsiz** |
| Sabab | `banReason` **majburiy** | `reason` ixtiyoriy (faqat logga) |

> **Qoida:** javob keyinchalik o'zgarishi mumkin bo'lsa — **bloklang**. O'chirish faqat "bu hisob
> boshqa hech qachon kerak emas" aniq bo'lganda.

---

## 2. ⚠️ O'chirish nimalarni olib ketadi

Bu bo'limni tasdiqlash oynasini yozishdan oldin o'qing. Hard delete **faqat o'sha hisobning
ma'lumotini emas**, unga bog'liq hamma narsani oladi — jumladan **boshqa odamlarnikini**.

### Talaba o'chirilsa

Bazada `students` ga **25 ta bog'lanish** qaraydi. 24 tasi `Cascade` (birga o'chadi), bittasi
`SetNull`:

```
StudentOAuthAccount · StudentRefreshToken · DeviceToken · Notification
Message · MessageHidden · ConversationMember
Call (qo'ng'iroq qiluvchi va qabul qiluvchi sifatida) · CallStat
Story · StoryView · MediaAsset · ProfilePhoto · UploadSession
Connection · Block · Redemption · StudentFavorite
StudentListing · StudentListingView · Report (u yozgan shikoyatlar)
```

Uchtasi ayniqsa jiddiy:

- **`Message`** — talabaning xabarlari **boshqa odamning suhbatida** yashaydi. Uni o'chirsak,
  hech narsa qilmagan foydalanuvchi suhbat tarixining yarmini yo'qotadi va bunga hech qanday
  ogohlantirish bo'lmaydi.
- **`Report` (u yozgan)** — o'sha odam boshqalar ustidan yozgan shikoyatlar ham ketadi. Uning
  **ustidan** yozilganlari qoladi, lekin `target_student_id` `NULL` bo'ladi — ya'ni ayb yozuvi
  qoladi-yu, kim haqidaligi yo'qoladi.
- **`Redemption`** — u ishlatgan chegirmalar tarixi ketadi, ya'ni biznesning hisoboti ham
  o'zgaradi.

### Biznes egasi o'chirilsa

Kaskad ikki pog'ona chuqurroq boradi:

```
business_owners → businesses → listings → redemptions
                             → branches
                             → listing_branches, option_groups, student_favorites
```

Ya'ni bu **biznesni arxivlamaydi, yo'q qiladi**: barcha filiallar, barcha e'lonlar va o'sha
e'lonlar bo'yicha talabalar olgan **barcha redemption yozuvlari** o'chadi. Chegirmadan
foydalangan talaba buni o'z tarixidan ham yo'qotadi.

### Nusxa yo'q

Bazada zaxira nusxa yo'q, `restore` endpointi yo'q, audit jadvali ham yo'q. O'chirilgandan keyin
**bazada bu hisob mavjud bo'lganini ko'rsatadigan hech narsa qolmaydi**. Yagona iz — server logidagi
bitta qator:

```
WARN [AdminStudentsWriteService] Hard-deleting student <id>. Reason: <sabab>
```

Logga faqat `id` yoziladi, email emas (loyiha qoidasi shaxsiy ma'lumotni logga yozishni taqiqlaydi).
Ya'ni log "o'chirish bo'ldi" deydi, "kim o'chirildi" demaydi.

---

## 3. Talabani o'chirish

### `DELETE /v1/admin/students/:id` · 🔑 **Admin**

⚠️ `ADMIN` roli, `MODERATOR` emas.

**Request:** tana ixtiyoriy.

```jsonc
{ "reason": "Foydalanuvchi so'rovi bo'yicha" }   // ixtiyoriy, 500 belgigacha — faqat logga tushadi
```

**Response:** `200`, **`result: null`**.

```jsonc
{ "success": true, "status": 200, "code": null, "message": "OK", "result": null, "error": null }
```

> ⚠️ **Kontrakt o'zgardi.** Ilgari bu endpoint yangilangan `AdminStudentDto` qaytarardi. Endi
> qaytaradigan yozuv yo'q — u o'chirilgan. Frontend javobdan foydalanuvchi ma'lumotini o'qimasin,
> ro'yxatni qayta yuklasin.

**Xatolar:**

| Holat | `error.code` | Status |
|---|---|---|
| Bunday id yo'q | `STUDENT_NOT_FOUND` | 404 |
| Rol yetmaydi | `FORBIDDEN` | 403 |

> `409 INVALID_STATUS_TRANSITION` **endi yo'q**. Ikkinchi marta o'chirishga urinish `404` beradi —
> qator yo'q, ziddiyat qiladigan narsa ham yo'q.

---

## 4. Biznes egasini o'chirish

### `DELETE /v1/admin/business-owners/:id` · 🔑 **Admin**

Talaba bilan bir xil shakl: tana ixtiyoriy `{ "reason": "..." }`, javob `result: null`, xatolar
`404 BUSINESS_OWNER_NOT_FOUND` / `403 FORBIDDEN`.

Farqi — **hajmi**. Kaskad butun do'konni oladi: bizneslar, filiallar, e'lonlar va redemptionlar
(§2).

⚠️ **Tasdiqlash oynasida aniq raqam ko'rsating.** «Rostdan o'chirasizmi?» yetarli emas —
«**3 ta biznes, 7 ta filial va 24 ta e'lon butunlay o'chadi. Qaytarib bo'lmaydi.**» kerak.
Raqamlarni `GET /v1/admin/business-owners/:id/businesses` dan olishingiz mumkin.

---

## 5. 🔒 Bloklash — qaytariladigan variant

Bu endpointlar **ilgari ham bor edi**, lekin biznes egasi uchun ta'siri kengaytirildi.

| Endpoint | Rol |
|---|---|
| `POST /v1/admin/students/:id/ban` · `{ "reason": "..." }` (majburiy) | `ADMIN` · `MODERATOR` |
| `POST /v1/admin/students/:id/unban` | `ADMIN` · `MODERATOR` |
| `POST /v1/admin/business-owners/:id/ban` · `{ "reason": "..." }` | `ADMIN` · `MODERATOR` |
| `POST /v1/admin/business-owners/:id/unban` | `ADMIN` · `MODERATOR` |

Javob: `200`, `result` — yangilangan `AdminStudentDto` / `AdminBusinessOwnerDto`
(`status: "BANNED"`).

**Bloklash nima qiladi:**

1. `status = BANNED`, `bannedAt = now()`, `banReason` yoziladi;
2. barcha refresh tokenlari **o'sha tranzaksiyada** bekor qilinadi — bloklangan hisob amal
   qiluvchi sessiya bilan qolib ketmasin;
3. login / refresh / Google / Apple — hammasi `403 ACCOUNT_BANNED`;
4. 🆕 **biznes egasi bo'lsa: uning barcha e'lonlari talaba feed'idan, qidiruvdan va xaritadan
   yo'qoladi.**

4-band yangi va u muhim edi. Ilgari bloklangan egasining chegirmalari feed'da qolib ketardi:
firibgar do'konni bloklaysiz, talabalar esa o'sha do'konga borishda davom etadi. Endi bunday emas.

**Muhimi — hech narsa o'zgartirilmaydi.** E'lonlar `ACTIVE` bo'lib qolaveradi, biznes `APPROVED`
bo'lib qolaveradi; ko'rinmaslik faqat egasining statusidan kelib chiqadi. Shuning uchun `unban`
hamma narsani **aynan avvalgi holida** qaytaradi — egasi ataylab pauza qilgan e'lon pauzada
qoladi, aktivi aktiv bo'ladi.

---

## 6. E'lonlarni o'chirish

Bu bo'lim **o'zgarmadi** — e'lon o'chirish avvalgidek yumshoq (arxivlash / `deletedAt`).

### 6.1 Biznes e'loni — `DELETE /v1/admin/listings/:id` · 🔑 **Admin / Moderator**

Owner tomonidagi `DELETE /v1/listings/:id` mantiqini ownership tekshiruvisiz qayta ishlatadi.

**Response:** `200`, `AdminListingDto` (`status: "ARCHIVED"`).

`MODERATOR` ga ham ruxsat: e'lonni olib tashlash — kundalik moderatsiya ishi, hisobni yopish emas.

### 6.2 Talaba e'lonlari · 🔑 **Admin / Moderator**

| Endpoint | Maqsad |
|---|---|
| `GET /v1/admin/student-listings` | ro'yxat + filtrlar |
| `GET /v1/admin/student-listings/:id` | detal |
| `DELETE /v1/admin/student-listings/:id` | o'chirish (yumshoq — `deletedAt`) |

**Ro'yxat filtrlari** (hammasi ixtiyoriy, AND bilan birikadi):

| Parametr | Ma'nosi |
|---|---|
| `q` | sarlavha yoki tavsif bo'yicha qidiruv (registrga bog'liq emas) |
| `kind` | `RENTAL` / `SERVICE` / `JOB` / `TASK` |
| `status` | vergul bilan: `status=ACTIVE,PAUSED`. **Berilmasa — hamma status**, `DRAFT` va `ARCHIVED` ham |
| `ownerId` | faqat shu talabaning e'lonlari |
| `includeDeleted` | `true` bo'lsa o'chirilganlar ham ko'rinadi (sukut: `false`) |
| `page` · `size` | 1-dan boshlanadi, `size` maksimal 100 |

Javob — odatdagi sahifa shakli: `{ items, page, size, total, hasNext }`. Tartib — yangisidan
eskisiga.

⚠️ Talaba e'lonlari **moderatsiyadan o'tmaydi** — yuborilgan zahoti chop etiladi. Ya'ni
`approve`/`reject` yo'q va bo'lmaydi ham; nomaqbul e'lonni olib tashlashning yagona yo'li — shu
`DELETE`.

⚠️ `GET /:id` **o'chirilgan e'lonni ham** qaytaradi — shikoyatdagi havoladan kelgan admin, egasi
oradan o'chirib yuborgan bo'lsa ham, uni ocha olishi kerak.

---

## 7. Umumiy qoidalar

**Envelope** — odatdagi `BaseResponse` ([`00-overview.md`](./00-overview.md)).

**Guard:** hammasi `AdminJwtGuard`. Rollar:

| Amal | Rol |
|---|---|
| Talaba / biznes egasini **o'chirish** | `ADMIN` |
| Talaba / biznes egasini **bloklash** | `ADMIN` · `MODERATOR` |
| E'lon o'chirish (ikkala tur) | `ADMIN` · `MODERATOR` |

**Ro'yxatlarda:** bundan keyin o'chirilgan hisoblar uchun filtr kerak emas — ular yo'q.
Bloklanganlar esa ko'rinadi; ularni ajratish uchun `?status=BANNED`.

> ℹ️ **Eski `DELETED` qatorlar.** Bu o'zgarishdan **oldin** yumshoq o'chirilgan hisoblar bazada
> `status = DELETED` bilan qolgan bo'lishi mumkin. Ular ro'yxatda ko'rinishda davom etadi (kira
> olmaydi — login `ACTIVE` dan boshqa hamma statusni to'sadi). Ularni butunlay yo'q qilish uchun
> shu hisoblarga oddiy `DELETE` yuboring — endi u haqiqiy o'chirish. `?status=DELETED` filtri
> aynan o'shalarni topish uchun qoldirilgan; yangi o'chirishlar bu statusni **hech qachon**
> yozmaydi.

---

## 8. Savollarga javoblar

### 8.1 O'chirilgan hisobni tiklash mumkinmi? — **Yo'q, umuman**

Ilgari "API orqali emas, lekin bazadan mumkin" degandik. **Endi bu ham to'g'ri emas** — qator
o'chgan, zaxira nusxa yo'q. Tugmadan oldin tasdiqlash oynasi **majburiy**, va unda «qaytarib
bo'lmaydi» deyilishi shart.

### 8.2 Sabab majburiymi? — **O'chirishda yo'q, bloklashda ha**

`ban` da `reason` majburiy: bu foydalanuvchi e'tiroz bildirishi mumkin bo'lgan hukm va sabab
`banReason` ustunida saqlanadi.

`delete` da `reason` ixtiyoriy va **hech qayerda saqlanmaydi** — saqlaydigan qator yo'q. U faqat
server logiga tushadi.

### 8.3 Biznes egasi o'chirilsa, bizneslari? — **Ular ham o'chadi**

Arxivlanmaydi — **o'chadi**: bizneslar, filiallar, e'lonlar, redemptionlar (§2). Bloklash esa
ularni faqat feed'dan yashiradi va `unban` bilan qaytaradi.

### 8.4 Foydalanuvchi o'zini o'chira oladimi? — **Hali yo'q**

Bu hujjat faqat admin o'chirishi haqida. Ilovadan o'z hisobini yopish — alohida ish.

### 8.5 GDPR-uslub anonimlashtirish? — **Kerak emas**

Ilgari bu "kelajakdagi ish" edi. Hard delete bilan u o'z-o'zidan hal bo'ladi: anonimlashtiradigan
ma'lumot qolmaydi. (Narxi — §2 dagi boshqalarning ma'lumoti ham ketishi.)

---

## 9. Frontend uchun xulosa

1. **Ikkita tugma bo'lsin, ikkitasi bir xil ko'rinmasin.** «Bloklash» — odatiy amal. «O'chirish» —
   qizil, alohida, tasdiqlashsiz ishlamaydigan.
2. **O'chirish javobi endi `result: null`.** Undan foydalanuvchi ma'lumotini o'qimang — ro'yxatni
   qayta yuklang.
3. **`409` endi kelmaydi.** Ikkinchi marta o'chirish `404` beradi.
4. **Tasdiqlash oynasi raqam ko'rsatsin**, ayniqsa biznes egasida: «N ta biznes, M ta e'lon
   butunlay o'chadi».
5. **Bloklangan biznes egasining e'lonlari endi feed'da ko'rinmaydi** — bu yangi xatti-harakat,
   admin panelda tushuntirilsin ("bloklash do'konni feed'dan vaqtincha olib qo'yadi").
6. **Shubha bo'lsa — bloklash.** Bloklashni qaytarish mumkin, o'chirishni yo'q.
