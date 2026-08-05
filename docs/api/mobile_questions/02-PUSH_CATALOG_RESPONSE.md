# Push katalogi — backend javobi

`02-PUSH_CATALOG_BACKEND.md` **asosan bajarildi**. §8 dagi 8 ta mezondan **6 tasi to'liq**, bittasi
04-hujjatga tegishli, bittasi — sizning tomoningizda.

Va **3 ta qator qilinmadi** — chunki ular uchun backendda hodisa manbai yo'q. Pastda har biri
alohida, sababi bilan. Bu eng muhim qism: taxmin qilmasdan o'qing.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.

---

## 0. Bir qarashda — katalogning bugungi holati

| # | Hodisa | Push | Ro'yxat | Holat |
|---|---|---|---|---|
| 1 | Yangi xabar | ✅ | ✅ | **tayyor** |
| 2 | Albom (10 rasm) | ✅ 1 ta | ✅ 1 ta | **tayyor**, lekin matn `📷 N ta rasm` emas — §2 |
| 3 | Javobsiz qo'ng'iroq | ✅ | ✅ | **tayyor** (`type: CHAT`, §7.1 javobi) |
| 4 | Bog'lanish so'rovi | ✅ | ✅ | **tayyor** |
| 5 | So'rov qabul qilindi | ✅ | ✅ | **tayyor** |
| 6 | E'lon moderatsiyadan o'tdi | ❌ | ❌ | **manba yo'q** — §3 |
| 7 | E'lon rad etildi | ❌ | ❌ | **manba yo'q** — §3 |
| 8 | E'lon muddati tugayapti | ✅ | ✅ | **tayyor**, umrida bir marta |
| 9 | Yangi mos ish e'loni | ✅ digest | ✅ | **tayyor** — mezon §4 da |
| 10 | Chegirma tugayapti | ✅ | ✅ | **tayyor** (saqlangan chegirmalar bo'yicha) |
| 11 | Tizim xabari | ⚠️ ixtiyoriy | ✅ | **tayyor** — admin endpoint |
| 12 | Profilga oid | ✅ | ✅ | **tayyor** — admin endpoint |
| — | Kiruvchi qo'ng'iroq (VoIP) | — | — | **04-hujjat** |

---

## 1. Eng muhimi: endi bitta manba bor

`NotificationDispatcher` — barcha bildirishnomalar o'tadigan **yagona** nuqta. U bitta amalda ham
ro'yxat qatorini yozadi, ham push yuboradi. §1.1 dagi «telefonda ko'ringan xabar ro'yxatdan
topilmasa — bu nosozlik» qoidasi shu bilan kafolatlanadi: ikkisi ajralib qololmaydi, chunki ular
bitta kod yo'lida.

Yetkazish siyosati faqat shu yerda:

1. **Qator har doim yoziladi** — quyidagi hech narsa foydalanuvchini tarixidan mahrum qilolmaydi;
2. hodisa push so'ramasa — push yo'q (§3.4);
3. **soket ochiq bo'lsa** — push yo'q (§1.2, butun katalogga);
4. **tungi jimlik** va hodisa shoshilinch bo'lmasa — 08:00 ga suriladi (§5.3);
5. aks holda — badge, guruhlash kalitlari va §2 konverti bilan yuboriladi.

⚠️ Redis javob bermasa dispetcher foydalanuvchini **oflayn** deb hisoblaydi va push yuboradi.
Ikkilangan bildirishnoma — bir lahzalik bezovtalik; yo'qolgani — umuman bilinmagan xabar.

---

## 2. `data` konverti (§2) — to'liq bajarildi

```jsonc
{
  "kind":           "CHAT",       // = ro'yxatdagi `type`
  "notificationId": "clx7f2…",    // §2.1 — o'qildi deb belgilash uchun
  "targetType":     "CHAT",       // target bo'lmasa — maydon YO'Q
  "targetId":       "cnv_01H…",   // id kerak bo'lmasa — maydon YO'Q
  "conversationId": "cnv_01H…"    // ⚠️ chat va qo'ng'iroqda saqlanib qoldi
}
```

- **Hamma qiymat `string`** — testda tekshiriladi.
- Qiymati yo'q kalit **umuman yuborilmaydi** (bo'sh yoki `"null"` emas).
- `conversationId` **saqlanib qoldi** — bugungi ilova faqat shuni o'qiydi. Test bor.
- Chatning eski kalitlari (`senderName`, `senderAvatarUrl`, `messageType`, `senderId`, `albumId`)
  ham joyida. Ular konvertni **ustidan yoza olmaydi** — buni ham test tekshiradi.

