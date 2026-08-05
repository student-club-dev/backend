# Qolgan ishlar — backend javobi

Uchta topshiriqdan **ikkitasi bajarildi** (1 va 2 — kod tomoni).

⚠️ Uchinchisi — kechqurungi sinovingiz. Tashxisingiz to'g'ri edi, lekin **siz sinagan
konfiguratsiya endi yo'q**: TURN provayderi almashtirildi va biz sizga aytmadik.
**§3 ni birinchi o'qing va qo'ng'iroqni qayta sinang.**

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.
> Kotlin klientini qayta generatsiya qiling.

| # | Ish | Holat |
|---|---|---|
| 1 | `albumSize` | ✅ **bajarildi** — endi yuborsangiz bo'ladi |
| 2 | `UserProfileDto` ga `regionId`/`districtId` | ✅ **bajarildi** — qaytadi |
| 3 | Qo'ng'iroq media qismi | ⚠️ **qayta sinang** — TURN provayderi almashtirildi, §3 |

---

## 1. `albumSize` — tayyor

Haqsiz edingiz: maydon yo'q edi, va `forbidNonWhitelisted` uni yuborishning o'zini `422` qilardi.
Ya'ni «matn yaxshilanmaydi» emas, **albom umuman yuborilmasdi**. Endi bor.

```jsonc
// SendMessageDto (REST) va WS `message:send` — ikkalasida ham
{
  "type": "IMAGE",
  "mediaId": "med_…",
  "albumId": "cmid_01H…",
  "albumSize": 10          // int32, ixtiyoriy, 2..10
}
```

So'raganingizdek:

- **Ixtiyoriy** — yubormasangiz hammasi bugungidek ishlayveradi;
- **Faqat birinchi xabarda** — push aynan o'shanda ketadi;
- `albumId` siz yuborilsa — **e'tiborsiz qoldiriladi**, `422` emas. Siz «farqi yo'q» degandingiz;
  biz yumshoq variantni tanladik: qiymat mavjud bo'lmagan guruhlashni tasvirlaydi, va begona
  maydon uchun butun yuborishni yiqitish yomonroq natija;
- Spec'da: `{"type":"integer","format":"int32","minimum":2,"maximum":10}`.

### Nima uchun 2 dan boshlanadi

Bitta rasmli «albom» — albom emas, va u uchun bir dona rasm matni allaqachon to'g'ri. `1` yuborilsa
`422`.

### Qabul mezonlari — 3/3

- [x] `albumSize` bilan yuborilgan albom xabari `422` bermaydi
- [x] 10 rasmli albomga **1 ta push**, matni `📷 10 ta rasm`
- [x] `albumSize` siz yuborilgan albom bugungidek ishlaydi (matn — birinchi rasmniki)

### Qo'shimcha: `MessageDto` da ham qaytadi

So'ramagansiz, lekin qo'shdik — `albumId` qaytgani kabi. Albom kartasini chizishda foydali bo'lishi
mumkin; birinchi xabarda son, qolganlarida `null`.

### Bir nozik joy

`albumSize` **e'lon qilinadi, sanalmaydi**. Push ketayotgan paytda albomdan faqat birinchi rasm
kelgan bo'ladi — qolganlari hali yo'lda. Shuning uchun `countInAlbum` har doim `1` deb javob
berardi, va bu maydonsiz bildirishnoma faqat bitta rasmni tasvirlay olardi. Aynan shuning uchun
sizning so'rovingiz to'g'ri edi va boshqa yo'l yo'q edi.

---

## 2. `UserProfileDto` — manzil endi qaytadi

```jsonc
// GET /v1/profile/me
{
  "regionId":   "TOSHKENT_SHAHRI",   // nullable
  "districtId": "CHILONZOR"          // nullable
}
```

**`keepingLocalAddress()` ni o'chirsangiz bo'ladi.**

### Qabul mezonlari — 2/2

- [x] `PUT /v1/profile/me` bilan yozilgan manzil `GET /v1/profile/me` da qaytadi
- [x] To'ldirilmagan profilda ikkalasi ham `null`

### ⚠️ Aslida ikkita nuqson bor edi, bittasi emas

Siz «javobga ikkita maydon qo'shish» dedingiz. Tekshirganda ma'lum bo'ldiki, muammo undan
chuqurroq: **qiymat umuman saqlanmayotgan ekan**.

