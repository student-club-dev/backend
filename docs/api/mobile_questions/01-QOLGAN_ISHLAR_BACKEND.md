# Qolgan ishlar — uchta topshiriq

2026-08-05 dagi beshta javobingiz (`01`–`05`) bo'yicha **klient tomoni to'liq bajarildi**:
yangi spec o'rnatildi, Kotlin klienti qayta generatsiya qilindi, bildirishnomalar bayrog'i
yoqildi, qidiruv `POST /search` ga o'tdi, `tokenType` va `GET /v1/calls/active` ulandi.

Bajarilgan hujjatlar o'chirildi. Bu papkada faqat **hali qilinmagani** qoldi — uchta ish.

| #   | Ish                                         | Kim     | Bloklaydimi                                          |
| --- | ------------------------------------------- | ------- | ---------------------------------------------------- |
| 1   | `albumSize` maydoni                         | backend | ✅ ha — bizda kod yozilmay turibdi                   |
| 2   | `UserProfileDto` ga `regionId`/`districtId` | backend | ⚠️ qisman — vaqtinchalik yechim bor                  |
| 3   | coturn (server, DNS, 443/TLS)               | ops     | ✅ ha — qo'ng'iroqning media qismi umuman sinalmagan |

---

## 1. `albumSize` — bizda kod yozib bo'lmaydi

`02-PUSH_CATALOG_RESPONSE.md` §7 da albomning birinchi xabariga `albumSize` qo'shishimizni
so'radingiz — «shunda matn darrov to'g'ri bo'ladi» (`📷 3 ta rasm`).

**Qo'sha olmaymiz, chunki maydon yo'q.** `albumSize` spec'da (`student-club.json`) na
`SendMessageDto` da, na WebSocket `message:send` payload'ida mavjud emas. Sizda esa global
`ValidationPipe` `forbidNonWhitelisted` bilan ishlaydi — buni o'zingiz
`04-CALLS_RESPONSE.md` da `studentId` misolida yozgansiz: «yuborilsa
`forbidNonWhitelisted` uni `422` bilan rad etadi».

Ya'ni maydonni bugun yuborsak natija «push matni yaxshilanadi» emas:

> **10 rasmli albom umuman yuborilmaydi** — har bir xabar `422` bilan qaytadi.

### Kerak

```jsonc
// SendMessageDto (REST) va WS `message:send` payload'i
{
  "albumId": "cmid_01H…",
  "albumSize": 10, // ← int32, ixtiyoriy, 2..10
}
```