### Guruhlash (§4.1) — jadvalingizdek

| Nima | Android `collapse_key` | iOS `aps.thread-id` |
|---|---|---|
| Chat | `chat:<conversationId>` | `<conversationId>` |
| Qo'ng'iroq | `call` | `call:<conversationId>` |
| Bog'lanish | `connection` | `connection` |
| E'lon (o'z e'lonim) | `my-listings` | `my-listings` |
| Tavsiya (ish, chegirma) | `feed` | `feed` |
| Tizim | `system` | `system` |

⚠️ **`apns-collapse-id` qo'yilmadi va bu ataylab.** iOS'da `thread-id` **guruhlaydi**, Android'da
`collapse_key` **almashtiradi**. Sizning jadvalingiz aynan shu ikkisini so'ragan. Agar iOS'da ham
almashtirish kerak bo'lsa ayting — lekin u holda foydalanuvchi ko'rmagan xabarlar tray'dan
yo'qoladi.

### Badge (§4.2) — formulaga bitta tuzatish kiritdik

```
badge = o'qilmagan xabarlar + o'qilmagan bildirishnomalar (CHAT turidan tashqari)
```

⚠️ **`CHAT` qatorlari qo'shilmaydi, va bu majburiy tuzatish edi.** §4.2 formulasi ikkala to'plam
kesishmaydi deb faraz qiladi — aslida kesishadi: chat push'i `CHAT` qatorini yozadi, o'sha xabarni
esa xabarlar hisobi allaqachon sanaydi. Ya'ni bitta xabar uchun badge **2** ko'rsatardi.

Va u shunchaki bir marta ko'p sanamasdi: qator faqat `POST /v1/notifications/read` bilan
tozalanadi, uni esa `NOTIFICATIONS_REMOTE_ENABLED = false` bo'lgan klient **hech qachon
chaqirmaydi**. Natijada badge har xabardan keyin o'sib borardi va **hech qachon nolga
qaytmasdi** — bayroqni yoqmaguningizcha.

Javobsiz qo'ng'iroq ham `CHAT` turida va u ham allaqachon o'qilmagan xabar sifatida sanaladi, ya'ni
xuddi shu sabab bilan to'g'ri tushib qoladi.

⚠️ **Yana bir nuance:** formulangizda `unreadConversations` yozilgan, lekin matnda «bugun badge =
o'qilmagan **xabarlar** soni» deb turibdi. Biz **xabarlar** sonini oldik — bu bugun ishlayotgan va
`GET /v1/conversations/unread-count` qaytaradigan raqam. Suhbatlar sonini xohlasangiz ayting.

Ro'yxatdagi `unreadCount` (qo'ng'iroq ikonkasi) esa **hamma turni** sanaydi — u boshqa savol.

---

## 3. ⛔ №6 va №7 qilinmadi — moderatsiya umuman yo'q

Bu taxmin emas, kodda yozilgan fakt:

> `src/modules/student-listings/application/student-listings.service.ts:23`
> «`REJECTED`/`PENDING_REVIEW` are **contract-only states this phase never writes**»

Talaba e'loni **yuborilgan zahoti chop etiladi** — `PENDING_REVIEW` da turishi yo'q
(`STUDENT_LISTINGS_BACKEND.md` §10 Q2 shunday kelishilgan). Ya'ni:

- «moderatsiyadan o'tdi» degan hodisa **hech qachon sodir bo'lmaydi**;
- «rad etildi» ham — hech kim rad etmaydi;
- mavjud yagona moderatsiya — **biznes** e'lonlari uchun, va uning egasi `BusinessOwner`,
  bizning `notifications` jadvali esa faqat `students` ga murojaat qila oladi.

Shuning uchun bu ikki qator uchun kod yozilmadi: chaqiruvchisi bo'lolmaydigan funksiya yozish —
o'lik kod.

**Sizdan kerak:** talaba e'lonlari moderatsiyadan o'tsinmi? Agar ha — bu alohida ish (status
mashinasi + admin ekrani), va u tayyor bo'lgach bu ikki qator bir soatda ulanadi (katalog allaqachon
`MY_LISTINGS` ga tayyor).