`toStudentUpdateData()` — `ProfilePatch` ni Prisma'ga o'giradigan mapper — `regionId`/`districtId`
ni o'tkazmasdi. Ya'ni `PUT` `200` qaytarardi, DTO qabul qilardi, servis patch'ga qo'yardi, lekin
bazaga **hech qachon yozilmasdi**.

Siz buni sezmagansiz, chunki `keepingLocalAddress()` ekranni to'g'ri ko'rsatib turardi. Agar biz
faqat «javobga ikki maydon» qo'shganimizda, u hamon `null` qaytarardi va sabab topilmasdi.

Uni e2e test topdi (yozish → o'qish, haqiqiy baza ustida), va endi o'sha test uni qo'riqlaydi.

### Boshqa tekshirilgan holatlar

- Manzilni eslatmaydigan yangilanish (`{firstName}`) uni **o'chirmaydi**;
- Seed'da hali yo'q id qabul qilinadi — FK emas, ya'ni sizning GeoCatalog'ingiz bizning seed'dan
  oldinda ketsa ham ishlaydi.

---

## 3. Qo'ng'iroq — siz sinagan konfiguratsiya **endi yo'q**

Kechqurungi sinovingiz uchun rahmat. Tashxisingiz **to'g'ri** edi — lekin siz sinagan holat
o'shandan keyin o'zgardi va biz sizga aytmadik. Ayb bizda.

### Nima o'zgardi

Backend ikkita TURN provayderini qo'llab-quvvatlaydi va tanlov bitta env o'zgaruvchisida:

| | siz sinaganda | endi |
|---|---|---|
| `ICE_PROVIDER` | `static` (coturn) | **`metered`** |
| TURN hostlari | `turn.studentclub.uz` — **mavjud emas edi** | `global.relay.metered.ca` — **ishlaydi** |
| Kerak bo'lgani | server + IP + DNS + sertifikat | faqat kalit |

Metered yo'li backend'da boshidanoq yozilgan va sinalgan (`ice-profile.ts`) — biz shunchaki
runbook'da faqat coturn'ni yozgan ekanmiz va sizga bu variantni aytmaganmiz. Shundan
«`turn.studentclub.uz` kerak, DNS yozuvi yo'q» degan tugun paydo bo'lgan.

**`turn.studentclub.uz` endi umuman kerak emas.** Alohida IP ham, sertifikat ham, coturn ham.

### ⚠️ Qayta sinang — lekin avval buni tekshiring

```bash
curl -H "Authorization: Bearer <access>" https://api.studentclub.uz/v1/calls/ice-servers
```

`urls` ichida `global.relay.metered.ca` ko'rinishi kerak. Agar hamon `turn.studentclub.uz`
chiqsa — deploy hali yetib bormagan, bizga ayting.

### Tashxisingiz to'g'ri edi — va u o'ylaganingizdan ham jiddiyroq

Buni yozib qo'yamiz, chunki TURN kelajakda yana ishdan chiqsa aynan shu takrorlanadi.

Siz «birinchi qo'ng'iroq hech qachon ulanmaydi» dedingiz. Aslida **hech qanday qo'ng'iroq
ulanmasdi**, va bu o'zini tuzata olmaydigan tugun edi:

1. Birinchi qo'ng'iroq → `relayOnly = true` (`calls.service.ts:153` — tasdiqladik, qoida aynan
   siz yozganingizdek) → relay nomzod yo'q → media ulanmaydi;
2. 30 soniyadan keyin connect-timeout → qo'ng'iroq **`FAILED`** bo'lib yopiladi
   (`calls.service.ts:723`);
3. `relayOnly` ni bekor qiladigan shart esa `status = ENDED` **va** `answeredAt != null`
   (`call.prisma.repository.ts:101`) — `FAILED` bunga kirmaydi;
4. Demak keyingi qo'ng'iroq ham `relayOnly = true` → 1-banddan qaytadan.

Ya'ni «ikkinchi qo'ng'iroq ishlab ketadi» degan chiqish yo'li yo'q edi: chiqish sharti —
muvaffaqiyatli qo'ng'iroq, u esa hech qachon bo'lolmasdi.

### Sizning «`turn:` qatorini qo'shmang» taklifingiz

Asosi haqiqiy va biz uni yodda tutamiz: backend TURN hostini **tekshirmasdan** e'lon qilardi, ya'ni
javob **da'vo** edi, fakt emas. Aynan shu qo'ng'iroqni jimgina yiqitdi.

Lekin uni bajarish maxfiylik himoyasini o'chirish degani bo'lardi — `turn:` bo'lmasa siz relay'ni
majburlamaysiz va javob bermagan odam chaquvchining IP'sini ko'radi. Metered bilan savolning o'zi
tug'ilmaydi: TURN haqiqatan bor, relay ishlaydi, himoya joyida.

### Sizga ta'siri — deyarli yo'q

Siz `ice-servers` javobini o'qiysiz va uni `RTCConfiguration` ga berasiz; provayder kimligi
klientga ko'rinmaydi.

⚠️ Bitta tekshiruv: hostlar endi `turn.studentclub.uz` **emas**. Agar biror joyda o'sha nomni
qattiq yozib qo'ygan bo'lsangiz — olib tashlang.

### coturn keyinroq, va shoshilinch emas

Metered kredensiali bitta va uzoq umrli — chiqib ketsa qo'lda almashtirmagunimizcha yashaydi, va
relay trafigini kim yeyayotganini cheklab bo'lmaydi. coturn har talabaga 1 soatda eskiradigan
alohida kredensial beradi. Bu **sifat yaxshilanishi**; o'tganimizda sizda hech narsa o'zgarmaydi
(bitta env qatori, javob shakli o'sha-o'sha).

---

## Sizning uchta qaroringiz qabul qilindi

1. **№6/№7 (e'lon moderatsiyasi) katalogdan olib tashlandi.** Aslida ular hech qachon yozilmagan
   edi — biz ularni «manba yo'q» deb qoldirgandik. Endi bu **yopilgan qaror** sifatida kodda ham
   yozilgan, ya'ni keyinroq kimdir «nega yo'q?» deb qayta ochmaydi.
2. **Kurs yili bo'yicha moslik qo'shilmadi.** `JobDetails` tegilmadi.
3. **`notification:new` WebSocket hodisasi qo'shilmadi.**

---

## Sizning uchta chetlanishingiz — hammasi to'g'ri

Javob talab qilmaysiz, lekin tasdiqlaymiz:

**`cleanSwagger` 12-qadami qoldirilgani — to'g'ri qaror.** Siz aytgan nuqson haqiqiy: OpenAPI 3.0
`oneOf` ni generator ko'pincha bitta yassi klassga yig'adi va diskriminator enum'ida oxirgi variant
qoladi. Bu `MessageType`/`CALL` nuqsonining aynan o'zi. Bizda `oneOf` to'g'ri chiqarilyapti, lekin
generator tomonini siz yaxshiroq bilasiz — o'zingiz bilganday qiling.

**`complete` tanasini doim yuborish — to'g'ri.** Biz ham shuni tavsiya qilardik.

**`tokenType` ni doim aniq yuborish — to'g'ri, va bizning sukutimizdan yaxshiroq.** Siz aytgan sabab
o'rinli: sukut serverning ichki qarori va o'zgarishi mumkin.

**`GET /v1/calls/active` ni osilib qolgan jiringlashni yopish uchun ishlatish** — endpointning eng
foydali qo'llanishi. `ActiveCallDto` ga offer qo'shmaymiz, kelishildi.

---

## Sizdan kutilayotgani

| # | Ish |
|---|---|
| 1 | `student-club.json` ni yangilash |
| 2 | Albomning birinchi xabariga `albumSize` qo'shish |
| 3 | `keepingLocalAddress()` ni o'chirish, `toDomain()` ga ikki qator qo'shish |
| 4 | Klientda `turn.studentclub.uz` qattiq yozib qo'yilgan joy bormi — tekshiring va olib tashlang (§3) |
| 5 | **Qo'ng'iroqni qayta sinash** — avvalgi sinov eski konfiguratsiyada bo'lgan (§3) |

coturn bo'yicha sizdan **hech narsa talab qilinmaydi** — u endi sizni bloklamaydi.

---

## Testlar

**Unit**: 1747 o'tdi (7 tasi yangi — `albumSize` validatsiyasi: 2..10 chegaralari, satr shakli,
`albumId` siz yuborilishi, butun son bo'lmasligi).

**Gateway**: 4 ta yangi test — `📷 10 ta rasm` matni, `albumSize` siz eski matn, sarlavha hamon
yuboruvchining ismi, va albomning **qolgan rasmlariga push ketmasligi**.

**E2e**: 250 o'tdi. Profil manzili uchun yangi fayl — yozish → o'qish → bazada tekshirish →
tegilmagan yangilanishdan omon qolish → seed'da yo'q id.
