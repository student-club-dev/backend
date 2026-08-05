# 15 — O'chirish (talaba, biznes egasi, e'lonlar)

> ✅ **Qurildi.** To'rtala endpoint ham yozildi va testdan o'tdi.
>
> ⚠️ **Lekin production'da hali yo'q** — deploy qilinishi kerak. Frontend agenti tekshirganda `404`
> olgan bo'lsa, sabab shu edi: kod bor, deploy yo'q. Deploydan keyin `/docs` (Swagger) da
> ko'rinadi.
>
> §7 dagi savollarga javob berildi va shaklga kiritildi — pastda har birining tagida yozilgan.

---

## 1. Maqsad va bugungi holat

Admin panelga to'rt narsani o'chirish kerak: **talaba**, **biznes egasi**, **biznes e'loni**,
**talaba e'loni**.

Bugun mavjudi:

| Nima | Bor | Yo'q |
|---|---|---|
| Talaba | ro'yxat, detal, yaratish, tahrirlash, ban / unban | ✅ `DELETE /v1/admin/students/:id` |
| Biznes egasi | ro'yxat, detal, bizneslari, yaratish, tahrirlash, ban / unban | ✅ `DELETE /v1/admin/business-owners/:id` |
| Biznes e'loni | ro'yxat, detal, stats, tahrirlash, approve / reject | ✅ `DELETE /v1/admin/listings/:id` |
| **Talaba e'loni** | ✅ **yangi**: ro'yxat + detal | ✅ `DELETE /v1/admin/student-listings/:id` |

Oxirgi qator eng muhimi edi: talaba e'lonlari uchun `/v1/admin/*` da **bitta ham endpoint yo'q**
edi. Endi ro'yxat, detal va o'chirish — uchalasi ham bor (§5.2).

---

## 2. ⚠️ Eng muhim qaror: o'chirish = arxivlash, yo'q qilish emas

**Talab: hisoblar va e'lonlar hech qachon bazadan haqiqiy `DELETE` qilinmasin.** Sababi texnik va u
og'ir.

Sxemada **`Student` ga 21 ta jadval `onDelete: Cascade`** bilan bog'langan. Talabani haqiqatan
o'chirsak, u bilan birga quyidagilar **butunlay yo'qoladi**:

```
Message · Conversation a'zoligi · Call · CallStat · Story · StoryView
Report · Connection · Block · Redemption · StudentFavorite
MediaAsset · ProfilePhoto · UploadSession · DeviceToken · Notification
StudentListing · StudentListingView · OAuthAccount · RefreshToken
```

Ikkitasi ayniqsa xavfli:

- **`Message`** — talabaning xabarlari **boshqa odamlarning suhbatlarida** ham yashaydi. Uni
  o'chirsak, aybsiz foydalanuvchi suhbat tarixining yarmini yo'qotadi va bunga hech qanday
  ogohlantirish bo'lmaydi.
- **`Report`** — o'sha odam **ustidan yozilgan shikoyatlar** ham o'chadi. Ya'ni qoidabuzarni
  o'chirish uning aybi haqidagi yagona yozuvni ham yo'q qiladi. Moderatsiya uchun bu qabul
  qilib bo'lmaydigan holat.

Shuning uchun:

> **Admin "o'chirish" tugmasi `status = DELETED` yozadi va sessiyalarni bekor qiladi.**
> Qatorlar joyida qoladi.

Bu yangi ixtiro emas: `StudentStatus` va `BusinessOwnerStatus` enumlarida **`DELETED` qiymati
allaqachon bor** (`schema.prisma`), shunchaki hech kim yozmaydi. Sxema buni oldindan ko'zda tutgan.

### `DELETED` va `BANNED` farqi

Ikkalasi ham kirishni to'sadi. Farqi **niyatda**, va u UI'da ko'rinishi kerak:

| | `BANNED` | `DELETED` |
|---|---|---|
| Ma'nosi | vaqtinchalik jazo | hisob yopildi |
| Qaytarib bo'ladimi | ✅ `unban` bor | ❌ **yo'q** — bir tomonlama |
| Sabab yoziladimi | ✅ `banReason` majburiy | ixtiyoriy (`reason`) |
| Ro'yxatlarda | ko'rinadi (filtr bilan) | odatiy holda **yashiriladi** |

Agar sizga faqat "kirolmasin" kerak bo'lsa — **`ban` allaqachon bor**, yangi endpoint kerak emas.
O'chirish — bu boshqa narsa: "bu hisob endi mavjud emas" degani.