---

## 4. №9 — «mos» nima degani (§7.2 savolingizga javob)

Siz mezonsiz digest spam bo'lishini yozgansiz — to'g'ri. Mezon shunday belgilandi:

Yangi `JOB` e'loni talabaga **mos**, agar:

- e'lonning `universityId` si talabanikiga teng, **YOKI**
- e'lonning nuqtasi talaba yashaydigan **tumanda** (tuman noma'lum bo'lsa — viloyatda).

**VA emas, YOKI** — ataylab. VA bo'lsa profili to'liq bo'lmagan hech kim hech narsa olmaydi.

⚠️ **Kurs yili ishtirok etmaydi va etolmaydi.** Talabada `courseYear` bor, lekin **ish e'lonida
kursga oid talab yo'q** (`JobDetails` da `experience`, `ageFrom`/`ageTo` bor, kurs yo'q). Uni
solishtirish uchun e'lon tomonda maydon yo'q. Kerak bo'lsa `JobDetails` ga `courseYearFrom/To`
qo'shamiz — ayting.

⚠️ **Signali yo'q talaba hech narsa olmaydi.** Bu nuqson emas, aynan siz aytgan qoida: mezon yo'q →
digest yo'q.

### Sizdan kerak: profilda manzil

`Student` ga `regionId` / `districtId` qo'shildi va `PATCH /v1/profile/me` orqali yoziladi:

```jsonc
{ "regionId": "TOSHKENT_SHAHRI", "districtId": "CHILONZOR" }
```

Id lar — e'lon geo katalogi bilan **bir xil fazoda**. FK emas, ya'ni katalogingiz bizning seed'dan
oldinda ketsa ham qabul qilinadi.

**Ilova bu maydonlarni to'ldirmaguncha geo qismi hamma uchun `null`** va moslik faqat universitet
bo'yicha ishlaydi. Profil ekraniga qo'shsangiz — digest to'liq ishlaydi.

### Chastota

- **Kuniga bitta push**, Toshkent vaqti bilan **09:00** da (jimlikdan bir soat keyin).
- 1 ta e'lon → `Yangi ish e'loni` + sarlavha, `targetType: LISTING`.
- 2+ → `<N> ta yangi ish e'loni`, **`target: null`** (ro'yxat ochiladi) — §5.1 dagidek.
- Ro'yxatga esa **har biri alohida** yoziladi.

---

## 5. Chastota va jimlik — bajarildi

### §5.2 — muddat eslatmasi umrida bir marta

`notification_dedup` jadvali: har yuborish avval **da'vo qilinadi** (primary key ustida insert), va
faqat da'voni yutgan qator bildirishnoma chiqaradi.

Nega jadval, Redis emas: sweep har soat ishlaydi, oyna 3 kun. Ledger'siz talaba bitta e'lon haqida
**~70 marta** ogohlantiriladi. Redis flush bo'lsa «umrida bir marta» → «har deploydan keyin bir
marta» ga aylanadi. Bu ikki replikada ham xavfsiz — da'voni baza hal qiladi, lock kerak emas.

### §5.3 — tungi jimlik