- **Faqat albomning birinchi xabarida** yuboriladi (push aynan o'shanda ketadi).
- Ixtiyoriy: eski klient uni yubormaydi va hech narsa buzilmasligi kerak.
- `albumId` bo'lmasa e'tiborsiz qoldirilsin (yoki `422` — bizga farqi yo'q, biz uni
  yolg'iz yubormaymiz).
- Spec'ga chiqarilsin — biz uni generatsiya qilingan klientdan o'qiymiz.

### Qabul mezoni

- [ ] `albumSize` bilan yuborilgan albom xabari `422` bermaydi
- [ ] 10 rasmli albomga **1 ta push** ketadi va matni `📷 10 ta rasm`
- [ ] `albumSize` siz yuborilgan albom bugungidek ishlaydi (matn — birinchi rasmniki)

Bizda bu bir qatorlik ish: albomni yig'ayotgan joy o'lchamni allaqachon biladi.

---

## 2. `UserProfileDto` — manzil yoziladi, lekin qaytmaydi

`02-PUSH_CATALOG_RESPONSE.md` §4 bo'yicha profilga yashash manzilini qo'shdik: DB
migratsiyasi (`31.sqm`), tahrirlash ekranida viloyat/tuman tanlash, `PATCH
/v1/profile/me` ga yuborish. Ish tugadi va foydalanuvchi manzilni tanlay oladi.

Lekin:

| DTO                         | `regionId` / `districtId` |
| --------------------------- | ------------------------- |
| `UpdateProfileDto` (yozish) | ✅ bor                    |
| `UserProfileDto` (o'qish)   | ❌ **yo'q**               |

Ya'ni qiymat serverga ketadi va u yerdan **hech qachon qaytmaydi**.

### Bizdagi vaqtinchalik yechim

Qiymat local keshda saqlanadi va serverdan kelgan profil uni **ustidan yozmaydi**
(`ProfileRepositoryImpl.keepingLocalAddress()`). Busiz foydalanuvchi tanlagan tuman
«Saqlash» bosilgan zahoti ekrandan yo'qolardi.

Bu ikkita holatda ishlamaydi va ikkalasi ham haqiqiy:

1. ilova qayta o'rnatilsa yoki ma'lumot tozalansa — manzil ekranda yo'qoladi (serverda
   turibdi, lekin uni so'rab ololmaymiz);
2. ikkinchi qurilmada kirilsa — o'sha yerda manzil bo'sh ko'rinadi va foydalanuvchi uni
   qaytadan tanlaydi. Digest esa allaqachon ishlab turibdi, ya'ni foydalanuvchi «men buni
   kiritmagan edim-ku» degan holatga tushadi.

### Kerak

```jsonc
// UserProfileDto
"regionId":   { "type": "string", "nullable": true, "example": "TOSHKENT_SHAHRI" },
"districtId": { "type": "string", "nullable": true, "example": "CHILONZOR" }
```

### Qabul mezoni

- [ ] `PATCH /v1/profile/me` bilan yozilgan manzil `GET /v1/profile/me` da qaytadi
- [ ] To'ldirilmagan profilda ikkalasi ham `null` (kalit bo'lmasligi ham mayli)

Sizda javobga ikkita maydon qo'shish, bizda — `keepingLocalAddress()` ni o'chirish va
`toDomain()` ga ikki qator qo'shish.

---

## 3. coturn — o'zgarishsiz kutamiz

Bu yagona **tashqi bog'liqlikka ega** ish va u navbatni kutmasligi kerak edi. Holat
o'zgarmadi: `GET /v1/calls/ice-servers` hamon `503` qaytaradi, ya'ni qo'ng'iroqning media
qismini na siz, na biz haqiqiy sinaganmiz.

To'liq tartib o'zingizning `docs/ops/coturn-runbook.md` faylingizda. Bizning tomondan
yodda tutilishi kerak bo'lgan uchtasi:

1. **Alohida IP** — `api.studentclub.uz` da nginx 443 ni band qilgan. `turn.studentclub.uz`
   → o'sha alohida IP, **Cloudflare orqasida emas** (TURN — HTTP emas, CDN uni uzatmaydi).
2. **443/TLS majburiy** — foydalanuvchilarimiz talabalar, universitet Wi-Fi'sida UDP va
   3478 yopiq. Busiz nuqson **testda ko'rinmaydi**: uy Wi-Fi'sida hammasi ideal ishlaydi,
   universitetdan qilingan qo'ng'iroq esa «Ulanmoqda…» da qotib `FAILED` bo'ladi.
3. **`certbot --deploy-hook "systemctl reload coturn"`** — usiz 90 kundan keyin faqat
   `turns:443` o'ladi, ya'ni faqat universitetdagilar uchun.

### ⚠️ 2026-08-05, kechqurun: qo'ng'iroq **sinab ko'rildi** va aynan shu yerda to'xtadi

Qo'ng'iroq jiringladi, javob berildi — ya'ni signalizatsiya (WebSocket) va
`GET /v1/calls/ice-servers` ishlayapti. Lekin ekran **«Ulanmoqda…»** da qotib qoldi, media
umuman ulanmadi.

Tashqaridan o'lchandi:

```
turn.studentclub.uz          → DNS yozuvi YO'Q
turn.studentclub.uz:443      → ulanib bo'lmadi
turn.studentclub.uz:3478     → ulanib bo'lmadi
GET /v1/calls/ice-servers    → 401 (endpoint tirik, qo'ng'iroq yoqilgan)
```

Ya'ni `CALLS_ENABLED` yoqilgan, coturn esa hali yo'q.

**Eng muhim oqibat — buni bilib qo'ying:** sizning qoidangiz bo'yicha juftlik **birinchi
marta** gaplashayotganda `relayOnly = true` majburlanadi (maxfiylik: TURN'siz chaqirilgan
odam javob bermasa ham chaquvchining IP'sini olardi). Klient bunga bo'ysunadi va
`iceTransportPolicy = RELAY` bilan **faqat relay** nomzod yig'adi. TURN yo'q ekan, bunday
nomzod umuman paydo bo'lmaydi.

Demak hozir **har qanday ikki foydalanuvchining BIRINCHI qo'ng'irog'i hech qachon
ulanmaydi** — ular bir xonada, bitta Wi-Fi'da turgan bo'lsa ham. Klientda buni aylanib
o'tib bo'lmaydi: aylanib o'tish o'sha maxfiylik himoyasini o'chirish degani.

Yana bir nozik joy: klient TURN bor-yo'qligini `ice-servers` javobidagi `turn:`/`turns:`
qatoriga qarab biladi. Bu **da'vo**, fakt emas — mavjud bo'lmagan hostga ishora qiluvchi
`turn:` qatori qaytarilsa, klient relay'ni majburlaydi va qo'ng'iroq kafolatlangan tarzda
yiqiladi. Shuning uchun coturn tayyor bo'lmaguncha `ice-servers` javobiga `turn:` qatorini
**qo'shmang** — STUN'ning o'zi qolsin, hech bo'lmasa bir tarmoqdagi qurilmalar gaplashadi.

### Klient tomoni tayyor

`TURN_HOST` + `TURN_STATIC_SECRET` + `CALLS_ENABLED=true` qo'yilgan zahoti ishlaydi —
klientda hech narsa o'zgartirilmaydi.

⚠️ **`CALLS_ENABLED=true` qilishdan oldin ayting** — o'sha kuni ikkita real qurilmada
birga sinaymiz. Deploy tartibi o'zgarmadi: coturn → yangi mobil versiya tarqaladi →
`CALL` xabar yozadigan deploy → bayroq.

---

## Javob talab qilinmaydigan uchta qaror

Savollaringizga javob (bular yopilgan, qayta ochilmaydi):

1. **Talaba e'lonlari moderatsiyadan o'tmaydi.** Katalogdagi №6/№7 qatorlarini
   («moderatsiyadan o'tdi» / «rad etildi») **butunlay olib tashlang** — ular hech qachon
   yozilmaydi. Moderatsiya talabaning e'lonini soatlab kutdirardi, e'lon esa ko'pincha shu
   kunga tegishli. Shikoyat (`POST /v1/reports`) reaktiv nazorat uchun yetarli.
2. **Kurs yili bo'yicha ish mosligi kerak emas.** `JobDetails` ga `courseYearFrom/To`
   qo'shmang: e'lon beruvchi «kurs» bilan emas, «tajriba» va «smena» bilan o'ylaydi —
   maydon bo'sh qolib, filtr hech nimani filtrlamasdi. Universitet **YOKI** tuman mezoni
   yetarli.
3. **`unreadCount` uchun WebSocket hodisasi (`01` §4) kerak emas** — ekran u holda ham
   to'liq ishlaydi.

---

## Biz ataylab boshqacha qilgan uchta joy

Sizdan hech narsa talab qilmaydi — shunchaki bilib qo'ying, chunki javobingizdagi
maslahatga zid.

### `details` uchun `oneOf` — hali ham `JsonObject`

`05-…_RESPONSE.md` §5 da `cleanSwagger` ning 12-qadamini olib tashlashni so'radingiz.
To'rtta `*DetailsDto` chindan ham spec'da paydo bo'ldi va ular endi generatsiya qilinadi —
rahmat.

Lekin qadamning o'zi **qoldirildi**: olib tashlab sinaganimizda generator `oneOf` dan
to'rttala variantni **bitta yassi klassga** qo'shib yubordi va `kind` enum'ida faqat
oxirgi variantning qiymati — `JOB` — qoldi. Ya'ni `TASK`/`RENTAL`/`SERVICE` e'loni kelgan
zahoti butun ro'yxat javobi pars bo'lmasdi. Bu — `MessageType` ga `CALL` qo'shilganda
bo'lgan nuqsonning aynan o'zi.

### `complete` tanasini **doim** yuboramiz

`{ totalBytes, parts }` hajmi ma'lum sessiyada ham yuboriladi, garchi ixtiyoriy bo'lsa
ham — sizning §2 dagi tushuntirishingizning o'zi sabab: teshiksiz, lekin erta to'xtagan
qator tugagan yuklashdan farq qilmaydi. Bizda `parts` har doim ma'lum.

⚠️ **Oqimli sessiyaning o'zi (`init` `totalBytes` siz) hali ulanmagan** — transport tayyor,
lekin video siqilayotgan paytda yuborish uchun Android'dagi kodlash quvuri qayta
qurilishi kerak. Bu bizning tomonda va alohida ish.

### `tokenType` doim aniq yuboriladi

Server sukutiga (`IOS → APNS`) tayanmaymiz: u serverning ichki qarori va o'zgarsa,
tarqatilgan ilova o'z tokenini adreslay olmaydigan xizmatga topshirib qo'yardi.
Android → `FCM`, iOS → `APNS`. PushKit (`APNS_VOIP`) hali yo'q — u CallKit bilan keladi.

### `GET /v1/calls/active` nimaga ishlatilyapti

§4 dagi asosiy stsenariy (VoIP push → CallKit) iOS'da hali yo'q, lekin endpoint bugundan
foydali: socket ulanganda va ilova ochilganda **osilib qolgan jiringlashni yopadi**
(Android'dagi to'liq ekranli bildirishnoma ilova jarayonidan uzoq yashaydi).

⚠️ Bu tekshiruv faqat **yopadi**, hech qachon ochmaydi: javob berish uchun SDP taklifi
kerak, u esa faqat `call:incoming` bilan keladi. Shuning uchun `ActiveCallDto` ga offer
qo'shish **shart emas**.