---

## 3. Talabani o'chirish

### `DELETE /v1/admin/students/:id` · 🔑 **Admin**

⚠️ `ADMIN` roli, `MODERATOR` emas — bu qaytarilishi qiyin amal.

**Request:** tana ixtiyoriy.

```jsonc
{ "reason": "Foydalanuvchi so'rovi bo'yicha" }   // ixtiyoriy, audit uchun
```

**Response:** `200`, `result` — yangilangan `AdminStudentDto` (`status: "DELETED"`).

**Logika:**

1. `status = DELETED`, `deletedAt = now()`;
2. barcha refresh tokenlari bekor qilinadi — **bitta tranzaksiyada**, xuddi `ban` dagidek
   (`admin-student-write.prisma.repository.ts:51`). Aks holda o'chirilgan hisob amal qiluvchi
   sessiya bilan qolib ketadi;
3. qurilma tokenlari (`DeviceToken`) o'chiriladi — o'chirilgan hisobga push ketmasin;
4. uning **talaba e'lonlari** `ARCHIVED` ga o'tadi — feed'da qolib ketmasin.

**Xatolar:** `404 STUDENT_NOT_FOUND` · `409` — allaqachon `DELETED`.

### Nima **o'chmaydi** (va nega)

| Nima | Nega qoladi |
|---|---|
| Xabarlar | boshqa odamning suhbat tarixi |
| Shikoyatlar (u ustidan va u yozgan) | moderatsiya yozuvi |
| Qo'ng'iroq tarixi | ikkinchi tomonning tarixi |
| Redemption tarixi | biznesning hisoboti |

Frontend'da bu ko'rinsin: o'chirilgan talabaning profili ochilganda "hisob yopilgan" holati
ko'rsatilsin, lekin uning tarixi mavjudligi bilinsin.

---

## 4. Biznes egasini o'chirish

### `DELETE /v1/admin/business-owners/:id` · 🔑 **Admin**

Talaba bilan bir xil: `status = DELETED` + sessiyalar bekor. **Va qo'shimcha** — bitta
tranzaksiyada:

- uning **barcha bizneslari** → `ARCHIVED`;
- o'sha bizneslarning **barcha e'lonlari** → `ARCHIVED`.

Sababi: kira olmaydigan egasi bor biznes feed'da chegirma taklif qilib turmasin. Talaba borib, uni
hech kim bajarmasa — muammo aybsiz talabada bo'ladi.

⚠️ **Frontend uchun muhim:** tasdiqlash oynasida buni ko'rsating — «N ta biznes va M ta e'lon ham
arxivlanadi». Admin buni bilmasdan bosmasin.

**Response:** `200`, `AdminBusinessOwnerDto` (`status: "DELETED"`).

---

## 5. E'lonlarni o'chirish

### 5.1 Biznes e'loni — `DELETE /v1/admin/listings/:id` · 🔑 **Admin / Moderator**

Bu eng oson: **owner tomonda allaqachon bor** (`DELETE /v1/listings/:id` → `ARCHIVED`), admin
varianti o'sha mantiqni ownership tekshiruvisiz qayta ishlatadi — xuddi `approve`/`reject` ning
bugungi qurilishi kabi (`AdminListingsWriteService`).

**Response:** `200`, `AdminListingDto` (`status: "ARCHIVED"`).

`MODERATOR` ga ham ruxsat: e'lonni olib tashlash — kundalik moderatsiya ishi, hisobni yopish emas.

### 5.2 Talaba e'lonlari — **butunlay yangi surface** · 🔑 **Admin / Moderator**

Bu yerda ilgari **hech narsa yo'q edi**. Endi uchtasi ham bor:

| Endpoint | Maqsad |
|---|---|
| `GET /v1/admin/student-listings` | ro'yxat + filtrlar |
| `GET /v1/admin/student-listings/:id` | detal |
| `DELETE /v1/admin/student-listings/:id` | o'chirish (soft — `deletedAt`) |

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

⚠️ **Nega bu boshqalaridan muhimroq edi:** talaba e'lonlari **moderatsiyadan o'tmaydi** — yuborilgan
zahoti chop etiladi (`student-listings.service.ts:23`). Ya'ni `approve`/`reject` yo'q va bo'lmaydi
ham. Nomaqbul e'lonni olib tashlashning **umuman yo'li yo'q edi**; endi bor.