- **22:00–08:00 Toshkent** (UTC+5, DST yo'q — shuning uchun tz kutubxonasi kerak emas).
- Istisno: **chat, qo'ng'iroq, bog'lanish** — ular jonli muloqot.
- Ushlab qolingan push **yo'qolmaydi**: `notifications.push_deferred_until` ga yoziladi va har 10
  daqiqada ishlaydigan flush uni 08:00 dan keyin yuboradi.
- Har 10 daqiqada, kuniga bir marta emas: aks holda bitta deploy yoki bitta muvaffaqiyatsiz tick
  butun kechani yo'qotardi.
- **Ro'yxat qatori esa darhol yoziladi** — jimlik faqat push'ga tegishli.

Agar foydalanuvchi tunda ilovaga kirsa, ertalabki flush unga push yubormaydi (qayta tekshiradi).

---

## 6. №11 / №12 — admin endpoint

Siz «admin panelida `sendPush: true` deb belgilansin» degandingiz. Endpoint:

```
POST /v1/admin/notifications        (ADMIN roli, MODERATOR emas)
{
  "studentIds": ["clx…", "clx…"],   // 1..500
  "title": "Ilova yangilandi",
  "body": "…",
  "kind": "ANNOUNCEMENT",           // yoki "PROFILE"
  "sendPush": false                 // sukut bo'yicha FALSE
}
```

- `ANNOUNCEMENT` — `target: null`, **sukut bo'yicha push yo'q** (§3.4 sababi bilan).
- `PROFILE` — `target: PROFILE`, **doim push** (bu marketing emas, o'z hisobi haqida).
- Ikkalasi ham tungi jimlikka bo'ysunadi.
- «Hammaga yubor» bayrog'i **ataylab yo'q** — ro'yxat qo'lda tuzilsin.

---

## 7. ⚠️ №2 — `📷 N ta rasm` yozib bo'lmaydi

Talab bajarildi: 10 ta rasmga **1 ta push, 1 ta qator**. Lekin matn `📷 N ta rasm` emas, birinchi
rasmning o'z matni (`📷 Rasm`).

Sabab: push aynan **birinchi** rasm kelganda yuboriladi, o'sha paytda albomda 1 ta element bor.
Ilova albom o'lchamini yubormaydi — `SendMessageDto` da faqat `albumId` bor.

**Sizdan kerak:** albomning **birinchi** xabariga `albumSize` qo'shsangiz, matn darrov to'g'ri
bo'ladi. Yoki albom tugaganini bildiradigan signal.

---

## 8. §8 mezonlari bo'yicha

- [x] §3 dagi har bir qator — **9/12**, qolgan 3 tasi §3 va §7 da izohlangan
- [x] `data` konverti §2 dagidek
- [x] `conversationId` chat va qo'ng'iroqda saqlanib qoldi
- [x] `collapse_key` / `thread-id` §4.1 jadvalidagidek
- [x] Tavsiyalar kuniga bittadan oshmaydi, muddat eslatmasi bir marta
- [x] 22:00–08:00 da faqat chat/qo'ng'iroq/bog'lanish
- [ ] VoIP kanalida faqat qo'ng'iroq — **04-hujjat**, hali qilinmadi
- [ ] `student-club.json` — sizning tomoningizda

---

## 9. Sizdan kutilayotgani

| # | Ish | Nima uchun |
|---|---|---|
| 1 | Profil ekraniga `regionId`/`districtId` | №9 ning geo yarmi ishlashi uchun |
| 2 | Albomning 1-xabariga `albumSize` | №2 matni to'g'ri bo'lishi uchun |
| 3 | Push bosilganda `notificationId` ni `POST /read` ga yuborish | §2.1 — aks holda `unreadCount` yolg'on ko'rsatadi |
| 4 | `targetType`/`targetId` bo'yicha navigatsiya | Hozir faqat `conversationId` o'qiladi |
| 5 | Javob: talaba e'lonlari moderatsiyadan o'tsinmi? | №6/№7 shunga bog'liq |
| 6 | Javob: kurs yili bo'yicha moslik kerakmi? | Kerak bo'lsa e'longa maydon qo'shamiz |

1–4 bandlarsiz ham **hech narsa buzilmaydi** — chat push'i bugungidek ishlayveradi, qolgan turlar
tray'da to'g'ri ko'rinadi va bosilganda ilovani ochadi.

---

## 10. Testlar

63 ta unit test. Eng muhimlari:

- **Tungi jimlik** — 22:00, 23:59, 00:01, 03:00, 07:59 jim; 08:00, 12:00, 21:59 jim emas. Yarim
  tundan o'tuvchi oyna alohida tekshiriladi (`hour >= 22 && hour < 8` — har doim `false`, bu esa
  jimlikni butunlay o'chirib qo'yardi).
- **Har bir yetkazish qoidasi** — oflayn/onlayn, push so'ramaydigan hodisa, Redis o'lgan holat,
  shoshilinch hodisa tunda ham ketishi.
- **`data` konverti** — kalitlar `string`, yo'q kalitlar tushib qolishi, chaqiruvchi kalitlari
  konvertni ustidan yoza olmasligi, `conversationId` saqlanishi.
- **Kechiktirilgan push** — belgi yuborishdan **oldin** tozalanishi (aks holda muvaffaqiyatsiz push
  har flushda abadiy qayta urinilardi).