⚠️ `GET /:id` **o'chirilgan e'lonni ham** qaytaradi — shikoyatdagi havoladan kelgan admin, egasi
oradan o'chirib yuborgan bo'lsa ham, uni ocha olishi kerak.

---

## 6. Umumiy qoidalar

**Envelope** — odatdagi `BaseResponse` ([`00-overview.md`](./00-overview.md)):

```jsonc
{ "success": true, "status": 200, "code": null, "message": "OK", "result": {…}, "error": null }
```

**Guard:** hammasi `AdminJwtGuard`. Rollar:

| Amal | Rol |
|---|---|
| Talaba / biznes egasini o'chirish | `ADMIN` |
| E'lon o'chirish (ikkala tur) | `ADMIN` + `MODERATOR` |

**Xato kodlari:**

| Holat | `error.code` | Status |
|---|---|---|
| Topilmadi | `STUDENT_NOT_FOUND` / `BUSINESS_OWNER_NOT_FOUND` / `LISTING_NOT_FOUND` | 404 |
| Allaqachon o'chirilgan | `INVALID_STATUS_TRANSITION` | 409 |
| Rol yetmaydi | `FORBIDDEN` | 403 |

**Ro'yxatlarda `DELETED`:** odatiy holda **yashirilsin**. Ko'rish uchun aniq filtr bo'lsin
(`?status=DELETED`) — aks holda o'chirilgan hisoblar oddiy ro'yxatni to'ldirib yuboradi.

---

## 7. Savollarga javoblar

### 7.1 O'chirilgan hisobni tiklash mumkinmi? — **Yo'q**

`restore` endpointi **ataylab yozilmadi**. UI'da tugma bosilishidan oldin
**«bu amalni qaytarib bo'lmaydi»** deb ogohlantirish va tasdiqlash oynasi bo'lishi shart.

(Texnik jihatdan qator joyida turgani uchun bazadan tiklash mumkin, lekin bu API orqali emas.)

### 7.2 Sabab majburiymi? — **Yo'q, ixtiyoriy**

`{ "reason": "..." }` — 500 belgigacha, ixtiyoriy. `ban` da sabab majburiy, chunki u foydalanuvchi
e'tiroz bildirishi mumkin bo'lgan hukm. Yopish esa odatda ma'muriy — egasi so'ragan yoki dublikat —
va matn talab qilish faqat «asdf» chiqaradi.

Yozilsa, u qatorda saqlanadi va support keyin o'qiy oladi. Hisobni qaytarib bo'lmagani uchun bu —
nima uchun yopilgani haqidagi **yagona doimiy yozuv**.

### 7.3 Biznes egasi o'chirilsa, bizneslari? — **Ular ham ARCHIVED**

Bitta tranzaksiyada: hisob yopiladi, sessiyalar bekor qilinadi, **bizneslari va ulardagi barcha
e'lonlar `ARCHIVED`** ga o'tadi.

Sababi: kira olmaydigan egasi bor biznes feed'da chegirma taklif qilib turmasin. Talaba borib,
uni hech kim bajarmasa — muammo aybsiz talabada bo'ladi.

### 7.4 Foydalanuvchi o'zini o'chira oladimi? — **Hali yo'q**

Bu hujjat faqat admin o'chirishi haqida. Ilovadan o'z hisobini yopish — alohida ish, hozircha
rejada yo'q.

### 7.5 Haqiqiy o'chirish (GDPR-uslub)? — **Hali yo'q**

Shaxsiy ma'lumotni anonimlashtirish (ism/telefon/email o'chirilib, xabarlar «O'chirilgan
foydalanuvchi» ostida qolishi) alohida, kattaroq ish. Kerak bo'lsa ayting.

---

## 8. Frontend uchun xulosa

- To'rtala endpoint ham **yozildi**; production'ga deploy qilingach `/docs` da ko'rinadi;
- "O'chirish" **yo'q qilish emas, yopish** — UI matni shunga mos bo'lsin;
- **Tiklash yo'q** — tugmadan oldin tasdiqlash oynasi majburiy;
- Biznes egasini o'chirish uning **bizneslarini ham arxivlaydi** — buni tasdiqlash oynasida
  ko'rsating («N ta biznes va M ta e'lon ham arxivlanadi»);
- Agar sizga kerak bo'lgani "kira olmasin" bo'lsa — **`ban`** o'sha ish uchun, va u qaytariladi.
